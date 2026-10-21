"""
AquaFlow — multi-household synthetic dataset: SIMDEUM household behaviour + the
AquaFlow loop's measured sensor model + labelled leak injection.

Why: ../loop_household/generate_dataset.py simulates ONE fixed household (4 people). To test
whether a leak detector generalises to households it has never seen, this script
generates many DIFFERENT households with pySIMDEUM (KWR Water Research Institute;
Blokker, Vreeburg & van Dijk, 2010, "Simulating residential water demand with a
stochastic end-use model", J. Water Resour. Plann. Manage. 136(1)).

Pipeline, per household:
  1. SIMDEUM builds a random household (one_person / two_person / family): its people
     (age group, job away from home or not) and its fixtures.
  2. Every simulated day, each person's routine (wake / leave / return / sleep) is
     redrawn — weekday or weekend statistics — and SIMDEUM simulates per-second
     water use of every fixture.
  3. Loop adaptation: SIMDEUM assumes mains pressure (shower ≈ 8.5 L/min); the AquaFlow
     loop's pump delivers ≈ 3.5 L/min. All flows are scaled by ONE constant
     K_SCALE = PUMP_MEAN_LPM / SIMDEUM_SHOWER_LPM (same for every household), each
     continuous run of use gets its own pump level (as on the real loop), and the total
     is capped at the pump's maximum. Timing and durations are kept as SIMDEUM made them.
  3b. Hard normal cases are added: garden watering and tank filling (5–30 min near pump
     level), longer than any fixture, so "long" alone does not mean "burst".
     Every 6th household (H06, H12, …) works nights: its routine runs 10 h later.
  4. Leaks are injected on top, in realistic shapes whose flows overlap normal use:
     steady trickle (0.15–1.5 L/min), leaking cistern (pump-level refills every
     1.5–5 min), slowly growing leak; bursts = pump flat out for 20–75 min.
  5. The loop's sensor model (measured on ESP32-A1, reused from ../loop_household) turns the
     per-second flow into readings: real reading spacing, missed readings, pulse
     quantisation, reading noise, brief dips and idle noise.

Limitations (state them when reporting results):
  • SIMDEUM's statistics are Dutch (Netherlands) defaults — not yet adapted to Sri Lanka.
  • The flow scaling in step 3 treats the loop as a scaled model of a house.
  • All data is simulated. Real validation needs anomalies staged on the physical loop.

Outputs (in ./out), timestamps UTC like the database; one folder per household:
  out/households.csv                 one row per household: type, people, fixtures, litres/day
                                     (SIMDEUM's own volume, and normal use as metered on the loop)
  out/H01/readings.csv.gz            timestamp, device, flowRate, volume, event, label,
                                     is_anomaly, household_id
  out/H01/1min.csv                   same, aggregated per minute
  out/H01/events.csv                 ground truth: every fixture use and every anomaly

Setup (pySIMDEUM 1.0.1 needs an older pandas; use a separate environment):
  python3.11 -m venv simdeum-env
  simdeum-env/bin/pip install -r requirements.txt          (Windows: simdeum-env\\Scripts\\pip)

Calibration to real NWSDB usage (optional, --calibrate-to):
  Real Sri Lankan households (106 NWSDB bills, ../nwsdb) use far more than SIMDEUM's Dutch defaults
  (median ~593 vs ~259 L/day). With --calibrate-to, each household keeps its SIMDEUM people, fixtures
  and daily timing, but uses water MORE OFTEN (or less): extra independently simulated days of the
  same household are overlaid until its litres/day reaches the real value at the same rank
  (lightest simulated household -> lightest real quantile, etc.). Flow rates are unchanged. Needs the
  households.csv of an uncalibrated run with the same seed (--base).

Usage:
  python generate_simdeum_households.py                          # 30 households, 1–21 Oct 2026
  python generate_simdeum_households.py --calibrate-to ../nwsdb/nwsdb_households.csv --out out_calibrated
  python generate_simdeum_households.py --households 5 --seed 7
  python generate_simdeum_households.py --start 2026-10-01 --end 2026-10-07 --households 50
"""
import argparse
import csv
import gzip
import hashlib
import math
import os
import random
import sys
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")  # pySIMDEUM emits many pandas FutureWarnings
# pySIMDEUM imports matplotlib; nothing is plotted here. Force a headless backend so a
# notebook's inline backend setting (e.g. Colab's MPLBACKEND) doesn't break the import.
os.environ["MPLBACKEND"] = "Agg"

from pysimdeum.core.house import Property  # noqa: E402
from pysimdeum.core.statistics import Statistics  # noqa: E402

# Reuse the loop's measured constants from the single-household generator.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "loop_household"))
from generate_dataset import (  # noqa: E402
    poisson, DIP_PROB, DIP_RANGE, DRIFT_SD, DRIFT_TAU_S, DROPOUTS, FLOW_CAP_LPM, GAP_PERCENTILES,
    IDLE_NOISE_PROB, IDLE_ONE_PULSE, K_HZ_PER_LPM, LABEL_RANK, PULSES_PER_LITRE,
    PUMP_MAX_LPM, PUMP_MEAN_LPM, PUMP_MIN_LPM, PUMP_RUN_SD, STEADY_NOISE, TZ,
)

SIMDEUM_SHOWER_LPM = 0.142 * 60  # SIMDEUM NormalShower intensity (0.142 L/s ≈ 8.5 L/min)
K_SCALE = PUMP_MEAN_LPM / SIMDEUM_SHOWER_LPM  # ≈ 0.41, one constant for every household
HOUSE_TYPES = ["one_person", "two_person", "family"]
DAY_S = 24 * 3600
NIGHT_SHIFT_EVERY = 6   # every 6th household (H06, H12, …) works nights…
NIGHT_SHIFT_H = 10      # …so its whole routine runs 10 h later
LEAK_SHAPES = ["steady", "cistern", "growing"]
# Hard normal cases: (event name, events per day, (min, max) minutes, local hours, fraction of pump level)
HARD_NORMALS = [
    ("garden", 0.25, (10, 30), [6, 7, 16, 17, 18], (0.6, 1.0)),
    ("tank_fill", 0.2, (5, 20), [6, 7, 8, 9, 10, 17, 18, 19, 20], (0.95, 1.0)),
]

# SIMDEUM end-use class → event name used in the AquaFlow dataset.
EVENT_NAMES = {
    "Wc": "toilet", "KitchenTap": "kitchen", "BathroomTap": "handwash", "Shower": "shower",
    "Bathtub": "bathtub", "WashingMachine": "washing_machine", "Dishwasher": "dishwasher",
    "OutsideTap": "outside_tap",
}


def build_household(house_type, stats):
    """A random SIMDEUM household: people + fixtures (same steps as pysimdeum.built_house,
    without its 100-pattern warm-up simulation, which costs ~1 GB of RAM)."""
    house = Property(statistics=stats).built_house(house_type=house_type)
    house.populate_house()
    house.furnish_house()
    return house


def simulate_day(house, stats, weekend):
    """Per-second flow (L/min) of each fixture for one day: array [fixture, second]."""
    for user in house.users:
        user.compute_presence(weekday=not weekend, statistics=stats)  # fresh routine per day
    c = house.simulate(num_patterns=1)
    c = c.sel(flowtypes="totalflow").sum("user").isel(patterns=0)  # [time, enduse], L/s
    return c.transpose("enduse", "time").values[:, :DAY_S] * 60, list(c.coords["enduse"].values)


def thin(per_fixture, keep_prob, rng):
    """Keep each continuous use of each fixture with probability keep_prob (drop the rest)."""
    out = per_fixture.copy()
    for i in range(out.shape[0]):
        ed = np.flatnonzero(np.diff(np.r_[0, (out[i] > 0).astype(np.int8), 0]))
        for s, e in zip(ed[::2], ed[1::2]):
            if rng.random() >= keep_prob:
                out[i, s:e] = 0.0
    return out


def calibrated_targets(base_csv, real_csv, n_households, min_usable_months=12):
    """Usage multiplier per household so the simulated households' litres/day match the REAL
    distribution (NWSDB bills). Rank-matching: the i-th lightest simulated household gets the
    real litres/day at the same quantile, so bigger households keep the bigger targets."""
    base = {r["household_id"]: float(r["simdeum_litres_per_day"]) for r in csv.DictReader(open(base_csv))}
    real = sorted(float(r["median_litres_per_day"]) for r in csv.DictReader(open(real_csv))
                  if r["median_litres_per_day"] and int(r["usable_months"]) >= min_usable_months)
    ids = [f"H{i + 1:02d}" for i in range(n_households)]
    order = sorted(ids, key=lambda h: base[h])
    out = {}
    for rank, h in enumerate(order):
        q = (rank + 0.5) / len(order)
        target = float(np.quantile(real, q))
        out[h] = {"target": round(target, 1), "multiplier": round(target / base[h], 3)}
    return out


def generate_household(hid, house_type, start_date, end_date, n_micro, n_burst, seed, out_dir, night_shift=False,
                       usage_multiplier=1.0):
    rng = random.Random(seed)
    cal_rng = random.Random(seed + 7_919)  # calibration draws kept separate from the main stream
    np.random.seed(seed % (2 ** 32))  # pySIMDEUM draws from numpy's global generator
    stats = Statistics()
    house = build_household(house_type, stats)

    t0 = datetime.combine(start_date, datetime.min.time(), TZ)
    n_days = (end_date - start_date).days + 1
    n_sec = n_days * DAY_S
    device = hashlib.md5(hid.encode()).hexdigest()[:24]  # stable fake ObjectId per household

    def pump_level():
        return min(PUMP_MAX_LPM, max(PUMP_MIN_LPM, rng.gauss(PUMP_MEAN_LPM, PUMP_RUN_SD)))

    def drift(n):
        a = math.exp(-1 / DRIFT_TAU_S)
        b = DRIFT_SD * math.sqrt(1 - a * a)
        d, out = rng.gauss(0, DRIFT_SD), np.empty(n)
        for i in range(n):
            d = a * d + rng.gauss(0, b)
            out[i] = d
        return out

    # ── 1–3. SIMDEUM household use, adapted to the loop ─────────────────────
    flow = np.zeros(n_sec)                 # household use, L/min, per second
    tag = np.zeros(n_sec, dtype=np.int16)  # index into kinds; 0 = idle
    kinds = ["idle"]
    events = []
    raw_litres = 0.0
    for d in range(n_days):
        day = start_date + timedelta(days=d)
        per_fixture, enduses = simulate_day(house, stats, weekend=day.weekday() >= 5)
        if usage_multiplier != 1.0:
            # Calibration: more (or fewer) uses of the same fixtures at the household's usual
            # times — overlay extra independently simulated days of THIS household; the
            # fractional part keeps a random share of one more day's uses. Flow rates unchanged.
            whole, frac = int(usage_multiplier), usage_multiplier - int(usage_multiplier)
            if whole == 0:
                per_fixture = thin(per_fixture, frac, cal_rng)
            else:
                for _ in range(whole - 1):
                    per_fixture = per_fixture + simulate_day(house, stats, weekend=day.weekday() >= 5)[0]
                if frac > 0:
                    per_fixture = per_fixture + thin(simulate_day(house, stats, weekend=day.weekday() >= 5)[0], frac, cal_rng)
        if night_shift:  # the whole routine moves NIGHT_SHIFT_H later: active at night, asleep by day
            per_fixture = np.roll(per_fixture, NIGHT_SHIFT_H * 3600, axis=1)
        raw_litres += per_fixture.sum() / 60
        names = [EVENT_NAMES.get(e, e.lower()) for e in enduses]
        for n in names:
            if n not in kinds:
                kinds.append(n)
        off = d * DAY_S
        total = per_fixture.sum(axis=0)
        dominant = per_fixture.argmax(axis=0)
        # One pump level per continuous run of use, as the real loop settles per run.
        active = total > 0
        edges = np.flatnonzero(np.diff(np.r_[0, active.astype(np.int8), 0]))
        for s, e in zip(edges[::2], edges[1::2]):
            seg = total[s:e] * K_SCALE * (pump_level() / PUMP_MEAN_LPM)
            flow[off + s:off + e] = np.minimum(FLOW_CAP_LPM, np.maximum(0.0, seg))
            tag[off + s:off + e] = [kinds.index(names[i]) for i in dominant[s:e]]
        # Ground truth: each continuous use of each fixture.
        for i, name in enumerate(names):
            on = per_fixture[i] > 0
            ed = np.flatnonzero(np.diff(np.r_[0, on.astype(np.int8), 0]))
            for s, e in zip(ed[::2], ed[1::2]):
                vol = float(np.minimum(FLOW_CAP_LPM, per_fixture[i, s:e] * K_SCALE).sum() / 60)
                events.append((off + s, off + e, name, "normal", round(vol, 2)))

    # ── 3b. Hard NORMAL cases: long, continuous, legitimate use ─────────────
    # Garden watering and tank/bucket filling run at pump level for 5–30 min — longer
    # than any fixture and overlapping the shortest bursts — so the model must learn
    # that "long" alone is not a burst. Labelled normal.
    def place_daily(day_index, hours):
        return day_index * DAY_S + rng.choice(hours) * 3600 + rng.randint(0, 3599)

    for kind, per_day, minutes, hours, frac in HARD_NORMALS:
        if kind not in kinds:
            kinds.append(kind)
        for d in range(n_days):
            for _ in range(poisson(rng, per_day)):
                dur = rng.randint(minutes[0] * 60, minutes[1] * 60)
                start = place_daily(d, hours)
                end = min(n_sec, start + dur)
                lpm = rng.uniform(*frac) * np.maximum(0.0, pump_level() + drift(end - start))
                flow[start:end] = np.minimum(FLOW_CAP_LPM, flow[start:end] + lpm)
                tag[start:end] = kinds.index(kind)
                events.append((start, end, kind, "normal", round(float(lpm.sum() / 60), 2)))

    # ── 4. Anomalies ────────────────────────────────────────────────────────
    # Micro-leaks come in three realistic shapes, with flows that OVERLAP normal use so
    # flow level alone can't identify them:
    #   steady   — a constant trickle, 0.15–1.5 L/min, 2–10 h
    #   cistern  — a leaking toilet cistern: refills at pump level for 8–20 s every
    #              1.5–5 min, 2–8 h (a pattern the physical loop can reproduce)
    #   growing  — starts at ~0.05 L/min and grows to 0.4–1.2 L/min over 3–12 h
    # Bursts: the pump flat out non-stop for 20–75 min (as in ../loop_household).
    leak = np.zeros(n_sec)
    burst = np.zeros(n_sec)
    label = np.zeros(n_sec, dtype=np.int8)

    def place(duration_s):
        return rng.randint(0, max(0, n_sec - duration_s - 1))

    for _ in range(n_micro):
        shape = rng.choice(LEAK_SHAPES)
        if shape == "steady":
            dur = rng.randint(2 * 3600, 10 * 3600)
            start = place(dur)
            leak[start:start + dur] += rng.uniform(0.15, 1.5)
        elif shape == "cistern":
            dur = rng.randint(2 * 3600, 8 * 3600)
            start, t, every = place(dur), 0, rng.randint(90, 300)
            while t < dur:
                fill = rng.randint(8, 20)
                leak[start + t:start + min(dur, t + fill)] += 0.9 * pump_level()
                t += every + rng.randint(-15, 15)
        else:  # growing
            dur = rng.randint(3 * 3600, 12 * 3600)
            start = place(dur)
            leak[start:start + dur] += np.linspace(0.05, rng.uniform(0.4, 1.2), dur)
        label[start:start + dur] = np.maximum(label[start:start + dur], LABEL_RANK["micro_leak"])
        events.append((start, start + dur, f"{shape}_leak", "micro_leak",
                       round(float(leak[start:start + dur].sum() / 60), 2)))
    for _ in range(n_burst):
        dur = rng.randint(20 * 60, 75 * 60)
        start = place(dur)
        burst[start:start + dur] = np.maximum(0.0, pump_level() + drift(dur))
        label[start:start + dur] = LABEL_RANK["burst"]
        events.append((start, start + dur, "burst", "burst", round(float(burst[start:start + dur].sum() / 60), 2)))

    # True flow the meter sees each second: a burst overrides use; otherwise use + leak, capped.
    true = np.where(burst > 0, burst, np.minimum(FLOW_CAP_LPM, flow + leak))
    csum = np.r_[0.0, np.cumsum(true)]
    lab_csum = {k: np.r_[0, np.cumsum(label >= k)] for k in (1, 2)}

    # ── 5. Readings, timed and measured like the real device ────────────────
    def normal_gap():
        x = rng.random() * 100
        i = min(int(x), 99)
        return GAP_PERCENTILES[i] + (GAP_PERCENTILES[i + 1] - GAP_PERCENTILES[i]) * (x - i)

    def utc(sec):
        return (t0 + timedelta(seconds=float(sec))).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z")

    inv_label = {v: k for k, v in LABEL_RANK.items()}
    rows = []  # (timestamp, flowRate, volume, event, label, is_anomaly, t_seconds)
    carry = 0.0
    t = rng.uniform(0, 6)
    while True:
        gap, missed = normal_gap(), False
        u = rng.random()
        for prob, lo, hi in DROPOUTS:
            if u < prob:
                gap, missed = rng.uniform(lo, hi), True
                break
            u -= prob
        t += gap
        if t >= n_sec:
            break
        window = normal_gap() if missed else gap
        if missed:
            carry = 0.0
        a, b = max(0, int(t - window)), int(t)
        b = max(a + 1, b)
        true_lpm = (csum[b] - csum[a]) / (b - a)
        if true_lpm > 0:
            true_lpm *= max(0.0, 1 + rng.gauss(0, STEADY_NOISE))
            if true_lpm > 2 and rng.random() < DIP_PROB:
                true_lpm *= rng.uniform(*DIP_RANGE)
            carry += true_lpm * K_HZ_PER_LPM * window
            pulses = int(carry)
            carry -= pulses
        else:
            carry = 0.0
            if rng.random() < IDLE_NOISE_PROB:
                pulses = 1 if rng.random() < IDLE_ONE_PULSE else rng.randint(2, 14)
            else:
                pulses = 0
        lab = 2 if lab_csum[2][b] - lab_csum[2][a] else 1 if lab_csum[1][b] - lab_csum[1][a] else 0
        tags = tag[a:b][flow[a:b] > 0]
        event = kinds[int(np.bincount(tags).argmax())] if len(tags) else "idle"
        rows.append((utc(t), round(pulses / window / K_HZ_PER_LPM, 2), round(pulses / PULSES_PER_LITRE, 4),
                     event, inv_label[lab], 1 if lab else 0, t))

    hdir = out_dir / hid
    hdir.mkdir(parents=True, exist_ok=True)
    with gzip.open(hdir / "readings.csv.gz", "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "device", "flowRate", "volume", "event", "label", "is_anomaly", "household_id"])
        w.writerows((r[0], device, r[1], r[2], r[3], r[4], r[5], hid) for r in rows)

    buckets = {}
    for r in rows:
        buckets.setdefault(int(r[6] // 60), []).append(r)
    with open(hdir / "1min.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "device", "flowRateMean", "flowRateMax", "volume", "readings", "label",
                    "is_anomaly", "household_id"])
        for m in sorted(buckets):
            chunk = buckets[m]
            flows = [r[1] for r in chunk]
            lab = max(chunk, key=lambda r: LABEL_RANK[r[4]])[4]
            w.writerow((utc(m * 60), device, round(sum(flows) / len(flows), 3), max(flows),
                        round(sum(r[2] for r in chunk), 4), len(chunk), lab, 1 if lab != "normal" else 0, hid))

    events.sort()
    with open(hdir / "events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["start", "end", "duration_s", "type", "label", "approx_volume_l", "household_id"])
        for s, e, kind, lab, vol in events:
            w.writerow((utc(s), utc(e), int(e - s), kind, lab, vol, hid))

    people = [f"{u.age}{'/job' if getattr(u, 'job', False) else ''}" for u in house.users]
    return {
        "household_id": hid,
        "device": device,
        "house_type": house_type,
        "routine": "night_shift" if night_shift else "day",
        "people": len(house.users),
        "members": " ".join(people),
        "fixtures": " ".join(type(a).__name__ for a in house.appliances),
        "usage_multiplier": usage_multiplier,
        "simdeum_litres_per_day": round(raw_litres / n_days, 1),
        # Normal use only (anomalies excluded), as the meter measured it on the loop.
        "loop_litres_per_day": round(sum(r[2] for r in rows if r[4] == "normal") / n_days, 1),
        "readings": len(rows),
        "micro_leaks": n_micro,
        "bursts": n_burst,
        "seed": seed,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default="2026-10-01")
    ap.add_argument("--end", default="2026-10-21")
    ap.add_argument("--households", type=int, default=30)
    ap.add_argument("--micro-leaks", type=int, default=4, help="micro-leaks per household")
    ap.add_argument("--bursts", type=int, default=2, help="bursts per household")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(Path(__file__).parent / "out"))
    ap.add_argument("--first", type=int, default=1, help="generate only households FIRST..LAST (1-based) — "
                    "to split a large run across parallel processes; ids and seeds are unchanged")
    ap.add_argument("--last", type=int, default=None)
    ap.add_argument("--calibrate-to", help="real per-household usage (../nwsdb/nwsdb_households.csv): "
                    "scale each household's usage so the litres/day distribution matches it")
    ap.add_argument("--base", default=str(Path(__file__).parent / "out" / "households.csv"),
                    help="households.csv of an UNCALIBRATED run with the same --seed/--households/dates "
                         "(gives each household's natural litres/day for the calibration)")
    a = ap.parse_args()

    start, end = datetime.fromisoformat(a.start).date(), datetime.fromisoformat(a.end).date()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    targets = calibrated_targets(a.base, a.calibrate_to, a.households) if a.calibrate_to else {}
    first, last = a.first, a.last or a.households
    summary = []
    for i in range(first - 1, last):
        hid = f"H{i + 1:02d}"
        house_type = HOUSE_TYPES[i % len(HOUSE_TYPES)]
        night = (i + 1) % NIGHT_SHIFT_EVERY == 0
        mult = targets[hid]["multiplier"] if targets else 1.0
        info = generate_household(hid, house_type, start, end, a.micro_leaks, a.bursts, a.seed * 1000 + i, out,
                                  night_shift=night, usage_multiplier=mult)
        if targets:
            info["calibration_target_litres_per_day"] = targets[hid]["target"]
        summary.append(info)
        print(f"{hid}  {house_type:<10} {info['routine']:<11} {info['people']} people  {info['simdeum_litres_per_day']:>6} L/day (SIMDEUM)"
              f"  {info['loop_litres_per_day']:>6} L/day (loop)  {info['readings']} readings", flush=True)

    # A partial run (--first/--last) writes its own summary file; merge them afterwards.
    name = "households.csv" if (first, last) == (1, a.households) else f"households_{first:03d}-{last:03d}.csv"
    with open(out / name, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0]))
        w.writeheader()
        w.writerows(summary)
    print(f"\n{len(summary)} households → {out}")


if __name__ == "__main__":
    main()
