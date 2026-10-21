"""
Build a second, PATTERNED daily-usage dataset from the pattern-free simulated households.

The SIMDEUM households redraw every day's routine independently, so their daily litres have no
weekly rhythm and no day-to-day memory (see results/). Real households do. This script keeps
each simulated day's total and multiplies it by documented, ASSUMED pattern factors:

  weekend uplift   weekend days use more:  +U(0, 25) % per household            [assumption]
  absence spells   ~1 per 4 weeks, 2-6 days away, usage x 0.1                    [assumption]
  guest spells     ~1 per 3 weeks, 1-3 days, usage x 1.3                         [assumption]
  slow drift       household-specific linear trend, U(-0.10, +0.10) % per day    [assumption]

With --with-weather the REAL weather and Sri Lankan holidays for those dates (calendar_features.py)
also change usage, by ASSUMED amounts:
  hot days         +3 % per degree of daily maximum above 29 C                    [assumption]
  rainy days       -8 % when rainfall >= 5 mm                                     [assumption]
  public holidays  +10 % (people at home)                                         [assumption]
The weather and holiday dates are real; the effect sizes are made up. A model trained on this data
learning them proves the pipeline works, not that real households respond this way.

THESE ARE ASSUMPTIONS, NOT MEASUREMENTS. The ranges are in the typical order reported by
residential water-demand studies, but check/replace them with citations you can verify before
quoting them. Accuracy on this dataset shows the model can learn patterns of this kind; it does
not show that real households have them. Change the constants below to test other assumptions.

Output: data/patterned_daily.csv  (home, day, litres, house_type, weekend_uplift) and
        data/pattern_log.csv (every spell injected, for transparency).
Usage:  python make_patterned_daily.py [--seed 11] [--with-weather]   (second form -> data/patterned_weather_daily.csv)
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from train_forecast import HERE, load_daily
import calendar_features as cf

WEEKEND_UPLIFT_MAX = 0.25
ABSENCE_PER_DAY, ABSENCE_LEN, ABSENCE_FACTOR = 1 / 28, (2, 6), 0.1
GUEST_PER_DAY, GUEST_LEN, GUEST_FACTOR = 1 / 21, (1, 3), 1.3
DRIFT_PER_DAY = (-0.001, 0.001)
HOT_BASE_C, PER_DEGREE, RAIN_EFFECT, HOLIDAY_EFFECT = 29.0, 0.03, -0.08, 0.10


def spells(rng, n, rate, length):
    """(start_index, length) of spells over n days, separated by random gaps."""
    out, i = [], 0
    while i < n:
        i += int(rng.exponential(1 / rate)) + 1
        if i >= n:
            break
        ln = int(rng.integers(length[0], length[1] + 1))
        out.append((i, ln))
        i += ln
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE.parent / "data" / "simdeum" / "out_forecast"))
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--with-weather", action="store_true", help="also apply assumed weather + holiday effects (real weather/holiday dates)")
    ap.add_argument("--season-csv", help="MEASURED seasonality per calendar month (results_monthly_nwsdb/seasonality.csv, "
                    "column median = usage / household median from real NWSDB bills): multiply each day by its month's factor")
    ap.add_argument("--out", help="output CSV (default data/patterned_daily.csv or data/patterned_weather_daily.csv); "
                    "the pattern log goes next to it as <name>_log.csv")
    a = ap.parse_args()
    season = pd.read_csv(a.season_csv).set_index("month")["median"].to_dict() if a.season_csv else None
    rng = np.random.default_rng(a.seed)
    data = Path(a.data)
    info = pd.read_csv(data / "households.csv").set_index("household_id")
    rows, log = [], []
    for h in sorted(info.index):
        d = load_daily(data / h)
        n = len(d)
        factor = np.ones(n)
        up = rng.uniform(0, WEEKEND_UPLIFT_MAX)
        factor[d.index.dayofweek >= 5] *= 1 + up
        for kind, rate, ln, f in (("absence", ABSENCE_PER_DAY, ABSENCE_LEN, ABSENCE_FACTOR),
                                  ("guests", GUEST_PER_DAY, GUEST_LEN, GUEST_FACTOR)):
            for s, length in spells(rng, n, rate, ln):
                factor[s:s + length] *= f
                log.append({"home": h, "kind": kind, "start": d.index[s].date(), "days": min(length, n - s)})
        factor *= 1 + rng.uniform(*DRIFT_PER_DAY) * np.arange(n)
        if a.with_weather:
            cal = cf.table_for([x.date() for x in d.index])
            factor *= (1 + PER_DEGREE * (cal["tmax"].values - HOT_BASE_C).clip(min=-3)) * (1 + RAIN_EFFECT * cal["is_rainy"].values) * (1 + HOLIDAY_EFFECT * cal["is_holiday"].values)
        if season:
            factor *= np.array([season.get(day.month, 1.0) for day in d.index])
        for day, base, fac in zip(d.index, d.values, factor):
            rows.append({"home": h, "day": day.date(), "litres": round(base * fac, 2),
                         "house_type": info.loc[h, "house_type"], "weekend_uplift": round(up, 3)})
    if a.out:
        target = Path(a.out)
        log_path = target.with_name(target.stem + "_log.csv")
    else:
        target = HERE / "data" / ("patterned_weather_daily.csv" if a.with_weather else "patterned_daily.csv")
        log_path = HERE / "data" / ("pattern_log_weather.csv" if a.with_weather else "pattern_log.csv")
    target.parent.mkdir(exist_ok=True, parents=True)
    pd.DataFrame(rows).to_csv(target, index=False)
    pd.DataFrame(log).to_csv(log_path, index=False)
    print(f"{len(rows)} household-days, {len(log)} spells -> {target}")


if __name__ == "__main__":
    main()
