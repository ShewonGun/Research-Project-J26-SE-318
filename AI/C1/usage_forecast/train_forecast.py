"""
AquaFlow — daily water-usage forecast, 1-7 days ahead.

Data (either):
  * ../data/simdeum/out_forecast/H01..H30/1min.csv — 10 weeks of NORMAL use (no leaks), made with
      python ../data/simdeum/generate_simdeum_households.py --start 2026-07-01 --end 2026-09-09 \
             --micro-leaks 0 --bursts 0 --seed 7 --out out_forecast
    The simulator redraws each day independently: no weekly pattern, no day-to-day memory.
  * --daily-csv data/patterned_daily.csv — the same households with ASSUMED patterns added
    (weekend uplift, absence/guest spells, drift); see make_patterned_daily.py.
  * --daily-csv data/patterned_weather_daily.csv --calendar — the same plus ASSUMED reactions to the
    REAL weather and public holidays of those dates (hot, rainy, holiday), to show the pipeline learns them.

Task: at the end of day d, predict litres used on days d+1 ... d+7 from the household's own
past daily totals only (no house type / people count — a real device doesn't know them).
Features are relative to the household's recent median, so one model serves any household size.
With --calendar the target day's weather (max temperature, rain) and holiday flags (calendar_features.py)
are extra inputs; the script then compares the model with and without them.

Compared on households the model never saw (6-fold CV by household; test = each held-out
household's last 21 days of forecast origins):
  baseline_week   same weekday last week
  baseline_mean7  mean of the last 7 days
  gbm             gradient boosting on relative lag features, one model for all horizons
  gbm_cal         the same plus weather / holiday inputs (--calendar)
The 80 % range is the model +/- the 80th percentile of |error| at that horizon, measured on the OTHER
folds (so the reported coverage is honest).

Usage:  python train_forecast.py                                          -> results/
        python train_forecast.py --daily-csv data/patterned_daily.csv      -> results_patterned/
        python train_forecast.py --daily-csv data/patterned_weather_daily.csv --calendar -> results_weather/
"""
import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

import calendar_features as cf

HERE = Path(__file__).resolve().parent
LOCAL_TZ = "Asia/Colombo"
HORIZONS = range(1, 8)
LAGS = 14                 # days of history used
MIN_HISTORY = LAGS        # origins need this many past days
TEST_DAYS = 21
CAL_FEATURES = cf.CALENDAR_COLUMNS      # tmax, rain_mm, is_rainy, is_holiday, near_holiday
NON_FEATURES = ("origin", "scale", "target", "target_ratio", "baseline_week", "baseline_mean7", "home")


def load_daily(folder):
    """Household folder -> Series of litres per LOCAL calendar day (complete days only)."""
    df = pd.read_csv(Path(folder) / "1min.csv", usecols=["timestamp", "volume"], parse_dates=["timestamp"])
    s = df.set_index("timestamp")["volume"].tz_convert(LOCAL_TZ)
    d = s.resample("1D").sum()
    cnt = s.resample("1D").count()
    return d[cnt >= 1380].rename_axis("day")           # drop partial first/last days


def features_at(hist, target_day, h, cal=None):
    """Features for predicting `target_day` (h days after the origin) from `hist`
    (hist[0] = origin day, hist[k] = k days earlier). Everything is relative to the recent median.
    `cal` (optional): dict with the CAL_FEATURES of the target day."""
    scale = max(float(np.median(hist)), 1.0)
    tdow = target_day.dayofweek
    r = hist / scale
    feat = {
        "h": h, "tdow_sin": np.sin(2 * np.pi * tdow / 7), "tdow_cos": np.cos(2 * np.pi * tdow / 7),
        "is_weekend": int(tdow >= 5),
        "mean7": r[:7].mean(), "std7": r[:7].std(), "mean14": r.mean(),
        "min3": r[:3].min(), "last_week_same_day": r[7 - h],   # the day 7 days before the target
        **{f"lag{k}": r[k] for k in range(len(hist))},
    }
    if cal is not None:
        feat.update({c: float(cal[c]) for c in CAL_FEATURES})
    return feat, scale


def make_rows(daily, cal=None):
    """One row per (origin day, horizon): features known at the origin + the target.
    `cal`: optional DataFrame indexed by ISO date string with CAL_FEATURES."""
    v = daily.values
    days = daily.index
    rows = []
    for i in range(MIN_HISTORY - 1, len(v)):
        hist = v[i - LAGS + 1:i + 1][::-1]
        for h in HORIZONS:
            if i + h >= len(v):
                continue
            c = None if cal is None else cal.loc[days[i + h].date().isoformat()]
            feat, scale = features_at(hist, days[i + h], h, c)
            rows.append({"origin": days[i], "scale": scale, "target": v[i + h], "target_ratio": v[i + h] / scale,
                         "baseline_week": hist[7 - h], "baseline_mean7": hist[:7].mean(), **feat})
    return pd.DataFrame(rows)


def metrics(df, col):
    e = (df[col] - df["target"]).abs()
    return {"mae": e.mean(), "mape": (e / df["target"].clip(lower=1)).mean() * 100}


def new_model():
    return HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, random_state=0)


def cross_validate(R, feats, folds, cutoff, col):
    """Fill R[col] with out-of-fold predictions (litres) for the test rows; return the fold id per row."""
    R[col] = np.nan
    fold = pd.Series(-1, index=R.index)
    for k, test_h in enumerate(folds):
        te = R["home"].isin(test_h) & (R["origin"] > cutoff)
        tr = ~R["home"].isin(test_h)
        m = new_model().fit(R.loc[tr, feats], R.loc[tr, "target_ratio"])
        R.loc[te, col] = m.predict(R.loc[te, feats]) * R.loc[te, "scale"]
        fold[te] = k
    return fold


def honest_range(T, col, n_folds):
    """80 % range per row from the OTHER folds' errors; also the half-widths for the final model."""
    lo, hi = pd.Series(np.nan, index=T.index), pd.Series(np.nan, index=T.index)
    for k in range(n_folds):
        for h in HORIZONS:
            other = T[(T.fold != k) & (T.h == h)]
            q = (other[col] - other["target"]).abs().quantile(0.8)
            sel = (T.fold == k) & (T.h == h)
            lo[sel] = (T.loc[sel, col] - q).clip(lower=0)
            hi[sel] = T.loc[sel, col] + q
    half = {int(h): float((T[T.h == h][col] - T[T.h == h]["target"]).abs().quantile(0.8)) for h in HORIZONS}
    return lo, hi, half


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE.parent / "data" / "simdeum" / "out_forecast"))
    ap.add_argument("--daily-csv", help="daily-litres CSV (home, day, litres, house_type) instead of the minute files")
    ap.add_argument("--calendar", action="store_true", help="add real weather + holiday inputs and compare with / without them")
    ap.add_argument("--out", default=None, help="default results/ (results_patterned/ with --daily-csv, results_weather/ with --calendar)")
    a = ap.parse_args()
    default_out = "results_weather" if a.calendar else ("results_patterned" if a.daily_csv else "results")
    out = Path(a.out or HERE / default_out)
    out.mkdir(exist_ok=True, parents=True)

    series = {}
    if a.daily_csv:
        dd = pd.read_csv(a.daily_csv, parse_dates=["day"])
        homes = sorted(dd["home"].unique())
        info = dd.drop_duplicates("home").set_index("home")[["house_type"]]
        for h in homes:
            series[h] = dd[dd.home == h].set_index("day")["litres"]
    else:
        homes = sorted(p.name for p in Path(a.data).iterdir() if (p / "1min.csv").exists())
        info = pd.read_csv(Path(a.data) / "households.csv").set_index("household_id")
        for h in homes:
            series[h] = load_daily(Path(a.data) / h)

    cal = None
    if a.calendar:
        all_days = sorted({d.date() for s in series.values() for d in s.index})
        cal = cf.table_for(all_days)
        print(f"calendar inputs for {len(all_days)} days: {int(cal.is_holiday.sum())} holidays, {int(cal.is_rainy.sum())} rainy days, "
              f"max temp {cal.tmax.min():.1f}-{cal.tmax.max():.1f} C")

    rows = []
    for h in homes:
        r = make_rows(series[h], cal)
        r["home"] = h
        rows.append(r)
    R = pd.concat(rows, ignore_index=True)
    feats_cal = [c for c in R.columns if c not in NON_FEATURES]
    feats = [c for c in feats_cal if c not in CAL_FEATURES]
    print(f"{len(homes)} households, {len(R):,} (origin, horizon) rows, {len(feats)} features" + (f" (+{len(CAL_FEATURES)} calendar)" if a.calendar else ""))

    # 6-fold CV by household; test = last TEST_DAYS days of origins of the held-out homes.
    folds = [homes[i::6] for i in range(6)]
    cutoff = R.groupby("home")["origin"].transform("max") - pd.Timedelta(days=TEST_DAYS)
    R["fold"] = cross_validate(R, feats, folds, cutoff, "gbm")
    models = ["gbm"]
    if a.calendar:
        cross_validate(R, feats_cal, folds, cutoff, "gbm_cal")
        models.append("gbm_cal")
    T = R.dropna(subset=["gbm"]).copy()
    ranges = {}
    for m in models:
        T[f"lo_{m}"], T[f"hi_{m}"], ranges[m] = honest_range(T, m, len(folds))
    T["lo"], T["hi"] = T["lo_gbm"], T["hi_gbm"]

    names = ["baseline_week", "baseline_mean7"] + models
    table = [{"model": n, **{f"h{h}_mae": metrics(T[T.h == h], n)["mae"] for h in HORIZONS}, **metrics(T, n)} for n in names]
    res = pd.DataFrame(table).set_index("model").round(2)
    res.to_csv(out / "forecast_metrics.csv")
    cover = {m: float(((T["target"] >= T[f"lo_{m}"]) & (T["target"] <= T[f"hi_{m}"])).mean()) for m in models}
    print(res.to_string())
    print("\n80% range coverage: " + ", ".join(f"{m} {c:.0%}" for m, c in cover.items()))

    # Totals over the next n days (what the run-out date and the bill estimate use).
    tot = []
    for n in (3, 7):
        sub = T[T.h <= n].groupby(["home", "origin"]).filter(lambda x, n=n: len(x) == n)
        agg = sub.groupby(["home", "origin"])[["target"] + names].sum()
        for name in names:
            err = (agg[name] - agg["target"]).abs()
            tot.append({"next_days": n, "model": name, "mae_litres": round(err.mean(), 1),
                        "mape_pct": round((err / agg["target"].clip(lower=1)).mean() * 100, 1)})
    tot = pd.DataFrame(tot)
    tot.to_csv(out / "forecast_totals.csv", index=False)
    print("\nTotals over the next n days:\n" + tot.to_string(index=False))

    T["type"] = T["home"].map(info["house_type"])
    by_type = pd.DataFrame({t: metrics(g, "gbm") for t, g in T.groupby("type")}).T.round(2)
    by_type["baseline_mean7_mae"] = [round(metrics(g, "baseline_mean7")["mae"], 2) for _, g in T.groupby("type")]
    print("\nBy house type (gbm):\n" + by_type.to_string())

    # Final models on all households
    final = new_model().fit(R[feats], R["target_ratio"])
    joblib.dump({"model": final, "features": feats, "lags": LAGS, "uses_calendar": False, "range_halfwidth_80": ranges["gbm"]},
                out / "forecast_model.joblib")
    importance = None
    if a.calendar:
        final_cal = new_model().fit(R[feats_cal], R["target_ratio"])
        joblib.dump({"model": final_cal, "features": feats_cal, "lags": LAGS, "uses_calendar": True,
                     "range_halfwidth_80": ranges["gbm_cal"]}, out / "forecast_model_calendar.joblib")
        # How much does each calendar input matter? (increase in error when shuffled, on the test rows)
        from sklearn.inspection import permutation_importance
        te = R.dropna(subset=["gbm_cal"]).sample(min(3000, int(R["gbm_cal"].notna().sum())), random_state=0)
        pi = permutation_importance(final_cal, te[feats_cal], te["target_ratio"], n_repeats=5, random_state=0, scoring="neg_mean_absolute_error")
        importance = pd.Series(pi.importances_mean, index=feats_cal).sort_values(ascending=False)
        importance.to_csv(out / "feature_importance.csv", header=["importance"])
        print("\nTop inputs (permutation importance):\n" + importance.head(8).round(4).to_string())

    keep = ["home", "origin", "h", "target", "baseline_week", "baseline_mean7"] + models + ["lo", "hi"]
    T[keep].to_csv(out / "forecast_test_predictions.csv", index=False)
    (out / "summary.json").write_text(json.dumps({"households": len(homes), "test_rows": int(len(T)), "coverage_80": {k: round(v, 3) for k, v in cover.items()},
                                                  "metrics": res.reset_index().to_dict("records"), "totals": tot.to_dict("records")}, indent=2, default=float))
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    main()
