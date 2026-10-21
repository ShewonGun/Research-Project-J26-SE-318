"""Evaluate the saved model on held-out loop-calibrated datasets (data/loop_household/out_seeds/seed*)
generated with generate_dataset.py using seeds never used in training. SYNTHETIC data."""
import json, sys
from pathlib import Path
import joblib, pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import leakdetect as ld  # noqa: E402
import train_leak_model as tlm  # noqa: E402

saved = joblib.load(HERE / "results" / "leak_model.joblib")
kind = "rf" if saved["model_type"] == "Random Forest" else "hgb"
results, rows = [], []
for d in sorted((HERE.parent / "data" / "loop_household" / "out_seeds").glob("seed*")):
    df, ev = ld.load_single_file(next(d.glob("*_1min.csv")), next(d.glob("*_events.csv")))
    X = ld.make_features(df)[saved["features"]]
    res = tlm.evaluate_house(kind, tlm.detect(kind, saved["model"], saved["alarms"], X), df.index, ev)
    results.append(res)
    s = ld.summarise([res])
    rows.append({"seed": d.name, **{k: s[k] for k in ["micro_leak_caught", "burst_caught", "false_alarms_per_day"]}})
    print(rows[-1])
tot = ld.summarise(results)
print("\nTOTAL", json.dumps(tot, default=str, indent=1))
ev = pd.DataFrame([e for r in results for e in r["events"]])
print(ev.groupby("type").agg(caught=("caught", "sum"), total=("caught", "size"), median_delay_min=("delay_min", "median")))
out = HERE / "results" / "heldout_seeds"; out.mkdir(exist_ok=True)
pd.DataFrame(rows).to_csv(out / "per_seed.csv", index=False)
(out / "summary.json").write_text(json.dumps(tot, default=str, indent=2))
