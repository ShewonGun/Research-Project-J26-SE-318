"""
AquaFlow — evaluate the trained detector on REAL loop data, with leaks injected on top.

The physical loop's fixed-speed pump cannot produce a slow leak, so micro-leaks are added
to the REAL readings: everything else — sensor noise, reading gaps, missed readings, pump
behaviour, normal use — is real. Labels are exact because we know where we injected.

  1. Clean run: the model on the unmodified real data. Every alarm is a false alarm, except
     during staged anomalies listed in --staged (e.g. a 25-minute non-stop pump run = burst).
  2. Injection trials: in each trial, leaks are added to a copy of the real readings at
     random times, then the model is run. Repeated --trials times with different placements.
     Micro-leak shapes: steady trickle, leaking cistern (pump-level refills every 1.5–5 min),
     slowly growing leak. Bursts are injected too (pump flat out 20–75 min) unless --no-bursts.

How an injected leak is measured: for each real reading, the leak's average flow over that
reading's own window (time since the previous reading) is added, and the result is rounded to
whole sensor pulses (YF-S201, 450 pulses/L) — as the firmware would have counted it.

Input: readings exported from MongoDB Compass (readings collection → filter your device →
Export → CSV, with at least timestamp, flowRate, volume). Ideally ≥ 3 days.

Usage:
  python evaluate_real_with_injected_leaks.py --readings esp32_readings.csv
  python evaluate_real_with_injected_leaks.py --readings esp32_readings.csv --staged staged_events.csv
  (staged_events.csv columns: start,end,type,label — e.g. 2026-10-15T10:00:00+05:30,...,burst,burst)
"""
import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leakdetect as ld  # noqa: E402
import train_leak_model as tlm  # noqa: E402

HERE = Path(__file__).resolve().parent
PULSES_PER_LPM_S = 7.5        # YF-S201: pulses per second per L/min
PULSES_PER_LITRE = 450


def detect_and_evaluate(saved, r, events):
    """Run the saved model on raw readings `r` and score it against `events`."""
    df = ld.readings_to_minutes(r, events)
    X = ld.make_features(df)[saved["features"]]
    kind = "rf" if saved["model_type"] == "Random Forest" else "hgb"
    alarm_by = tlm.detect(kind, saved["model"], saved["alarms"], X)
    return tlm.evaluate_house(kind, alarm_by, df.index, events), df, alarm_by


def inject(r, rng, n_micro, n_burst, pump_lpm, avoid):
    """Copy of readings `r` with leaks added; returns (readings, events)."""
    r = r.copy()
    t = (r["timestamp"] - r["timestamp"].iloc[0]).dt.total_seconds().values
    window = np.r_[np.median(np.diff(t)), np.diff(t)].clip(1, 15)   # each reading's measured window (s)
    n_sec = int(t[-1]) + 1
    leak = np.zeros(n_sec)
    burst = np.zeros(n_sec)
    events = []
    t0 = r["timestamp"].iloc[0]
    margin = 24 * 3600                       # leave the first day clean: the house baseline needs history

    def place(dur):
        for _ in range(200):
            s = int(rng.integers(min(margin, n_sec // 4), max(min(margin, n_sec // 4) + 1, n_sec - dur - 1)))
            a, b = t0 + pd.Timedelta(seconds=s), t0 + pd.Timedelta(seconds=s + dur)
            clash = any(a <= e_end + pd.Timedelta(hours=1) and b >= e_start - pd.Timedelta(hours=1)
                        for e_start, e_end in avoid + [(e["start"], e["end"]) for e in events])
            if not clash:
                return s
        return None

    for _ in range(n_micro):
        shape = rng.choice(["steady", "cistern", "growing"])
        dur = int(rng.integers(2 * 3600, 8 * 3600))
        s = place(dur)
        if s is None:
            continue
        if shape == "steady":
            leak[s:s + dur] += rng.uniform(0.15, 1.5)
        elif shape == "cistern":
            k, every = 0, int(rng.integers(90, 300))
            while k < dur:
                fill = int(rng.integers(8, 20))
                leak[s + k:s + min(dur, k + fill)] += 0.9 * pump_lpm
                k += every + int(rng.integers(-15, 15))
        else:
            leak[s:s + dur] += np.linspace(0.05, rng.uniform(0.4, 1.2), dur)
        events.append({"start": t0 + pd.Timedelta(seconds=s), "end": t0 + pd.Timedelta(seconds=s + dur),
                       "type": f"{shape}_leak", "label": "micro_leak"})
    for _ in range(n_burst):
        dur = int(rng.integers(20 * 60, 75 * 60))
        s = place(dur)
        if s is None:
            continue
        burst[s:s + dur] = pump_lpm * (1 + rng.normal(0, 0.02, dur))
        events.append({"start": t0 + pd.Timedelta(seconds=s), "end": t0 + pd.Timedelta(seconds=s + dur),
                       "type": "burst", "label": "burst"})

    # Average added flow over each reading's window, then re-quantise to whole pulses.
    cs_leak = np.r_[0.0, np.cumsum(leak)]
    cs_burst = np.r_[0.0, np.cumsum(burst)]
    b = np.minimum(n_sec, t.astype(int) + 1)
    a = np.maximum(0, b - np.maximum(1, window.astype(int)))
    add = (cs_leak[b] - cs_leak[a]) / (b - a)
    bur = (cs_burst[b] - cs_burst[a]) / (b - a)
    flow = np.where(bur > 0, np.maximum(r["flowRate"].values, bur), r["flowRate"].values + add)
    pulses = np.round(flow * PULSES_PER_LPM_S * window)
    changed = (add > 0) | (bur > 0)
    r.loc[changed, "flowRate"] = (pulses / window / PULSES_PER_LPM_S)[changed].round(2)
    r.loc[changed, "volume"] = (pulses / PULSES_PER_LITRE)[changed].round(4)
    return r, pd.DataFrame(events, columns=["start", "end", "type", "label"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--readings", required=True, help="real readings CSV exported from MongoDB")
    ap.add_argument("--staged", help="optional CSV of anomalies staged on the loop (start,end,type,label)")
    ap.add_argument("--model", default=str(HERE / "results" / "leak_model.joblib"))
    ap.add_argument("--trials", type=int, default=20)
    ap.add_argument("--micro-leaks", type=int, default=2, help="micro-leaks injected per trial")
    ap.add_argument("--bursts", type=int, default=1, help="bursts injected per trial")
    ap.add_argument("--no-bursts", action="store_true", help="inject micro-leaks only (use staged bursts)")
    ap.add_argument("--out", default=str(HERE / "results" / "real_injection"))
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    saved = joblib.load(a.model)
    r = ld.read_readings(a.readings)
    staged = pd.DataFrame(columns=["start", "end", "type", "label"])
    if a.staged:
        staged = pd.read_csv(a.staged)
        staged["start"] = pd.to_datetime(staged["start"], utc=True)
        staged["end"] = pd.to_datetime(staged["end"], utc=True)
    days = (r["timestamp"].iloc[-1] - r["timestamp"].iloc[0]).total_seconds() / 86400
    running = r.loc[r["flowRate"] > 2, "flowRate"]
    pump_lpm = float(running.median()) if len(running) > 20 else 3.49
    print(f"Real data: {len(r):,} readings over {days:.1f} days; measured pump flow {pump_lpm:.2f} L/min; "
          f"{len(staged)} staged anomalies")
    if days < 2:
        print("Warning: under 2 days of data — the house-baseline features need at least 1 day of history.")

    # 1. Clean run on the real data as recorded.
    clean, df_clean, _ = detect_and_evaluate(saved, r, staged)
    clean_s = ld.summarise([clean])
    print(f"\nClean real data: false alarms/day {clean_s['false_alarms_per_day']:.2f}"
          + (f"; staged micro-leaks {clean_s['micro_leak_caught']}, staged bursts {clean_s['burst_caught']}"
             if len(staged) else ""))

    # 2. Injection trials.
    rng = np.random.default_rng(a.seed)
    avoid = list(zip(staged["start"], staged["end"]))
    trial_res, example = [], None
    for k in range(a.trials):
        rr, ev = inject(r, rng, a.micro_leaks, 0 if a.no_bursts else a.bursts, pump_lpm, avoid)
        res, dfk, alarm_by = detect_and_evaluate(saved, rr, ev)
        trial_res.append(res)
        if example is None and (ev["type"] == "cistern_leak").any():
            example = (dfk, ev[ev["type"] == "cistern_leak"].iloc[[0]], alarm_by)
    inj = ld.summarise(trial_res)
    shapes = pd.DataFrame([e for t in trial_res for e in t["events"]])
    by_shape = shapes.groupby("type").agg(caught=("caught", "sum"), total=("caught", "size"),
                                          median_delay_min=("delay_min", "median")) if len(shapes) else pd.DataFrame()
    if len(by_shape):
        by_shape["recall"] = (by_shape["caught"] / by_shape["total"]).round(2)

    print(f"\nInjected leaks on real data ({a.trials} trials):")
    print(f"  micro-leaks caught {inj['micro_leak_caught']} (median delay {inj['micro_leak_median_delay']} min)")
    print(f"  bursts caught      {inj['burst_caught']} (median delay {inj['burst_median_delay']} min)")
    print(f"  false alarms/day   {inj['false_alarms_per_day']:.2f}")
    if len(by_shape):
        print(by_shape.to_string())

    if example is not None:
        dfk, ev, alarm_by = example
        ld.chart_trace(dfk, ev, {"micro-leak alarm": alarm_by["micro_leak"], "burst alarm": alarm_by["burst"]},
                       "Real loop data with an injected leaking cistern — flow and alarms",
                       out / "trace_real_injected_cistern.png")
    by_shape.to_csv(out / "by_shape.csv")
    with open(out / "summary.json", "w") as f:
        json.dump({"readings": len(r), "days": round(days, 2), "pump_lpm": round(pump_lpm, 2),
                   "clean_real_data": clean_s, "injected": inj, "trials": a.trials}, f, indent=2, default=str)
    print(f"\nSaved → {out}")


if __name__ == "__main__":
    main()
