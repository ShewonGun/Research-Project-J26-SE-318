"""
Compare the leak detector trained on the ORIGINAL simulated households (SIMDEUM, Dutch usage
levels) with one trained on CALIBRATED households (usage matched to real NWSDB bills).

Both datasets contain the same 30 households (same people, fixtures, routines and seeds); the
calibrated ones use water more often, so normal use overlaps leaks more — closer to real homes.

  1. Realism: litres/day of real NWSDB households vs original vs calibrated simulations.
  2. 2 × 2 cross-evaluation with the same 6 folds as train_leak_model.py: in every fold, a model is
     trained on the original AND on the calibrated version of the same 20 households, its alarms
     tuned on 5 validation households of its own data, then BOTH models are tested on the
     original AND the calibrated version of the 5 held-out households.
     → "calibrated test data" is the realistic test; "original test data" checks nothing was lost.
  3. Held-out seeds: both final models (trained H01–H25, tuned H26–H30) on the 8 loop-calibrated
     single-household datasets in data/loop_household/out_seeds (a different simulator).

Settings match the committed final model: Random Forest, no_baseline features, 0.05 false
alarms/day budget per alarm. Nothing existing is overwritten: results go to results_comparison/.

Usage (from edge-ai/leak_detection):
  python compare_calibration.py
"""
import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leakdetect as ld  # noqa: E402
import train_leak_model as tlm  # noqa: E402

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"


def load(folder):
    homes = sorted(p.name for p in Path(folder).iterdir() if (p / "1min.csv").exists())
    data = {h: ld.load_household(Path(folder) / h) for h in homes}
    feats = {h: ld.make_features(data[h][0]) for h in homes}
    return homes, data, feats


def score(kind, model, tuned, cols, data, feats, households):
    return [tlm.evaluate_house(kind, tlm.detect(kind, model, tuned, feats[h][cols]), data[h][0].index, data[h][1])
            for h in households]


def row(name, results_per_fold):
    folds = pd.DataFrame([ld.summarise(r) for r in results_per_fold])
    pooled = ld.summarise([x for r in results_per_fold for x in r])
    return {"setting": name,
            "micro_leak_recall": f"{folds['micro_leak_recall'].mean():.0%} ± {folds['micro_leak_recall'].std():.0%}",
            "burst_recall": f"{folds['burst_recall'].mean():.0%} ± {folds['burst_recall'].std():.0%}",
            "false_alarms_per_day": f"{folds['false_alarms_per_day'].mean():.2f} ± {folds['false_alarms_per_day'].std():.2f}",
            "micro_leak_delay_min": pooled["micro_leak_median_delay"], "burst_delay_min": pooled["burst_median_delay"],
            "caught": f"{pooled['micro_leak_caught']} leaks, {pooled['burst_caught']} bursts",
            "_micro": folds["micro_leak_recall"].mean(), "_burst": folds["burst_recall"].mean(),
            "_fa": folds["false_alarms_per_day"].mean()}


def chart_distributions(series, path):
    """Empirical CDF of litres/day per household for each source (one axis, direct labels)."""
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(8, 4), dpi=150)
    for (name, vals), color in zip(series.items(), [ld.INK2, ld.BLUE, ld.ORANGE]):
        v = np.sort(np.asarray(vals, dtype=float))
        y = (np.arange(len(v)) + 1) / len(v)
        ax.step(v, y, where="post", color=color, lw=2, label=f"{name} (median {np.median(v):.0f} L/day)")
    ld._style(ax, "Household water use: real NWSDB bills vs simulated households", "Share of households")
    ax.set_xlabel("Litres per day (household median)", color=ld.INK2)
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8, frameon=False, loc="lower right")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--original", default=str(DATA / "simdeum" / "out"))
    ap.add_argument("--calibrated", default=str(DATA / "simdeum" / "out_calibrated"))
    ap.add_argument("--real", default=str(DATA / "nwsdb" / "nwsdb_households.csv"))
    ap.add_argument("--kind", default="rf", choices=["rf", "hgb"])
    ap.add_argument("--features", default="no_baseline", choices=list(ld.FEATURE_SETS))
    ap.add_argument("--fa-budget", type=float, default=0.05)
    ap.add_argument("--out", default=str(HERE / "results_comparison"))
    a = ap.parse_args()
    out = Path(a.out)
    (out / "charts").mkdir(parents=True, exist_ok=True)

    # 1. Realism
    real = pd.read_csv(a.real)
    real = real.loc[real["usable_months"] >= 12, "median_litres_per_day"].dropna()
    hh_o = pd.read_csv(Path(a.original) / "households.csv")
    hh_c = pd.read_csv(Path(a.calibrated) / "households.csv")
    dist = {"Real NWSDB households": real, "Original simulation": hh_o["simdeum_litres_per_day"],
            "Calibrated simulation": hh_c["simdeum_litres_per_day"]}
    chart_distributions(dist, out / "charts" / "1_usage_real_vs_simulated.png")
    realism = {k: {q: round(float(np.quantile(v, p)), 0) for q, p in
                   [("p10", .1), ("p25", .25), ("median", .5), ("p75", .75), ("p90", .9)]} for k, v in dist.items()}

    sets = {"original": load(a.original), "calibrated": load(a.calibrated)}
    homes = sets["original"][0]
    assert homes == sets["calibrated"][0], "both datasets must contain the same households"
    busy = {}
    for name, (_, data, _) in sets.items():
        f = pd.concat([d["flowRateMean"] for d, _ in data.values()])
        lab = pd.concat([d["label"] for d, _ in data.values()])
        busy[name] = round(float(((f >= ld.IDLE_LPM) & (lab == "normal")).sum() / (lab == "normal").sum()), 3)
    print("Share of normal minutes with water flowing:", busy)

    # 2. 2 × 2 cross-evaluation, same folds as train_leak_model.py
    n = len(homes)
    folds = [homes[i * n // tlm.N_FOLDS:(i + 1) * n // tlm.N_FOLDS] for i in range(tlm.N_FOLDS)]
    res = {(tr, te): [] for tr in sets for te in sets}
    for k in range(tlm.N_FOLDS):
        test_h, val_h = folds[k], folds[(k + 1) % tlm.N_FOLDS]
        train_h = [h for h in homes if h not in test_h and h not in val_h]
        for tr, (_, data, feats) in sets.items():
            model, cols, tuned = tlm.fit_and_tune(a.kind, a.features, feats, data, train_h, val_h, a.fa_budget, k)
            for te, (_, tdata, tfeats) in sets.items():
                res[(tr, te)].append(score(a.kind, model, tuned, cols, tdata, tfeats, test_h))
        print(f"  fold {k + 1}/{tlm.N_FOLDS} done", flush=True)
    label = {"original": "original", "calibrated": "calibrated"}
    rows = [row(f"trained on {label[tr]} → tested on {label[te]}", res[(tr, te)])
            for te in ("calibrated", "original") for tr in ("original", "calibrated")]

    # 3. Held-out seeds (different simulator) with each final model
    seeds = sorted((DATA / "loop_household" / "out_seeds").glob("seed*"))
    held, finals = [], {}
    for tr, (_, data, feats) in sets.items():
        model, cols, tuned = tlm.fit_and_tune(a.kind, a.features, feats, data, homes[:-5], homes[-5:], a.fa_budget, 0)
        finals[tr] = {"alarms": {k: list(v) for k, v in tuned.items()}}
        if seeds:
            r = []
            for d in seeds:
                df, ev = ld.load_single_file(next(d.glob("*_1min.csv")), next(d.glob("*_events.csv")))
                X = ld.make_features(df)[cols]
                r.append(tlm.evaluate_house(a.kind, tlm.detect(a.kind, model, tuned, X), df.index, ev))
            s = ld.summarise(r)
            held.append({"setting": f"trained on {tr} → held-out seeds ({len(seeds)})",
                         "micro_leaks": s["micro_leak_caught"], "bursts": s["burst_caught"],
                         "false_alarms_per_day": round(s["false_alarms_per_day"], 3),
                         "micro_leak_delay_min": s["micro_leak_median_delay"], "burst_delay_min": s["burst_median_delay"]})

    # Charts + report
    t = pd.DataFrame(rows).set_index("setting")
    t.index = ["Original-trained\non calibrated", "Calibrated-trained\non calibrated",
               "Original-trained\non original", "Calibrated-trained\non original"]
    ld.chart_bars(t, ["_micro", "_burst"], ["Micro-leaks caught", "Bursts caught"],
                  "Detection: original vs calibrated training (6-fold CV)", out / "charts" / "2_detection.png",
                  "Share of events caught", ylim=(0, 1.15))
    ld.chart_bars(t, ["_fa"], ["False alarms/day"], "False alarms per day (lower is better)",
                  out / "charts" / "3_false_alarms.png", "False alarms per day", fmt="{:.2f}")
    cols_show = ["setting", "micro_leak_recall", "burst_recall", "false_alarms_per_day",
                 "micro_leak_delay_min", "burst_delay_min", "caught"]
    rep = ["# Original vs calibrated simulation — leak detector comparison\n",
           f"Model: {a.kind}, features: {a.features}, false-alarm budget {a.fa_budget}/day per alarm. "
           "Same 30 households and the same 6 folds; mean ± sd across folds; delays are medians (minutes).\n",
           "\n## 1. Realism — litres/day per household\n",
           tlm.md_table([{"source": k, **v} for k, v in realism.items()], ["source", "p10", "p25", "median", "p75", "p90"]),
           f"\nShare of normal minutes with water flowing (loop scale): {json.dumps(busy)}\n",
           "\n## 2. Cross-evaluation\n", tlm.md_table(rows, cols_show)]
    if held:
        rep += ["\n## 3. Held-out seeds (loop single-household simulator)\n",
                tlm.md_table(held, list(held[0].keys()))]
    rep.append(f"\nFinal alarm settings: {json.dumps(finals)}\n")
    (out / "COMPARISON.md").write_text("".join(rep))
    pd.DataFrame(rows)[cols_show].to_csv(out / "cross_evaluation.csv", index=False)
    with open(out / "summary.json", "w") as f:
        json.dump({"realism": realism, "busy_share": busy,
                   "cross_evaluation": [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows],
                   "heldout_seeds": held, "final_alarms": finals}, f, indent=2, default=str)
    print("\n" + "".join(rep))


if __name__ == "__main__":
    main()
