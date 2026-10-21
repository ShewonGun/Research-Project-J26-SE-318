"""
Learning curve: does the leak detector keep improving with more training households?

Uses the 100 calibrated households (data/simdeum/out_calibrated_100):
  test        H81–H100 (20 households) — fixed, never used for training or tuning
  validation  H71–H80  (10 households) — alarm thresholds are tuned here
  training    random draws of N households from H01–H70, N = 10, 20, 30, 50, 70,
              3 different draws per size (one for 70: it is the whole pool)

If detection and false alarms still improve at the largest sizes, more (simulated) households
help; if the curve flattens, better data — real recordings — matters more than more simulation.
Model settings match the final model: Random Forest, no_baseline features, 0.05 false alarms/day
budget per alarm.

Usage (from edge-ai/leak_detection):  python learning_curve.py
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


def chart(table, path):
    """Recall (two series, one axis) against training households, with the draw-to-draw range."""
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(11, 4), dpi=150)
    ax = axes[0]
    for col, name, color in [("micro_leak_recall", "Micro-leaks caught", ld.BLUE), ("burst_recall", "Bursts caught", ld.ORANGE)]:
        g = table.groupby("train_households")[col]
        x, m = g.mean().index, g.mean().values
        ax.fill_between(x, g.min().values, g.max().values, color=color, alpha=0.15, lw=0)
        ax.plot(x, m, color=color, lw=2, marker="o", ms=5, label=name)
    ld._style(ax, "Detection on 20 unseen test households", "Share of events caught")
    ax.set_ylim(0, 1.05)
    ax.set_xlabel("Training households", color=ld.INK2)
    ax.legend(fontsize=8, frameon=False, loc="lower right")
    ax = axes[1]
    g = table.groupby("train_households")["false_alarms_per_day"]
    x = g.mean().index
    ax.fill_between(x, g.min().values, g.max().values, color=ld.VIOLET, alpha=0.15, lw=0)
    ax.plot(x, g.mean().values, color=ld.VIOLET, lw=2, marker="o", ms=5)
    ld._style(ax, "False alarms per day (lower is better)", "False alarms per day")
    ax.set_xlabel("Training households", color=ld.INK2)
    ax.set_ylim(0, None)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(HERE.parent / "data" / "simdeum" / "out_calibrated_100"))
    ap.add_argument("--sizes", default="10,20,30,50,70")
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--kind", default="rf", choices=["rf", "hgb"])
    ap.add_argument("--features", default="no_baseline", choices=list(ld.FEATURE_SETS))
    ap.add_argument("--fa-budget", type=float, default=0.05)
    ap.add_argument("--out", default=str(HERE / "results_learning_curve"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    data_dir = Path(a.data)
    homes = sorted(p.name for p in data_dir.iterdir() if (p / "1min.csv").exists())
    assert len(homes) >= 100, f"expected 100 households in {data_dir}, found {len(homes)}"
    data = {h: ld.load_household(data_dir / h) for h in homes}
    feats = {h: ld.make_features(data[h][0]) for h in homes}
    test_h, val_h, pool = homes[80:100], homes[70:80], homes[:70]
    print(f"Loaded {len(homes)} households; test {test_h[0]}–{test_h[-1]}, validation {val_h[0]}–{val_h[-1]}", flush=True)

    rows = []
    for n in [int(s) for s in a.sizes.split(",")]:
        draws = 1 if n >= len(pool) else a.repeats
        for r in range(draws):
            train_h = sorted(np.random.default_rng(1000 * n + r).choice(pool, size=min(n, len(pool)), replace=False))
            model, cols, tuned = tlm.fit_and_tune(a.kind, a.features, feats, data, train_h, val_h, a.fa_budget, r)
            res = [tlm.evaluate_house(a.kind, tlm.detect(a.kind, model, tuned, feats[h][cols]), data[h][0].index, data[h][1])
                   for h in test_h]
            s = ld.summarise(res)
            rows.append({"train_households": len(train_h), "draw": r,
                         "micro_leak_recall": s["micro_leak_recall"], "burst_recall": s["burst_recall"],
                         "false_alarms_per_day": s["false_alarms_per_day"],
                         "micro_leak_delay_min": s["micro_leak_median_delay"], "burst_delay_min": s["burst_median_delay"],
                         "caught": f"{s['micro_leak_caught']} leaks, {s['burst_caught']} bursts",
                         "alarms": json.dumps({k: list(v) for k, v in tuned.items()})})
            print(f"  N={len(train_h):>2} draw {r}: leaks {s['micro_leak_caught']}, bursts {s['burst_caught']}, "
                  f"false alarms/day {s['false_alarms_per_day']:.3f}", flush=True)

    t = pd.DataFrame(rows)
    t.to_csv(out / "learning_curve.csv", index=False)
    chart(t, out / "learning_curve.png")
    g = t.groupby("train_households").agg(
        draws=("draw", "size"),
        micro_leak_recall=("micro_leak_recall", "mean"), burst_recall=("burst_recall", "mean"),
        burst_recall_min=("burst_recall", "min"), burst_recall_max=("burst_recall", "max"),
        false_alarms_per_day=("false_alarms_per_day", "mean"),
        fa_min=("false_alarms_per_day", "min"), fa_max=("false_alarms_per_day", "max"),
        micro_leak_delay_min=("micro_leak_delay_min", "mean"), burst_delay_min=("burst_delay_min", "mean")).round(3)
    md = ["# Learning curve — calibrated households\n",
          f"Test: {len(test_h)} households ({test_h[0]}–{test_h[-1]}, "
          f"{sum(len(data[h][1]) for h in test_h)} anomalies), never trained on. Validation (alarm tuning): "
          f"{val_h[0]}–{val_h[-1]}. Model {a.kind}, features {a.features}, budget {a.fa_budget}/day per alarm. "
          "Mean over draws (min–max in the chart).\n\n```\n" + g.to_string() + "\n```\n"]
    (out / "LEARNING_CURVE.md").write_text("".join(md))
    print("\n" + g.to_string())


if __name__ == "__main__":
    main()
