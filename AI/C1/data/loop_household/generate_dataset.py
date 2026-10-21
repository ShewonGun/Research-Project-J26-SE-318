"""
AquaFlow — synthetic household water-flow dataset for training leak-detection models.

Simulates one household meter (ESP32-A1) in the SAME FORMAT the backend stores real
readings in (MongoDB `readings`): timestamp (UTC, ms), device (ObjectId), flowRate
(L/min, 2 dp), volume (L, 4 dp) — plus training labels in extra columns.

Each reading is produced the way the firmware produces it: YF-S201 pulses are counted
over the time since the previous measurement, flowRate = pulses / seconds / K and
volume = pulses / 450.

Grounded in the real device (ESP32-A1, measured from the database):
  • Pump flow (new sensor, 4 clean runs on 10 Oct 2026, 70 steady readings):
    mean 3.49 L/min; each run settles at its own level (3.27–3.78) and drifts
    slowly during the run (up to ~0.4 L/min per minute); reading noise sd ≈ 0.07.
    Occasional brief dips mid-run (e.g. 3.69 → 1.02 → 2.86 → 3.36).
  • Idle noise — 4.9 % of idle readings are non-zero (13 of 265): about half one
    pulse (0.02 L/min), the rest 0.05–0.30 L/min. No drain-off after a run stops.
  • Reading spacing — the full measured distribution of 3,086 normal gaps
    (1–7 Oct 2026): median 5.77 s, 5–95 % range 5.60–6.60 s, mean 5.90 s.
  • Missed readings — 1.86 % of gaps are longer (9–15 s: 0.94 %, 15–30 s: 0.46 %,
    30–120 s: 0.46 %). As in the current firmware, water used during a missed
    reading is lost, not added to the next one.
The loop's pump caps the flow, so household fixtures draw a fraction of the pump's
level and overlapping use can never exceed FLOW_CAP_LPM.

Household model (4 people, Sri Lanka local time, weekday/weekend profiles):
  handwash, toilet refill, kitchen tap, shower, washing machine (multi-fill), cleaning.

Labelled anomalies (ground truth for supervised training):
  • micro_leak — a continuous low trickle (0.18–0.45 L/min, inside the backend
    detector's 0.15–2.5 band) for hours, underneath normal usage.
  • burst      — the pump running flat out (its full level) non-stop for 20–75 min,
    far longer than any normal fixture. NOTE: on this loop a burst is capped at the
    pump's flow, so it is below the backend's absolute 30 L/min rule — a model must
    learn it from duration/continuity, which is the point of the dataset.

Outputs (in ./out), all timestamps UTC like the database:
  aquaflow_<start>_<end>_readings.csv  one row per reading (main training file)
      timestamp, device, flowRate, volume   ← identical to real stored readings
      event, label, is_anomaly              ← training labels (not in real data)
  aquaflow_<start>_<end>_1min.csv      same data aggregated per minute
  aquaflow_<start>_<end>_events.csv    ground-truth list of every usage event / anomaly

Usage:
  python generate_dataset.py                       # 2026-10-01 .. 2026-10-21, seed 42
  python generate_dataset.py --start 2026-10-01 --end 2026-10-21 --seed 7
  python generate_dataset.py --no-anomalies --start 2026-10-02 --end 2026-10-15   # normal use only
"""
import argparse
import csv
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Real-loop constants (see module docstring) ──────────────────────────────
PUMP_MEAN_LPM = 3.49        # mean steady flow, new sensor (10 Oct 2026)
PUMP_RUN_SD = 0.20          # spread of each run's settled level (3.27–3.78 observed)
PUMP_MIN_LPM, PUMP_MAX_LPM = 3.0, 3.95
DRIFT_SD = 0.15             # slow within-run drift (L/min), Ornstein–Uhlenbeck…
DRIFT_TAU_S = 60            # …with ~1 minute memory
STEADY_NOISE = 0.02         # reading-to-reading noise, ≈ 0.07 L/min at pump flow
FLOW_CAP_LPM = 3.95         # pump can't deliver more, however many taps are open
DIP_PROB = 0.008            # chance a running reading is a brief dip…
DIP_RANGE = (0.25, 0.8)     # …to this fraction of the flow
K_HZ_PER_LPM = 7.5          # YF-S201
INTERVAL_S = 5              # nominal firmware delay (real spacing is sampled below)
PULSES_PER_LITRE = K_HZ_PER_LPM * 60  # 450
DEVICE_ID = "ESP32-A1"
DEVICE_OBJECT_ID = "6a703b4ddf385c301c495152"  # ESP32-A1's real `device` id in MongoDB

# Real spacing between stored readings (seconds): the 0th..100th percentiles of
# 3,086 normal gaps from ESP32-A1 (1–7 Oct 2026), sampled by interpolation.
# (The 0th percentile, a 0.19 s duplicate, is replaced by the next real value.)
GAP_PERCENTILES = [5.500, 5.519, 5.550, 5.579, 5.596, 5.602, 5.611, 5.617, 5.623, 5.628, 5.630, 5.633,
                   5.636, 5.639, 5.641, 5.643, 5.645, 5.649, 5.653, 5.659, 5.666, 5.671, 5.676, 5.680,
                   5.685, 5.691, 5.697, 5.703, 5.708, 5.711, 5.714, 5.717, 5.718, 5.720, 5.722, 5.724,
                   5.727, 5.729, 5.731, 5.734, 5.737, 5.740, 5.745, 5.749, 5.752, 5.755, 5.758, 5.761,
                   5.765, 5.770, 5.778, 5.785, 5.793, 5.802, 5.809, 5.822, 5.828, 5.833, 5.837, 5.841,
                   5.846, 5.853, 5.860, 5.871, 5.882, 5.891, 5.905, 5.919, 5.928, 5.937, 5.946, 5.954,
                   5.963, 5.971, 5.983, 5.996, 6.011, 6.026, 6.034, 6.043, 6.052, 6.064, 6.075, 6.102,
                   6.127, 6.150, 6.166, 6.199, 6.221, 6.245, 6.271, 6.302, 6.349, 6.408, 6.497, 6.602,
                   6.725, 6.980, 7.363, 8.172, 8.921]
# Missed readings: (probability per reading, min gap s, max gap s).
DROPOUTS = [(0.0094, 9, 15), (0.0046, 15, 30), (0.0046, 30, 120)]
TZ = timezone(timedelta(hours=5, minutes=30))  # Asia/Colombo

# ── Household behaviour ─────────────────────────────────────────────────────
# Relative likelihood of an event starting in each local hour (0..23).
WEEKDAY_PROFILE = [0.2, 0.1, 0.1, 0.1, 0.3, 2.0, 6.0, 7.0, 4.0, 2.5, 2.0, 2.0,
                   3.0, 2.5, 1.5, 1.5, 2.0, 3.0, 5.0, 6.0, 5.0, 3.5, 1.5, 0.6]
WEEKEND_PROFILE = [0.3, 0.2, 0.1, 0.1, 0.1, 0.5, 2.0, 4.5, 6.0, 5.0, 3.5, 3.0,
                   3.5, 3.0, 2.5, 2.5, 2.5, 3.0, 4.5, 5.5, 5.0, 4.0, 2.0, 0.8]
SHOWER_PROFILE = [0, 0, 0, 0, 0.2, 2.5, 6.0, 5.0, 1.5, 0.5, 0.3, 0.2,
                  0.2, 0.2, 0.2, 0.3, 0.5, 1.5, 3.5, 3.0, 2.0, 0.8, 0.2, 0]
LAUNDRY_PROFILE = [0, 0, 0, 0, 0, 0, 0.5, 1.5, 3.0, 4.0, 3.5, 2.5,
                   1.5, 1.5, 2.0, 2.5, 2.0, 1.0, 0.5, 0.2, 0, 0, 0, 0]

# name: (events/day weekday, events/day weekend, hourly profile)
EVENT_RATES = {
    "handwash": (22, 24, None),
    "toilet": (18, 20, None),
    "kitchen": (7, 9, None),
    "shower": (3.5, 3.8, SHOWER_PROFILE),
    "washing_machine": (0.4, 1.1, LAUNDRY_PROFILE),
    "cleaning": (0.3, 0.8, None),
}

# Anomalies over the whole period: (count, kind)
N_MICRO_LEAKS = 3
N_BURSTS = 2
IDLE_NOISE_PROB = 0.049  # share of idle readings that are non-zero on the real rig
IDLE_ONE_PULSE = 0.5     # of those, share that are a single pulse (else 2–14 pulses)

LABEL_RANK = {"normal": 0, "micro_leak": 1, "burst": 2}


def poisson(rng, lam):
    """Knuth's Poisson sampler (lam is small here)."""
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def pick_hour(rng, profile):
    return rng.choices(range(24), weights=profile)[0]


def event_shape(rng, kind):
    """Return a list of (offset_s, duration_s, fraction_of_loop_max) segments."""
    if kind == "handwash":
        return [(0, rng.randint(8, 40), rng.uniform(0.35, 0.75))]
    if kind == "toilet":  # cistern refill
        return [(0, rng.randint(40, 90), rng.uniform(0.9, 1.0))]
    if kind == "kitchen":  # dishes / cooking: tap adjusted every ~40 s
        total = int(min(480, max(30, rng.lognormvariate(math.log(150), 0.6))))
        segs, t = [], 0
        while t < total:
            d = min(total - t, rng.randint(25, 60))
            segs.append((t, d, rng.uniform(0.5, 1.0)))
            t += d
        return segs
    if kind == "shower":
        return [(0, rng.randint(300, 720), rng.uniform(0.9, 1.0))]
    if kind == "washing_machine":  # 3–4 fill cycles separated by wash/rinse
        segs, t = [], 0
        for _ in range(rng.randint(3, 4)):
            d = rng.randint(90, 180)
            segs.append((t, d, 1.0))
            t += d + rng.randint(480, 1200)
        return segs
    if kind == "cleaning":  # buckets / floor washing
        return [(0, rng.randint(120, 300), 1.0)]
    raise ValueError(kind)


def generate(start_date, end_date, seed, out_dir):
    rng = random.Random(seed)
    t0 = datetime.combine(start_date, datetime.min.time(), TZ)
    t_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), TZ)
    n_sec = int((t_end - t0).total_seconds())

    flow = [0.0] * n_sec          # normal usage, L/min, per second
    best = [0.0] * n_sec          # largest single-event contribution (for the event tag)
    tag = [0] * n_sec             # index into kinds; 0 = idle
    kinds = ["idle"] + list(EVENT_RATES)
    events = []                   # ground-truth event list

    def pump_level():
        return min(PUMP_MAX_LPM, max(PUMP_MIN_LPM, rng.gauss(PUMP_MEAN_LPM, PUMP_RUN_SD)))

    def drift(n):
        """Slow within-run wander around the settled level (one value per second)."""
        a = math.exp(-1 / DRIFT_TAU_S)
        b = DRIFT_SD * math.sqrt(1 - a * a)
        d = rng.gauss(0, DRIFT_SD)
        for _ in range(n):
            d = a * d + rng.gauss(0, b)
            yield d

    # ── Normal household usage ──────────────────────────────────────────────
    day = start_date
    while day <= end_date:
        weekend = day.weekday() >= 5
        day_start = int((datetime.combine(day, datetime.min.time(), TZ) - t0).total_seconds())
        for kind, (wd, we, prof) in EVENT_RATES.items():
            profile = prof or (WEEKEND_PROFILE if weekend else WEEKDAY_PROFILE)
            for _ in range(poisson(rng, we if weekend else wd)):
                start = day_start + pick_hour(rng, profile) * 3600 + rng.randint(0, 3599)
                segs = event_shape(rng, kind)
                end = start
                vol = 0.0
                level = pump_level()
                for off, dur, frac in segs:
                    for s, d in zip(range(start + off, min(n_sec, start + off + dur)), drift(dur)):
                        lpm = frac * max(0.0, level + d)
                        flow[s] += lpm
                        if lpm > best[s]:
                            best[s], tag[s] = lpm, kinds.index(kind)
                        vol += lpm / 60
                    end = max(end, start + off + dur)
                if start < n_sec:
                    events.append((start, min(end, n_sec), kind, "normal", round(vol, 2)))
        day += timedelta(days=1)

    # ── Anomalies ───────────────────────────────────────────────────────────
    leak = [0.0] * n_sec
    burst = [0.0] * n_sec  # pump flat out: overrides household use while active
    label = [0] * n_sec  # LABEL_RANK value

    def place(duration_s):
        return rng.randint(0, max(0, n_sec - duration_s - 1))

    for _ in range(N_MICRO_LEAKS):
        dur = rng.randint(3 * 3600, 10 * 3600)
        start, rate = place(dur), rng.uniform(0.18, 0.45)
        for s in range(start, start + dur):
            leak[s] += rate
            label[s] = max(label[s], LABEL_RANK["micro_leak"])
        events.append((start, start + dur, "micro_leak", "micro_leak", round(rate * dur / 60, 2)))

    for _ in range(N_BURSTS):
        dur = rng.randint(20 * 60, 75 * 60)
        start, level, vol = place(dur), pump_level(), 0.0
        for s, d in zip(range(start, start + dur), drift(dur)):
            burst[s] = max(0.0, level + d)
            label[s] = LABEL_RANK["burst"]
            vol += burst[s] / 60
        events.append((start, start + dur, "burst", "burst", round(vol, 2)))

    # ── Readings, timed and measured like the real device ───────────────────
    def normal_gap():
        x = rng.random() * 100
        i = min(int(x), 99)
        return GAP_PERCENTILES[i] + (GAP_PERCENTILES[i + 1] - GAP_PERCENTILES[i]) * (x - i)

    def utc(sec):
        return (t0 + timedelta(seconds=sec)).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z")

    stem = f"aquaflow_{start_date.isoformat()}_{end_date.isoformat()}"
    out_dir.mkdir(parents=True, exist_ok=True)
    inv_label = {v: k for k, v in LABEL_RANK.items()}
    rows5 = []  # (timestamp, device, flowRate, volume, pulses, event, label, is_anomaly, t_seconds)
    carry = 0.0
    t = rng.uniform(0, 6)
    while t < n_sec:
        # Spacing to this reading: usually a normal ~5.8 s gap; sometimes a missed reading.
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
        # Measured window: the time since the firmware's previous measurement. After a
        # missed reading only the last cycle is measured — earlier water is lost.
        window = normal_gap() if missed else gap
        if missed:
            carry = 0.0
        a, b = max(0, int(t - window)), int(t)
        secs = range(a, max(a + 1, b))
        true_lpm = sum(burst[s] or min(FLOW_CAP_LPM, flow[s] + leak[s]) for s in secs) / len(secs)
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
        lab = max(label[s] for s in secs)
        tags = [tag[s] for s in secs if flow[s] > 0]
        event = kinds[max(set(tags), key=tags.count)] if tags else "idle"
        rows5.append((
            utc(t),
            DEVICE_OBJECT_ID,
            round(pulses / window / K_HZ_PER_LPM, 2),
            round(pulses / PULSES_PER_LITRE, 4),
            pulses,
            event,
            inv_label[lab],
            1 if lab else 0,
            t,
        ))

    with open(out_dir / f"{stem}_readings.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "device", "flowRate", "volume", "event", "label", "is_anomaly"])
        w.writerows((r[0], r[1], r[2], r[3], r[5], r[6], r[7]) for r in rows5)

    # ── 1-minute aggregate (UTC minute buckets) ─────────────────────────────
    buckets = {}
    for r in rows5:
        buckets.setdefault(int(r[8] // 60), []).append(r)
    with open(out_dir / f"{stem}_1min.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "device", "flowRateMean", "flowRateMax", "volume", "readings", "label", "is_anomaly"])
        for m in sorted(buckets):
            chunk = buckets[m]
            flows = [r[2] for r in chunk]
            lab = max(chunk, key=lambda r: LABEL_RANK[r[6]])[6]
            w.writerow((utc(m * 60), DEVICE_OBJECT_ID, round(sum(flows) / len(flows), 3), max(flows),
                        round(sum(r[3] for r in chunk), 4), len(chunk), lab, 1 if lab != "normal" else 0))

    # ── Ground-truth events ─────────────────────────────────────────────────
    events.sort()
    with open(out_dir / f"{stem}_events.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["start", "end", "duration_s", "type", "label", "approx_volume_l"])
        for s, e, kind, lab, vol in events:
            w.writerow((utc(s), utc(e), e - s, kind, lab, vol))

    return stem, rows5, events


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", default="2026-10-01")
    ap.add_argument("--end", default="2026-10-21")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(Path(__file__).parent / "out"))
    ap.add_argument("--no-anomalies", action="store_true", help="normal household use only (no leaks or bursts), e.g. for usage forecasting")
    a = ap.parse_args()
    if a.no_anomalies:
        global N_MICRO_LEAKS, N_BURSTS
        N_MICRO_LEAKS = N_BURSTS = 0

    start, end = datetime.fromisoformat(a.start).date(), datetime.fromisoformat(a.end).date()
    stem, rows, events = generate(start, end, a.seed, Path(a.out))

    # Summary
    total_l = sum(r[3] for r in rows)
    days = (end - start).days + 1
    by_label = {}
    for r in rows:
        by_label[r[6]] = by_label.get(r[6], 0) + 1
    print(f"Wrote {stem}_readings.csv ({len(rows):,} rows), _1min.csv, _events.csv to {a.out}")
    print(f"Period: {start} .. {end} ({days} days), total {total_l:,.1f} L, avg {total_l / days:,.1f} L/day")
    print(f"Max flow {max(r[2] for r in rows)} L/min (pump cap {FLOW_CAP_LPM})")
    print("Rows by label:", {k: f"{v:,} ({100 * v / len(rows):.2f}%)" for k, v in by_label.items()})
    print("Anomalies:")
    for s, e, kind, lab, vol in events:
        if lab != "normal":
            print(f"  {kind:10s} {(datetime.combine(start, datetime.min.time(), TZ) + timedelta(seconds=s)):%Y-%m-%d %H:%M}"
                  f"  for {(e - s) / 60:.0f} min  (~{vol} L)")


if __name__ == "__main__":
    main()
