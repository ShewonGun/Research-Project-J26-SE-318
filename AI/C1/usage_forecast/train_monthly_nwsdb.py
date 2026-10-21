"""
AquaFlow — next-month water-usage forecast trained and tested on REAL NWSDB bills.

Data: ../data/nwsdb/nwsdb_monthly.csv — 106 real domestic connections (Kaduwela), monthly bills
Jan 2023 – Aug/Sep 2026 (extract_nwsdb.py). Usage is litres/day over each billing period, so
months of different length compare fairly. Only "usable" months are forecast targets (normal
bill and reading type, 20–45-day period, no meter reset, not part of a ≥ 3-month zero run).

Task: from a household's own past bills, predict the litres/day of its NEXT bill.
Split — households AND time are both held out (no information from the future or from the test
households reaches the model):
  * 6 folds by household: each household is a test household exactly once;
  * models are trained only on bills BEFORE the test period (target month < TEST_FROM) of the
    other households; test = the test households' bills from TEST_FROM on (about 12 months).

Compared:
  last_month       the previous usable bill
  mean3            mean of the last 3 usable bills
  last_year        same month last year (falls back to the household's median)
  median12         the household's median over the last 12 months
  gbm              gradient boosting on features relative to the household's median:
                   last 1–6 bills, same month last year, recent mean/spread, zero / estimated bills
                   lately, target month (seasonality), public holidays in the billing period
  gbm_weather      the same plus the billing period's REAL weather (mean max temperature, total
                   rain; Open-Meteo archive, Kaduwela). Uses the weather that actually happened —
                   it measures whether weather EXPLAINS usage, an upper bound for a forecast that
                   would have to use predicted weather. Skipped when the weather can't be fetched.

Also reported: the real seasonal pattern (each calendar month's usage relative to the household's
median) and how monthly usage moves with rain and temperature.

Usage (from edge-ai/usage_forecast):  python train_monthly_nwsdb.py
Outputs: results_monthly_nwsdb/ (REPORT.md, metrics, predictions, charts)
"""
import argparse
import json
import sys
import warnings
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "leak_detection"))
import calendar_features as cf  # noqa: E402

warnings.filterwarnings("ignore")
TEST_FROM = "2025-09"        # test period: bills from this month on (~ the last 12 months)
N_FOLDS = 6
MAX_RATIO = 3.0              # ratios to the household median are capped here for training
MIN_HISTORY = 6              # usable bills needed in the previous 12 months to forecast
KADUWELA = (6.93, 79.98)
BASE_FEATURES = ["r1", "r2", "r3", "r4", "r5", "r6", "r12", "mean3", "std6", "zeros6", "estimated6",
                 "month_sin", "month_cos", "holidays", "period_days_prev"]
WEATHER_FEATURES = ["tmax_mean", "rain_total", "rain_days"]


def load(path):
    df = pd.read_csv(path, parse_dates=["reading_date"])
    df = df.sort_values(["household_id", "bill_month"]).reset_index(drop=True)
    df["lpd"] = np.where(df["usable"] == 1, df["litres_per_day"], np.nan)
    df["period_start"] = df["reading_date"] - pd.to_timedelta(df["period_days"], unit="D")
    return df


def build_examples(df, weather=None):
    """One row per (household, target bill) with features from the previous bills only."""
    rows = []
    for hh, d in df.groupby("household_id"):
        d = d.reset_index(drop=True)
        y = d["lpd"].values
        for t in range(12, len(d)):
            if np.isnan(y[t]):
                continue
            past = y[t - 12:t]
            if np.sum(~np.isnan(past)) < MIN_HISTORY:
                continue
            med = np.nanmedian(past)
            if not med or med <= 0:
                continue
            lag = lambda k: y[t - k] / med if not np.isnan(y[t - k]) else np.nan  # noqa: E731
            last3 = [v for v in y[:t][::-1] if not np.isnan(v)][:3]
            month = int(d.loc[t, "bill_month"][5:7])
            start, end = d.loc[t, "period_start"], d.loc[t, "reading_date"]
            row = {"household_id": hh, "bill_month": d.loc[t, "bill_month"], "target": y[t], "median12": med,
                   "r1": lag(1), "r2": lag(2), "r3": lag(3), "r4": lag(4), "r5": lag(5), "r6": lag(6), "r12": lag(12),
                   "mean3": np.mean(last3) / med, "std6": np.nanstd(y[t - 6:t]) / med,
                   "zeros6": int(d.loc[t - 6:t - 1, "zero_units"].sum()),
                   "estimated6": int(d.loc[t - 6:t - 1, "type_flag"].sum()),
                   "month_sin": np.sin(2 * np.pi * month / 12), "month_cos": np.cos(2 * np.pi * month / 12),
                   "period_days_prev": d.loc[t - 1, "period_days"],
                   # baselines
                   "b_last_month": last3[0], "b_mean3": np.mean(last3),
                   "b_last_year": y[t - 12] if not np.isnan(y[t - 12]) else med, "b_median12": med}
            days = [(start + timedelta(days=i)).date() for i in range(int((end - start).days))] if pd.notna(start) else []
            row["holidays"] = sum(cf.holiday_flags(dd)[1] for dd in days) if days else np.nan
            if weather is not None and days:
                w = [weather.get(dd) for dd in days]
                w = [x for x in w if x]
                if len(w) >= 0.8 * len(days):
                    row["tmax_mean"] = float(np.mean([x["tmax"] for x in w]))
                    row["rain_total"] = float(np.sum([x["rain_mm"] for x in w]))
                    row["rain_days"] = int(sum(x["rain_mm"] >= cf.RAINY_MM for x in w))
            rows.append(row)
    return pd.DataFrame(rows)


def fetch_weather(df, cache_path):
    """{date: {tmax, rain_mm}} for the whole billing history at Kaduwela, or None if offline."""
    cf.LAT, cf.LON = KADUWELA
    cf.CACHE = cache_path                          # own cache: never mixes with the service's (Colombo) cache
    start = df["period_start"].min().date()
    end = df["reading_date"].max().date()
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    w = cf.weather_for(days, refresh_if_missing=True)
    return w if len(w) >= 0.9 * len(days) else None


def clip(X):
    """Cap ratio features so a single extreme bill can't dominate."""
    X = X.copy()
    for c in ["r1", "r2", "r3", "r4", "r5", "r6", "r12", "mean3", "std6"]:
        if c in X:
            X[c] = X[c].clip(0, MAX_RATIO)
    return X


def metrics(y, p):
    err = np.abs(p - y)
    pos = y > 0
    return {"mae_lpd": round(float(err.mean()), 1), "mae_m3_month": round(float(err.mean() * 30.4 / 1000), 2),
            "wape_pct": round(float(err.sum() / y.sum() * 100), 1),
            "median_ape_pct": round(float(np.median(err[pos] / y[pos]) * 100), 1)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(HERE.parent / "data" / "nwsdb" / "nwsdb_monthly.csv"))
    ap.add_argument("--out", default=str(HERE / "results_monthly_nwsdb"))
    ap.add_argument("--no-weather", action="store_true")
    a = ap.parse_args()
    out = Path(a.out)
    (out / "charts").mkdir(parents=True, exist_ok=True)

    df = load(a.data)
    weather = None if a.no_weather else fetch_weather(df, out / "weather_cache_kaduwela.json")
    print("Weather:", "available (Open-Meteo archive, Kaduwela)" if weather else "NOT available — weather model skipped")
    ex = build_examples(df, weather)
    with_weather = weather is not None and ex[WEATHER_FEATURES].notna().all(axis=1).mean() > 0.9 if weather else False
    print(f"Examples: {len(ex)} bills from {ex['household_id'].nunique()} households "
          f"({ex['bill_month'].min()} → {ex['bill_month'].max()}); test period from {TEST_FROM}")

    # ── Folds: households and time both held out ────────────────────────────
    hh = np.array(sorted(ex["household_id"].unique()))
    np.random.default_rng(0).shuffle(hh)
    folds = np.array_split(hh, N_FOLDS)
    models = {"gbm": BASE_FEATURES} | ({"gbm_weather": BASE_FEATURES + WEATHER_FEATURES} if with_weather else {})
    preds = []
    for k, test_h in enumerate(folds):
        train = ex[~ex["household_id"].isin(test_h) & (ex["bill_month"] < TEST_FROM)]
        test = ex[ex["household_id"].isin(test_h) & (ex["bill_month"] >= TEST_FROM)].copy()
        test["fold"] = k
        for name, cols in models.items():
            # Real bills contain extreme months (e.g. 17x the household's median: a leak, a catch-up
            # after estimated bills, a meter fault). Absolute-error loss (targets the median, robust to
            # them) and capped ratios keep one spike from making the model predict the next one.
            m = HistGradientBoostingRegressor(loss="absolute_error", max_iter=300, learning_rate=0.05,
                                              max_leaf_nodes=15, min_samples_leaf=30, random_state=0)
            m.fit(clip(train[cols]), (train["target"] / train["median12"]).clip(0, MAX_RATIO))
            test[name] = m.predict(clip(test[cols])).clip(0) * test["median12"]
        preds.append(test)
    P = pd.concat(preds)

    names = ["b_last_month", "b_mean3", "b_last_year", "b_median12"] + list(models)
    labels = {"b_last_month": "last month", "b_mean3": "mean of last 3", "b_last_year": "same month last year",
              "b_median12": "12-month median", "gbm": "gradient boosting",
              "gbm_weather": "gradient boosting + real weather"}
    table = []
    for n in names:
        row = {"forecast": labels[n], **metrics(P["target"].values, P[n].values)}
        # 80 % range: ± the 80th percentile of |relative error| on the OTHER folds (honest coverage)
        if n in models:
            cover = []
            for k in range(N_FOLDS):
                other = P[P["fold"] != k]
                q = np.quantile(np.abs(other[n] - other["target"]) / other["median12"], 0.8)
                mine = P[P["fold"] == k]
                cover.append((np.abs(mine[n] - mine["target"]) <= q * mine["median12"]).mean())
            row["coverage_80"] = round(float(np.mean(cover)), 3)
        table.append(row)
    T = pd.DataFrame(table)
    print("\n" + T.to_string(index=False))

    # ── Real seasonality: usage relative to the household's own median, by calendar month ──
    df["ratio"] = df["lpd"] / df.groupby("household_id")["lpd"].transform("median")
    df["month"] = df["bill_month"].str[5:7].astype(int)
    season = df.dropna(subset=["ratio"]).groupby("month")["ratio"].agg(
        median="median", q25=lambda s: s.quantile(0.25), q75=lambda s: s.quantile(0.75), bills="size").round(3)
    print("\nSeasonality (usage / household median, by calendar month):\n" + season.to_string())

    # ── Weather vs usage: network-average monthly ratio against that month's weather ──
    weather_fit = None
    if with_weather:
        g = ex.assign(rel=ex["target"] / ex["median12"]).groupby("bill_month").agg(
            rel=("rel", "median"), tmax=("tmax_mean", "mean"), rain=("rain_total", "mean"), n=("rel", "size"))
        g = g[g["n"] >= 20]
        X = np.c_[np.ones(len(g)), g["tmax"] - g["tmax"].mean(), (g["rain"] - g["rain"].mean()) / 100]
        coef, *_ = np.linalg.lstsq(X, g["rel"].values, rcond=None)
        resid = g["rel"].values - X @ coef
        r2 = 1 - (resid ** 2).sum() / ((g["rel"] - g["rel"].mean()) ** 2).sum()
        weather_fit = {"months": int(len(g)), "per_degree_tmax_pct": round(coef[1] * 100, 2),
                       "per_100mm_rain_pct": round(coef[2] * 100, 2), "r2": round(float(r2), 3)}
        print("\nWeather vs usage (monthly):", weather_fit)

    # ── Charts ──────────────────────────────────────────────────────────────
    import leakdetect as ld
    import matplotlib.pyplot as plt
    bars = T.set_index("forecast")[["wape_pct"]] / 100
    ld.chart_bars(bars, ["wape_pct"], ["WAPE"], "Next-month forecast error on unseen households & months (WAPE, lower is better)",
                  out / "charts" / "1_forecast_error.png", "Error as share of actual use", fmt="{:.0%}")
    fig, ax = plt.subplots(figsize=(8, 4), dpi=150)
    mo = season.index.values
    ax.fill_between(mo, season["q25"], season["q75"], color=ld.BLUE, alpha=0.15, lw=0, label="middle half of bills")
    ax.plot(mo, season["median"], color=ld.BLUE, lw=2, marker="o", ms=5, label="median")
    ax.axhline(1.0, color=ld.INK2, lw=1, ls="--")
    ld._style(ax, "Real seasonality: monthly use vs the household's own median (106 NWSDB households)", "Usage ÷ household median")
    ax.set_xticks(range(1, 13), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])
    ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(out / "charts" / "2_seasonality.png"); plt.close(fig)
    best = "gbm_weather" if with_weather else "gbm"
    hh_pick = P.groupby("household_id").size().idxmax()
    e = P[P["household_id"] == hh_pick].sort_values("bill_month")
    hist = df[df["household_id"] == hh_pick]
    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    ax.plot(hist["bill_month"], hist["lpd"], color=ld.INK2, lw=1.5, marker="o", ms=3, label="actual (usable bills)")
    ax.plot(e["bill_month"], e[best], color=ld.ORANGE, lw=2, marker="o", ms=4, label=f"forecast ({labels[best]})")
    ax.plot(e["bill_month"], e["b_mean3"], color=ld.BLUE, lw=1.5, ls="--", label="mean of last 3 (baseline)")
    ld._style(ax, f"{hh_pick}: next-month forecasts in the test period", "Litres per day")
    ax.set_xticks(hist["bill_month"].values[::3]); ax.tick_params(axis="x", rotation=45)
    ax.legend(fontsize=8, frameon=False)
    fig.tight_layout(); fig.savefig(out / "charts" / "3_example_household.png"); plt.close(fig)

    # ── Report ──────────────────────────────────────────────────────────────
    rep = ["# Next-month usage forecast on real NWSDB bills\n\n",
           f"{len(ex)} bills from {ex['household_id'].nunique()} households. Test: {len(P)} bills from {TEST_FROM} on, "
           f"each household tested once (6 folds); models never see the test households or any bill from the test period.\n\n",
           "## Forecast accuracy (litres/day of the next bill)\n\n```\n" + T.to_string(index=False) + "\n```\n",
           "WAPE = total absolute error ÷ total actual use. mae_m3_month ≈ error in billed units (m³) for a 30-day month.\n",
           "\n## Real seasonality (usage ÷ household median)\n\n```\n" + season.to_string() + "\n```\n",
           "\n## Weather\n\n" + (json.dumps(weather_fit) + "\n" if weather_fit else
                                 "Not run here: the weather archive could not be reached. Run this script on a machine "
                                 "with internet access to add the weather model and the weather-vs-usage fit.\n")]
    (out / "REPORT.md").write_text("".join(rep))
    T.to_csv(out / "forecast_metrics.csv", index=False)
    season.to_csv(out / "seasonality.csv")
    P.drop(columns=[c for c in P.columns if c.startswith("r") and c[1:].isdigit()]).to_csv(out / "test_predictions.csv", index=False)
    print(f"\nSaved → {out}")


if __name__ == "__main__":
    main()
