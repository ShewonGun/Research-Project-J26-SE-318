"""
AquaFlow — train and evaluate leak / burst detectors on the simulated households.

Data: ../data/simdeum/out/H01..H30 (generate with ../data/simdeum/generate_simdeum_households.py)
      ../data/loop_household/out (original single-household generator — extra test from a
                                DIFFERENT simulator)
      --real readings.csv      (optional: REAL readings exported from MongoDB, plus
      --real-events events.csv  optional staged anomalies: start, end, type, label)

What it does:
  1. Features from past data only (see leakdetect.FEATURE_GROUPS).
  2. 6-fold cross-validation BY HOUSEHOLD: each fold tests 5 households the model never
     saw, validates on another 5 (alarm tuning), trains on the other 20. Every household
     is tested exactly once; results are reported as mean ± standard deviation.
  3. Two alarms, tuned separately on the validation households: a burst alarm and a
     micro-leak alarm, each kept under a false-alarm budget (--fa-budget per day).
  4. Compares: Random Forest, gradient boosting, Isolation Forest (unsupervised, no leak
     labels) and the current backend rules.
  5. Ablation: is the best model relying on time of day, flow level, or the house baseline?
  6. Breakdowns: per household (night-shift vs day routine), per leak shape.
  7. Final model: trained on H01–H25, alarms tuned on H26–H30, saved; then tested on the
     original single-household dataset and (if given) real loop data.
  8. Slide-ready charts and REPORT.md in --out.

Usage:
  pip install -r requirements.txt
  python train_leak_model.py
  python train_leak_model.py --real my_readings.csv --real-events my_staged_events.csv
"""
import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leakdetect as ld  # noqa: E402

warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=UserWarning)
HERE = Path(__file__).resolve().parent
N_FOLDS = 6


def build_training_set(feats, data, households, cols, seed):
    """All anomaly minutes + 25 % of normal minutes from the given households."""
    X = pd.concat([feats[h][cols] for h in households])
    y = pd.concat([data[h][0]["label"] for h in households])
    keep = (y != "normal").values | (np.random.default_rng(seed).random(len(y)) < 0.25)
    return X[keep], y[keep]


def detect(kind, model, tuned, X, rules_flags=None):
    """Alarm Series per detector name for one household."""
    if kind == "rules":
        return {"any": rules_flags}
    sc = ld.class_scores(model, X)
    return {name: ld.alarms(sc[name], *tuned[name]) for name in sc}


def evaluate_house(kind, alarm_by, index, events):
    """Event results for one household: recall from the matching detector, false alarms
    from the combined (OR) alarm."""
    combined = None
    for a in alarm_by.values():
        combined = a if combined is None else (combined | a)
    if kind in ("rules", "iforest"):
        return ld.evaluate_events(index, events, combined)
    rm = ld.evaluate_events(index, events, alarm_by["micro_leak"], "micro_leak")
    rb = ld.evaluate_events(index, events, alarm_by["burst"], "burst")
    rc = ld.evaluate_events(index, events, combined)
    return {"events": rm["events"] + rb["events"], "false_alarms": rc["false_alarms"], "days": rc["days"]}


def fit_and_tune(kind, feature_set, feats, data, train_h, val_h, fa_budget, seed):
    cols = ld.columns_for(feature_set)
    X, y = build_training_set(feats, data, train_h, cols, seed)
    model = ld.fit_model(kind, X, y, seed)
    val_scores = {h: ld.class_scores(model, feats[h][cols]) for h in val_h}
    tuned = {}
    for name in next(iter(val_scores.values())):
        label = None if name == "any" else name
        tuned[name] = ld.tune_alarm({h: s[name] for h, s in val_scores.items()}, data, label, fa_budget)
    return model, cols, tuned


def cross_validate(kind, feature_set, homes, feats, data, rules, fa_budget, seed, keep_alarms=False):
    folds =[homes[i * len(homes) // N_FOLDS:(i + 1) * len(homes) // N_FOLDS] for i in range(N_FOLDS)]
    per_house, per_fold, alarms_kept, settings = {}, [], {}, []
    for k in range(N_FOLDS):
        test_h, val_h = folds[k], folds[(k + 1) % N_FOLDS]
        train_h = [h for h in homes if h not in test_h and h not in val_h]
        model, cols, tuned = (None, None, {}) if kind == "rules" else \
            fit_and_tune(kind, feature_set, feats, data, train_h, val_h, fa_budget, seed + k)
        settings.append(tuned)
        fold_res = []
        for h in test_h:
            df, events = data[h]
            alarm_by = detect(kind, model, tuned, None if kind == "rules" else feats[h][cols], rules.get(h))
            r = evaluate_house(kind, alarm_by, df.index, events)
            per_house[h] = r
            fold_res.append(r)
            if keep_alarms:
                alarms_kept[h] = alarm_by
        per_fold.append(ld.summarise(fold_res))
    return {"per_house": per_house, "per_fold": pd.DataFrame(per_fold), "alarms": alarms_kept, "settings": settings}


def mean_sd(per_fold, col, pct=True):
    v = per_fold[col].astype(float)
    if pct:
        return f"{v.mean():.0%} ± {v.std():.0%}"
    return f"{v.mean():.2f} ± {v.std():.2f}"


def headline(name, cv):
    pf = cv["per_fold"]
    pooled = ld.summarise(list(cv["per_house"].values()))
    return {
        "detector": name,
        "micro_leak_recall": mean_sd(pf, "micro_leak_recall"),
        "burst_recall": mean_sd(pf, "burst_recall"),
        "false_alarms_per_day": mean_sd(pf, "false_alarms_per_day", pct=False),
        "micro_leak_delay_min": f"{pooled['micro_leak_median_delay']:.0f}" if pooled["micro_leak_median_delay"] == pooled["micro_leak_median_delay"] else "–",
        "burst_delay_min": f"{pooled['burst_median_delay']:.0f}" if pooled["burst_median_delay"] == pooled["burst_median_delay"] else "–",
        "caught_total": f"{pooled['micro_leak_caught']} leaks, {pooled['burst_caught']} bursts",
        "_micro": pf["micro_leak_recall"].mean(), "_burst": pf["burst_recall"].mean(),
        "_fa": pf["false_alarms_per_day"].mean(),
    }


def md_table(rows, cols):
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    return head + "".join("| " + " | ".join(str(r[c]) for c in cols) + " |\n" for r in rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(HERE.parent / "data" / "simdeum" / "out"))
    ap.add_argument("--extra-test", default=str(HERE.parent / "data" / "loop_household" / "out"))
    ap.add_argument("--real", help="REAL readings CSV exported from MongoDB (timestamp, flowRate, volume)")
    ap.add_argument("--real-events", help="staged anomalies on the real loop (start, end, type, label)")
    ap.add_argument("--fa-budget", type=float, default=0.1, help="max false alarms per day, per alarm, when tuning")
    ap.add_argument("--final-features", default="all", choices=list(ld.FEATURE_SETS),
                    help="feature set for the saved final model (the ablation compares them)")
    ap.add_argument("--out", default=str(HERE / "results"))
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    t_start = time.time()
    data_dir, out = Path(a.data), Path(a.out)
    charts = out / "charts"
    charts.mkdir(parents=True, exist_ok=True)

    # ── Load ────────────────────────────────────────────────────────────────
    homes = sorted(p.name for p in data_dir.iterdir() if (p / "1min.csv").exists())
    data = {h: ld.load_household(data_dir / h) for h in homes}
    feats = {h: ld.make_features(data[h][0]) for h in homes}
    info = pd.read_csv(data_dir / "households.csv").set_index("household_id")
    rules = {h: ld.rule_baseline(data_dir / h / "readings.csv.gz", data[h][0].index) for h in homes
             if (data_dir / h / "readings.csv.gz").exists()}
    n_ev = sum(len(e) for _, e in data.values())
    print(f"Loaded {len(homes)} households, {sum(len(d) for d, _ in data.values()):,} minutes, {n_ev} anomalies "
          f"({time.time() - t_start:.0f}s)")

    # ── Models vs rules (6-fold CV by household) ────────────────────────────
    experiments = {}
    for name, kind, fs in [("Random Forest", "rf", "all"), ("Gradient boosting", "hgb", "all"),
                           ("Isolation Forest (no labels)", "iforest", "all"), ("Current backend rules", "rules", None)]:
        experiments[name] = cross_validate(kind, fs, homes, feats, data, rules, a.fa_budget, a.seed,
                                           keep_alarms=kind != "rules")
        print(f"  {name}: done ({time.time() - t_start:.0f}s)")
    rows = [headline(n, cv) for n, cv in experiments.items()]
    supervised = [r for r in rows if r["detector"] in ("Random Forest", "Gradient boosting")]
    best = max(supervised, key=lambda r: ((r["_micro"] + r["_burst"]) / 2, -r["_fa"]))
    best_name = best["detector"]
    best_kind = "rf" if best_name == "Random Forest" else "hgb"
    print(f"Best supervised model: {best_name}")

    # ── Ablation with the best model ────────────────────────────────────────
    ablation = {"all features": experiments[best_name]}
    for fs, label in [("no_time", "without time of day"), ("no_time_no_level", "without time & flow level"),
                      ("no_baseline", "without house baseline")]:
        ablation[label] = cross_validate(best_kind, fs, homes, feats, data, rules, a.fa_budget, a.seed)
        print(f"  ablation {label}: done ({time.time() - t_start:.0f}s)")
    abl_rows = [headline(n, cv) for n, cv in ablation.items()]

    # ── Breakdowns for the best model ───────────────────────────────────────
    cv = experiments[best_name]
    ph = []
    for h, r in cv["per_house"].items():
        s = ld.summarise([r])
        ph.append({"household": h, "house_type": info.loc[h, "house_type"], "routine": info.loc[h, "routine"],
                   "people": int(info.loc[h, "people"]), "false_alarms_per_day": round(s["false_alarms_per_day"], 3),
                   "micro_leaks_caught": s["micro_leak_caught"], "bursts_caught": s["burst_caught"]})
    ph = pd.DataFrame(ph)
    by_routine = ph.groupby("routine")["false_alarms_per_day"].mean().round(3).to_dict()
    by_type = ph.groupby("house_type")["false_alarms_per_day"].mean().round(3).to_dict()
    shapes = pd.DataFrame([e for r in cv["per_house"].values() for e in r["events"]])
    by_shape = shapes.groupby("type").agg(caught=("caught", "sum"), total=("caught", "size"),
                                          median_delay_min=("delay_min", "median"))
    by_shape["recall"] = by_shape["caught"] / by_shape["total"]

    # ── Final model: train on all but the last fold (H01–H25), tune on the last (H26–H30) ──
    n_val = len(homes) // N_FOLDS
    final_train, final_val = homes[:-n_val], homes[-n_val:]
    model, cols, tuned = fit_and_tune(best_kind, a.final_features, feats, data, final_train, final_val, a.fa_budget, a.seed)
    joblib.dump({"model": model, "features": cols, "alarms": tuned, "model_type": best_name}, out / "leak_model.joblib")

    extra = {}
    ex = Path(a.extra_test)
    for mcsv in sorted(ex.glob("*_1min.csv")) if ex.exists() else []:
        df, ev = ld.load_single_file(mcsv, mcsv.with_name(mcsv.name.replace("_1min", "_events")))
        X = ld.make_features(df)[cols]
        extra["original single-household dataset"] = ld.summarise(
            [evaluate_house(best_kind, detect(best_kind, model, tuned, X), df.index, ev)])
    if a.real:
        df, ev = ld.load_real_readings(a.real, a.real_events)
        X = ld.make_features(df)[cols]
        extra["REAL loop data"] = ld.summarise([evaluate_house(best_kind, detect(best_kind, model, tuned, X), df.index, ev)])

    # Permutation importance on a sample of the final model's validation minutes.
    Xv = pd.concat([feats[h][cols] for h in final_val])
    yv = pd.concat([data[h][0]["label"] for h in final_val])
    samp = np.random.default_rng(a.seed).choice(len(Xv), size=min(20_000, len(Xv)), replace=False)
    anom = np.flatnonzero((yv != "normal").values)
    samp = np.unique(np.r_[samp, anom])
    pi = permutation_importance(model, Xv.iloc[samp], yv.iloc[samp], n_repeats=3, random_state=a.seed,
                                scoring="balanced_accuracy", n_jobs=-1)
    importance = pd.Series(pi.importances_mean, index=cols).sort_values(ascending=False)

    # ── Charts ──────────────────────────────────────────────────────────────
    comp = pd.DataFrame(rows).set_index("detector")
    comp.index = ["Random\nForest", "Gradient\nboosting", "Isolation\nForest", "Current\nrules"]
    ld.chart_bars(comp, ["_micro", "_burst"], ["Micro-leaks caught", "Bursts caught"],
                  "Anomalies caught on unseen households (6-fold CV)", charts / "1_detection_vs_rules.png",
                  "Share of events caught", ylim=(0, 1.15))
    ld.chart_bars(comp, ["_fa"], ["False alarms/day"], "False alarms per day (lower is better)",
                  charts / "2_false_alarms_by_detector.png", "False alarms per day", fmt="{:.2f}")
    abl = pd.DataFrame(abl_rows).set_index("detector")
    abl.index = ["All\nfeatures", "Without\ntime of day", "Without time\n& flow level", "Without house\nbaseline"]
    ld.chart_bars(abl, ["_micro", "_burst"], ["Micro-leaks caught", "Bursts caught"],
                  f"Ablation: what does the {best_name} rely on?", charts / "3_ablation.png",
                  "Share of events caught", ylim=(0, 1.15))
    ld.chart_hbar(ph.set_index("household")["false_alarms_per_day"],
                  "False alarms per day, per household (orange = night-shift routine)",
                  charts / "4_false_alarms_per_household.png", "False alarms per day",
                  highlight=set(ph.loc[ph["routine"] == "night_shift", "household"]))
    sh = by_shape.copy()
    sh.index = [i.replace("_", " ") for i in sh.index]
    ld.chart_bars(sh, ["recall"], ["Caught"], "Share caught by anomaly shape", charts / "5_recall_by_shape.png",
                  "Share caught", ylim=(0, 1.15))
    ld.chart_hbar(importance.head(12), "Most important features (permutation importance)",
                  charts / "6_feature_importance.png", "Drop in balanced accuracy when shuffled")
    for shape in ("cistern_leak", "steady_leak", "growing_leak", "burst"):     # one example trace per shape
        for h in homes:
            ev = data[h][1]
            ev = ev[ev["type"] == shape]
            if len(ev) and h in cv["alarms"]:
                al = cv["alarms"][h]
                named = {"micro-leak alarm": al["micro_leak"], "burst alarm": al["burst"]}
                rule_al = rules.get(h)
                if rule_al is not None:
                    named["current rules"] = rule_al
                ld.chart_trace(data[h][0], ev.iloc[[0]], named,
                               f"{h}: {shape.replace('_', ' ')} — flow, true anomaly and alarms",
                               charts / f"7_trace_{shape}.png")
                break

    # ── Report ──────────────────────────────────────────────────────────────
    cols_show = ["detector", "micro_leak_recall", "burst_recall", "false_alarms_per_day",
                 "micro_leak_delay_min", "burst_delay_min", "caught_total"]
    report = [
        "# AquaFlow leak detection — results\n",
        f"{len(homes)} simulated households (SIMDEUM + loop sensor model), {n_ev} injected anomalies. "
        f"6-fold cross-validation by household: every household is tested once by a model that never saw it. "
        f"Values are mean ± standard deviation across folds; delays are medians in minutes. "
        f"Alarm false-alarm budget when tuning: {a.fa_budget}/day per alarm.\n",
        "## Detectors compared\n", md_table(rows, cols_show),
        f"\n## Ablation ({best_name})\n", md_table(abl_rows, cols_show),
        "\n## By anomaly shape\n", "```\n" + by_shape.round(2).to_string() + "\n```",
        f"\n\n## False alarms per day by routine\n{json.dumps(by_routine)}\n",
        f"\n## False alarms per day by household type\n{json.dumps(by_type)}\n",
        "\n## Final model on other data\n",
    ]
    for k, v in extra.items():
        report.append(f"- **{k}**: micro-leaks {v['micro_leak_caught']}, bursts {v['burst_caught']}, "
                      f"false alarms/day {v['false_alarms_per_day']:.2f}\n")
    report.append(f"\nFinal alarm settings (threshold, minutes): {json.dumps({k: list(v) for k, v in tuned.items()})}\n")
    (out / "REPORT.md").write_text("".join(report))
    ph.to_csv(out / "per_household.csv", index=False)
    by_shape.to_csv(out / "by_anomaly_shape.csv")
    importance.to_csv(out / "feature_importance.csv", header=["importance"])
    pd.DataFrame(rows)[cols_show].to_csv(out / "detectors.csv", index=False)
    pd.DataFrame(abl_rows)[cols_show].to_csv(out / "ablation.csv", index=False)
    with open(out / "summary.json", "w") as f:
        json.dump({"best_model": best_name, "final_alarms": {k: list(v) for k, v in tuned.items()},
                   "detectors": [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows],
                   "ablation": [{k: v for k, v in r.items() if not k.startswith("_")} for r in abl_rows],
                   "false_alarms_by_routine": by_routine, "other_data": extra}, f, indent=2, default=str)
    print("\n" + "".join(report))
    print(f"Saved model, report and charts → {out}  ({time.time() - t_start:.0f}s)")


if __name__ == "__main__":
    main()
