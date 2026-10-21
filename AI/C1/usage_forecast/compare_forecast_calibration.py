"""
Compare the CURRENT daily usage forecast (trained on data/patterned_daily.csv: 30 SIMDEUM households,
Dutch usage levels, assumed patterns) with forecasts trained on NWSDB-CALIBRATED households
(usage level and spread matched to 105 real NWSDB households, measured seasonality added).

  test        calibrated households H71–H100 (30) — realistic usage, never used for training or tuning;
              test origins = each household's last TEST_DAYS days (as in train_forecast.py)
  validation  calibrated households H61–H70 — only to set each model's 80 % range
  models      current   : trained on all 30 households of data/patterned_daily.csv (the deployed setup)
              cal-N     : trained on N calibrated households (H01–H60 pool), N = 10, 20, 30, 60
                          → cal-30 vs current isolates the calibration; cal-60 adds more households
  also        a check on the ORIGINAL data: current-style model trained on original H01–H20 vs
              calibrated-trained model on calibrated H31–H60 (different people), both tested on
              original H21–H30 — does training on realistic usage hurt on the original households?

Same features and model as train_forecast.py. Metrics: MAE (litres/day), WAPE, 7-day-total error
(what the run-out date and bill estimate use) and 80 % range coverage.

Usage (from edge-ai/usage_forecast):
  python compare_forecast_calibration.py --calibrated data/patterned_daily_calibrated_100.csv
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import train_forecast as tf  # noqa: E402

HERE = Path(__file__).resolve().parent


def rows_for(daily_csv):
    dd = pd.read_csv(daily_csv, parse_dates=["day"])
    out = {}
    for h, g in dd.groupby("home"):
        r = tf.make_rows(g.set_index("day")["litres"].sort_index())
        r["home"] = h
        out[h] = r
    return out


def stack(rows, homes, test=False):
    R = pd.concat([rows[h] for h in homes], ignore_index=True)
    if test:
        cutoff = R.groupby("home")["origin"].transform("max") - pd.Timedelta(days=tf.TEST_DAYS)
        R = R[R["origin"] > cutoff]
    return R


def feats_of(R):
    return [c for c in R.columns if c not in tf.NON_FEATURES and c not in tf.CAL_FEATURES]


def fit(R):
    f = feats_of(R)
    return tf.new_model().fit(R[f], R["target_ratio"]), f


def predict(m, f, R):
    return m.predict(R[f]) * R["scale"].values


def evaluate(pred, R, half):
    y = R["target"].values
    err = np.abs(pred - y)
    hw = R["h"].map(half).values
    lo, hi = np.clip(pred - hw, 0, None), pred + hw
    d = R[["home", "origin", "h"]].assign(p=pred, y=y)
    w = d[d.h <= 7].groupby(["home", "origin"]).filter(lambda x: len(x) == 7).groupby(["home", "origin"])[["p", "y"]].sum()
    return {"mae_lpd": round(float(err.mean()), 1), "wape_pct": round(float(err.sum() / y.sum() * 100), 1),
            "mae_h1": round(float(err[R["h"].values == 1].mean()), 1), "mae_h7": round(float(err[R["h"].values == 7].mean()), 1),
            "week_total_wape_pct": round(float((w.p - w.y).abs().sum() / w.y.sum() * 100), 1),
            "coverage_80": round(float(((y >= lo) & (y <= hi)).mean()), 3)}


def half_widths(m, f, V):
    p = predict(m, f, V)
    V = V.assign(err=np.abs(p - V["target"].values))
    return V.groupby("h")["err"].quantile(0.8).to_dict()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--original", default=str(HERE / "data" / "patterned_daily.csv"))
    ap.add_argument("--calibrated", required=True)
    ap.add_argument("--out", default=str(HERE / "results_forecast_comparison"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    orig, cal = rows_for(a.original), rows_for(a.calibrated)
    o_homes, c_homes = sorted(orig), sorted(cal, key=lambda h: int(h[1:]))
    assert len(c_homes) >= 100, f"expected 100 calibrated households, found {len(c_homes)}"
    test_h, val_h, pool = c_homes[70:100], c_homes[60:70], c_homes[:60]
    T, V = stack(cal, test_h, test=True), stack(cal, val_h, test=True)
    print(f"Original: {len(o_homes)} households; calibrated: {len(c_homes)}. Test {test_h[0]}–{test_h[-1]} "
          f"({len(T):,} forecasts), validation {val_h[0]}–{val_h[-1]}", flush=True)

    rows = []
    for name, col in [("same weekday last week (baseline)", "baseline_week"), ("mean of last 7 days (baseline)", "baseline_mean7")]:
        # baselines: their 80 % range also from the validation households
        hv = V.assign(err=np.abs(V[col] - V["target"])).groupby("h")["err"].quantile(0.8).to_dict()
        rows.append({"forecast": name, "train_households": 0, **evaluate(T[col].values, T, hv)})
    m, f = fit(stack(orig, o_homes))
    rows.append({"forecast": "CURRENT model (original data)", "train_households": len(o_homes),
                 **evaluate(predict(m, f, T), T, half_widths(m, f, V))})
    curve = []
    for n in (10, 20, 30, 60):
        draws = 1 if n == len(pool) else 3
        for d in range(draws):
            homes = sorted(np.random.default_rng(100 * n + d).choice(pool, n, replace=False))
            mc, fc = fit(stack(cal, homes))
            ev = evaluate(predict(mc, fc, T), T, half_widths(mc, fc, V))
            curve.append({"train_households": n, "draw": d, **ev})
            print(f"  calibrated, {n} households, draw {d}: {ev}", flush=True)
    C = pd.DataFrame(curve)
    for n, g in C.groupby("train_households"):
        rows.append({"forecast": f"calibrated model ({n} households)", "train_households": n,
                     **{k: round(float(g[k].mean()), 3 if k == "coverage_80" else 1) for k in g.columns if k not in ("train_households", "draw")}})
    table = pd.DataFrame(rows)
    print("\nTest: 30 unseen calibrated households (realistic usage)\n" + table.to_string(index=False))

    # Check on the original households: does training on realistic usage hurt there?
    To = stack(orig, o_homes[20:30], test=True)
    Vo = stack(orig, o_homes[15:20], test=True)
    mo, fo = fit(stack(orig, o_homes[:15]))
    mc, fc = fit(stack(cal, c_homes[30:60]))
    check = pd.DataFrame([
        {"forecast": "trained on original H01–H15", **evaluate(predict(mo, fo, To), To, half_widths(mo, fo, Vo))},
        {"forecast": "trained on calibrated H31–H60", **evaluate(predict(mc, fc, To), To, half_widths(mc, fc, Vo))},
        {"forecast": "mean of last 7 days (baseline)", **evaluate(To["baseline_mean7"].values, To,
                                                                  Vo.assign(err=np.abs(Vo["baseline_mean7"] - Vo["target"])).groupby("h")["err"].quantile(0.8).to_dict())},
    ])
    print("\nCheck on ORIGINAL households H21–H30\n" + check.to_string(index=False))

    # Daily-usage variability: how different are the datasets?
    var = {}
    for label, path in [("original", a.original), ("calibrated", a.calibrated)]:
        dd = pd.read_csv(path)
        g = dd.groupby("home")["litres"]
        var[label] = {"median_litres_per_day": round(float(g.median().median()), 1),
                      "day_to_day_cv_median": round(float((g.std() / g.mean()).median()), 3)}
    print("\nDaily usage (loop scale):", var)

    table.to_csv(out / "comparison.csv", index=False)
    C.to_csv(out / "learning_curve.csv", index=False)
    check.to_csv(out / "check_original.csv", index=False)
    (out / "COMPARISON.md").write_text(
        "# Daily forecast: current vs NWSDB-calibrated training data\n\n"
        f"Test: {len(test_h)} unseen calibrated households ({test_h[0]}–{test_h[-1]}), last {tf.TEST_DAYS} days of origins, "
        f"{len(T):,} forecasts (1–7 days ahead). 80 % ranges set on validation households {val_h[0]}–{val_h[-1]}. "
        "Calibrated-model rows are means over 3 random draws of training households (1 draw at 60).\n\n```\n"
        + table.to_string(index=False) + "\n```\n\n## Check on the original households (H21–H30)\n\n```\n"
        + check.to_string(index=False) + "\n```\n\nDaily usage: " + json.dumps(var) + "\n")
    print(f"\nSaved → {out}")


if __name__ == "__main__":
    main()
