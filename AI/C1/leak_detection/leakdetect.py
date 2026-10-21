"""
AquaFlow leak / burst detection — shared code for train_leak_model.py and the Colab notebook.

  load_household / load_real_readings   → per-minute series on a complete 1-minute grid
  make_features                         → trailing-window features (past data only)
  fit_model / class_scores              → Random Forest, gradient boosting or Isolation Forest
  tune_alarm / alarms                   → turn per-minute scores into alarms
  evaluate_events / summarise           → event-level metrics (caught, delay, false alarms/day)
  rule_baseline                         → the current backend rules (backend/utils/leakDetection.js)
  charts                                → slide-ready PNGs
"""
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest, RandomForestClassifier

LOCAL_TZ = "Asia/Colombo"
IDLE_LPM = 0.1      # a minute averaging below this is "idle" (the loop's idle noise is ~0.03)
HIGH_LPM = 2.5      # pump-level flow (the loop's pump delivers ~3.5 L/min)
GRACE_MIN = 30      # an alarm within 30 min after an anomaly ends is not a false alarm
CLASSES = ["normal", "micro_leak", "burst"]

# Current backend rules (backend/utils/leakDetection.js), for the baseline.
RULE_BURST_LPM = 30
RULE_MICRO = (0.15, 2.5)
RULE_MICRO_MIN_SAMPLES = 12


# ── Loading ─────────────────────────────────────────────────────────────────
def _complete_grid(df):
    """Reindex to every minute; carry values over short gaps (≤ 2 min) so a lost reading
    doesn't interrupt a burst; longer gaps count as idle."""
    full = pd.date_range(df.index[0], df.index[-1], freq="1min")
    df = df.reindex(full)
    for col in ["flowRateMean", "flowRateMax", "volume"]:
        df[col] = df[col].ffill(limit=2).fillna(0.0)
    df["readings"] = df["readings"].fillna(0)
    return df


def read_events(path):
    """Ground-truth anomalies from an events.csv: DataFrame[start, end, type, label]."""
    ev = pd.read_csv(path, parse_dates=["start", "end"])
    return ev[ev["label"] != "normal"][["start", "end", "type", "label"]].reset_index(drop=True)


def load_household(folder):
    """A simulated household folder (1min.csv + events.csv) → (minutes, anomaly events)."""
    folder = Path(folder)
    df = pd.read_csv(folder / "1min.csv", parse_dates=["timestamp"]).set_index("timestamp").sort_index()
    df = _complete_grid(df)
    df["label"] = df["label"].ffill(limit=2).fillna("normal")
    return df, read_events(folder / "events.csv")


def load_single_file(minute_csv, events_csv):
    """The original single-household generator's files (../data/loop_household/out)."""
    df = pd.read_csv(minute_csv, parse_dates=["timestamp"]).set_index("timestamp").sort_index()
    df = _complete_grid(df)
    df["label"] = df["label"].ffill(limit=2).fillna("normal")
    return df, read_events(events_csv)


def load_real_readings(readings_csv, events_csv=None):
    """REAL readings exported from MongoDB (columns: timestamp, flowRate, volume) →
    per-minute series. `events_csv` (optional) lists staged anomalies with columns
    start, end, type, label (label = burst or micro_leak), times in UTC or with offset."""
    events = pd.DataFrame(columns=["start", "end", "type", "label"])
    if events_csv:
        events = pd.read_csv(events_csv)
        events["start"] = pd.to_datetime(events["start"], utc=True)
        events["end"] = pd.to_datetime(events["end"], utc=True)
    return readings_to_minutes(read_readings(readings_csv), events), events


def read_readings(readings_csv):
    """Raw readings CSV (e.g. a MongoDB export) → DataFrame[timestamp (UTC), flowRate, volume]."""
    r = pd.read_csv(readings_csv)
    r["timestamp"] = pd.to_datetime(r["timestamp"], utc=True, format="mixed")
    return r[["timestamp", "flowRate", "volume"]].sort_values("timestamp").reset_index(drop=True)


def readings_to_minutes(r, events=None):
    """Raw readings → per-minute series on a complete grid, labelled from `events`."""
    g = r.set_index("timestamp").resample("1min")
    df = pd.DataFrame({"flowRateMean": g["flowRate"].mean(), "flowRateMax": g["flowRate"].max(),
                       "volume": g["volume"].sum(), "readings": g["flowRate"].count()})
    df = df[df["readings"] > 0]
    df = _complete_grid(df)
    df["label"] = "normal"
    for e in (events.itertuples() if events is not None else []):
        df.loc[e.start:e.end, "label"] = e.label
    return df


# ── Features (trailing windows only: at minute t, only minutes ≤ t are used) ──
def run_length(cond):
    """Minutes the condition has been continuously true, ending at each minute (array)."""
    c = np.asarray(cond, dtype=bool)
    idx = np.arange(len(c))
    last_false = np.maximum.accumulate(np.where(c, -1, idx))
    return idx - last_false


FEATURE_GROUPS = {
    # How continuous the flow is — the core leak signal, independent of flow level and time.
    "continuity": ["run_flowing", "run_high", "since_quiet10", "since_quiet30",
                   "idle_frac_10", "idle_frac_30", "idle_frac_60", "idle_frac_180",
                   "min_10", "min_30", "min_60", "min_180",
                   "high_frac_10", "high_frac_30", "high_frac_60", "switches_60"],
    # How much water flows.
    "level": ["flow_now", "mean_10", "mean_30", "mean_60", "std_10", "std_30", "std_60",
              "max_10", "volume_60"],
    # Time of day (local).
    "time": ["hour_sin", "hour_cos"],
    # Compared with THIS house's own last week (excluding the most recent day) — the
    # house-specific part: a night-shift house's normal night use stays near its baseline.
    "baseline": ["d_idle_60", "d_idle_180", "d_min_60", "d_high_60", "d_since_quiet10"],
}
FEATURE_SETS = {
    "all": ["continuity", "level", "time", "baseline"],
    "no_time": ["continuity", "level", "baseline"],
    "no_time_no_level": ["continuity", "baseline"],
    "no_baseline": ["continuity", "level", "time"],
}


def columns_for(feature_set):
    return [c for g in FEATURE_SETS[feature_set] for c in FEATURE_GROUPS[g]]


def make_features(df):
    f = df["flowRateMean"]
    flowing = f >= IDLE_LPM
    high = f >= HIGH_LPM
    X = pd.DataFrame(index=df.index)

    X["run_flowing"] = run_length(flowing).clip(max=720)
    X["run_high"] = run_length(high).clip(max=180)
    quiet10 = run_length(~flowing) >= 10
    quiet30 = run_length(~flowing) >= 30
    X["since_quiet10"] = run_length(~quiet10).clip(max=720)   # minutes since the house was last quiet ≥ 10 min
    X["since_quiet30"] = run_length(~quiet30).clip(max=720)
    for w in (10, 30, 60, 180):
        X[f"idle_frac_{w}"] = (~flowing).astype(float).rolling(w, min_periods=1).mean()
        X[f"min_{w}"] = f.rolling(w, min_periods=1).min()
    for w in (10, 30, 60):
        X[f"high_frac_{w}"] = high.astype(float).rolling(w, min_periods=1).mean()
    X["switches_60"] = flowing.astype(int).diff().abs().fillna(0).rolling(60, min_periods=1).sum()  # on/off cycles

    X["flow_now"] = f
    for w in (10, 30, 60):
        X[f"mean_{w}"] = f.rolling(w, min_periods=1).mean()
        X[f"std_{w}"] = f.rolling(w, min_periods=1).std().fillna(0)
    X["max_10"] = df["flowRateMax"].rolling(10, min_periods=1).max()
    X["volume_60"] = df["volume"].rolling(60, min_periods=1).sum()

    local = df.index.tz_convert(LOCAL_TZ)
    hour = local.hour + local.minute / 60
    X["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    X["hour_cos"] = np.cos(2 * np.pi * hour / 24)

    # House baseline: mean over the previous 7 days, ending 1 day ago (so a leak running
    # now doesn't contaminate it). Needs ≥ 1 day of history; before that the difference is 0.
    def baseline(s):
        return s.rolling(7 * 1440, min_periods=1440).mean().shift(1440)
    for name, s in [("d_idle_60", X["idle_frac_60"]), ("d_idle_180", X["idle_frac_180"]),
                    ("d_min_60", X["min_60"]), ("d_high_60", X["high_frac_60"]),
                    ("d_since_quiet10", X["since_quiet10"])]:
        X[name] = (s - baseline(s)).fillna(0.0)
    return X


# ── Models ──────────────────────────────────────────────────────────────────
def fit_model(kind, X, y, seed=0):
    """kind: 'rf' (Random Forest), 'hgb' (gradient boosting) or 'iforest' (unsupervised,
    fitted on NORMAL minutes only — needs no leak labels)."""
    if kind == "rf":
        m = RandomForestClassifier(n_estimators=150, min_samples_leaf=20, class_weight="balanced_subsample",
                                   n_jobs=-1, random_state=seed)
    elif kind == "hgb":
        m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=31,
                                           class_weight="balanced", random_state=seed)
    elif kind == "iforest":
        m = IsolationForest(n_estimators=200, max_samples=4096, random_state=seed, n_jobs=-1)
        m.fit(X[(y == "normal").values])
        # Calibrate the anomaly score to "fraction of normal training minutes scoring lower".
        ref = -m.score_samples(X[(y == "normal").values].sample(min(50_000, int((y == "normal").sum())),
                                                                 random_state=seed))
        m.ref_scores_ = np.sort(ref)
        return m
    else:
        raise ValueError(kind)
    m.fit(X, y)
    return m


def class_scores(model, X):
    """Per-minute scores: {'micro_leak': ..., 'burst': ...} for a classifier, or
    {'any': ...} for Isolation Forest (0..1, higher = more anomalous)."""
    if isinstance(model, IsolationForest):
        s = -model.score_samples(X)
        return {"any": pd.Series(np.searchsorted(model.ref_scores_, s) / len(model.ref_scores_), index=X.index)}
    p = model.predict_proba(X)
    cls = list(model.classes_)
    return {c: pd.Series(p[:, cls.index(c)], index=X.index) for c in ("micro_leak", "burst") if c in cls}


# ── Alarms and event-level evaluation ───────────────────────────────────────
def alarms(score, threshold, persist):
    """Alarm active at minute t when score ≥ threshold for `persist` consecutive minutes."""
    return pd.Series(run_length(score.values >= threshold) >= persist, index=score.index)


def _episodes(flags):
    a = np.r_[0, np.asarray(flags, dtype=np.int8), 0]
    d = np.flatnonzero(np.diff(a))
    return list(zip(d[::2], d[1::2]))


def evaluate_events(index, events, alarm, label=None):
    """Event-level results for one household and one detector.
      events : DataFrame[start, end, type, label] — ground-truth anomalies
      alarm  : boolean Series on `index`
      label  : evaluate only events with this label (None = all)
    An event is caught if the alarm is active at any minute between its start and end;
    delay = first alarm minute − start. An alarm episode overlapping no anomaly (of ANY
    label, ± GRACE_MIN after it) is a false alarm."""
    al = alarm.values
    near = np.zeros(len(index), dtype=bool)
    rows = []
    for e in events.itertuples():
        s = index.searchsorted(e.start)
        t = index.searchsorted(e.end, side="right")
        near[s:min(len(index), t + GRACE_MIN)] = True
        if label is None or e.label == label:
            hit = np.flatnonzero(al[s:t])
            rows.append({"type": e.type, "label": e.label, "minutes": int(t - s), "caught": bool(len(hit)),
                         "delay_min": int(hit[0]) if len(hit) else None})
    fa = sum(1 for s, t in _episodes(al) if not near[s:t].any())
    return {"events": rows, "false_alarms": fa, "days": len(index) / 1440}


def summarise(results):
    """Pool several evaluate_events() results into one row of metrics."""
    ev = [e for r in results for e in r["events"]]
    days = sum(r["days"] for r in results)
    out = {"false_alarms_per_day": sum(r["false_alarms"] for r in results) / days if days else np.nan,
           "events": len(ev)}
    for lab in ("micro_leak", "burst"):
        k = [e for e in ev if e["label"] == lab]
        c = [e for e in k if e["caught"]]
        out[f"{lab}_recall"] = len(c) / len(k) if k else np.nan
        out[f"{lab}_caught"] = f"{len(c)}/{len(k)}"
        out[f"{lab}_median_delay"] = float(np.median([e["delay_min"] for e in c])) if c else np.nan
    return out


THRESHOLDS = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98)
PERSISTS = (1, 2, 3, 5, 8, 10, 15, 20, 30)


def tune_alarm(scores_by_house, data, label, fa_budget):
    """Pick (threshold, persist) on VALIDATION households: catch as many `label` events
    as possible while keeping false alarms ≤ fa_budget per day, then the shortest delay.
    If nothing meets the budget, the setting with the fewest false alarms wins."""
    best = None
    for thr in THRESHOLDS:
        for persist in PERSISTS:
            res = [evaluate_events(data[h][0].index, data[h][1], alarms(s, thr, persist), label)
                   for h, s in scores_by_house.items()]
            m = summarise(res)
            labs = ["micro_leak", "burst"] if label is None else [label]
            rec = np.nan_to_num(np.nanmean([m[f"{l}_recall"] for l in labs]))
            delays = [m[f"{l}_median_delay"] for l in labs if m[f"{l}_median_delay"] == m[f"{l}_median_delay"]]
            delay = float(np.mean(delays)) if delays else 1e9
            fa = m["false_alarms_per_day"]
            key = (0, -rec, delay, fa) if fa <= fa_budget else (1, fa, -rec, delay)
            if best is None or key < best[0]:
                best = (key, thr, persist)
    return best[1], best[2]


# ── Baseline: the current backend rules on the raw readings ─────────────────
def rule_baseline(readings_path, minute_index):
    """Per-minute alarm flags from backend/utils/leakDetection.js applied to every reading."""
    r = pd.read_csv(readings_path, usecols=["timestamp", "flowRate"])
    r["timestamp"] = pd.to_datetime(r["timestamp"], utc=True)
    t = r["timestamp"].values.astype("datetime64[ms]").astype(np.int64)
    q = r["flowRate"].values
    in_band = (q >= RULE_MICRO[0]) & (q <= RULE_MICRO[1])
    bad_before = np.r_[0, np.cumsum(~in_band)]           # out-of-band readings before index i
    lo = np.searchsorted(t, t - 60_000, side="left")      # first reading in the last 60 s
    idx = np.arange(len(q))
    n = idx - lo + 1
    all_in_band = (bad_before[idx + 1] - bad_before[lo]) == 0
    micro = in_band & (n >= RULE_MICRO_MIN_SAMPLES) & all_in_band & ((t - t[lo]) >= 48_000)
    flags = pd.Series((q >= RULE_BURST_LPM) | micro, index=r["timestamp"].dt.floor("1min")).groupby(level=0).any()
    return flags.reindex(minute_index, fill_value=False)


# ── Charts (static PNGs for slides) ─────────────────────────────────────────
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA, VIOLET = "#2a78d6", "#eb6834", "#1baf7a", "#6250d6"


def _style(ax, title, ylabel=None):
    ax.set_title(title, loc="left", fontsize=12, color=INK, pad=10)
    if ylabel:
        ax.set_ylabel(ylabel, color=INK2)
    ax.tick_params(colors=INK2, labelsize=9)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def chart_trace(df, events, alarm_by_detector, title, path, pad_hours=3):
    """Flow around one anomaly: true anomaly shaded, each detector's alarm as a strip."""
    import matplotlib.pyplot as plt
    e = events.iloc[0]
    a, b = e.start - pd.Timedelta(hours=pad_hours), e.end + pd.Timedelta(hours=pad_hours)
    w = df.loc[a:b]
    local = w.index.tz_convert(LOCAL_TZ).tz_localize(None)
    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    ax.axvspan(e.start.tz_convert(LOCAL_TZ).tz_localize(None), e.end.tz_convert(LOCAL_TZ).tz_localize(None),
               color=ORANGE, alpha=0.15, lw=0, label=f"True {e.label.replace('_', '-')} ({e.type.replace('_', ' ')})")
    ax.plot(local, w["flowRateMean"], color=BLUE, lw=1.4, label="Flow (L/min, 1-min mean)")
    top = max(1.0, w["flowRateMean"].max()) * 1.15
    for i, (name, al) in enumerate(alarm_by_detector.items()):
        on = al.loc[a:b].values
        y = top + i * top * 0.08
        ax.fill_between(local, y, y + top * 0.05, where=on, color=[VIOLET, AQUA, INK2][i % 3], step="post",
                        lw=0, label=f"Alarm: {name}")
    _style(ax, title, "L/min")
    ax.set_ylim(0, top * (1.1 + 0.08 * len(alarm_by_detector)))
    ax.legend(loc="upper left", fontsize=8, frameon=False, ncol=2)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_bars(table, metric_cols, labels, title, path, ylabel, ylim=None, fmt="{:.0%}"):
    """Grouped bars: one group per row of `table` (index = names), one bar per metric."""
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(8, 4), dpi=150)
    x = np.arange(len(table))
    width = 0.8 / len(metric_cols)
    colors = [BLUE, ORANGE, AQUA, VIOLET]
    for i, (col, lab) in enumerate(zip(metric_cols, labels)):
        vals = table[col].astype(float).values
        bars = ax.bar(x + (i - (len(metric_cols) - 1) / 2) * width, vals, width * 0.92, color=colors[i], label=lab)
        for bar, v in zip(bars, vals):
            if v == v:
                ax.annotate(fmt.format(v), (bar.get_x() + bar.get_width() / 2, bar.get_height()),
                            ha="center", va="bottom", fontsize=8, color=INK2, xytext=(0, 2), textcoords="offset points")
    ax.set_xticks(x, table.index, fontsize=9)
    _style(ax, title, ylabel)
    if ylim:
        ax.set_ylim(*ylim)
    if len(metric_cols) > 1:
        ax.legend(fontsize=8, frameon=False)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_hbar(series, title, path, xlabel, highlight=None):
    """Horizontal bars, largest at top; `highlight` = set of index labels drawn in orange."""
    import matplotlib.pyplot as plt
    s = series.sort_values()
    fig, ax = plt.subplots(figsize=(8, max(3, 0.28 * len(s) + 1)), dpi=150)
    colors = [ORANGE if highlight and k in highlight else BLUE for k in s.index]
    ax.barh(s.index, s.values, color=colors, height=0.7)
    _style(ax, title)
    ax.set_xlabel(xlabel, color=INK2)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
