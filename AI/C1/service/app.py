"""
AquaFlow leak-model service — scores a device's recent readings with the trained model.

  POST /score     {"readings": [{"timestamp", "flowRate", "volume"}, ...]}   (last ~12 h)
  POST /forecast  {"lastDay": "YYYY-MM-DD", "history": [{"day", "litres"}, ...]}
                  -> litres for each of the next 7 days with an 80 % range
  GET  /health

Returns, per alarm (micro_leak, burst): the latest score, the saved threshold / persistence
and whether the alarm is active now. Uses the same feature code and alarm rule as training
(leakdetect.py), on COMPLETE minutes only (the minute still in progress is dropped).

The model was trained at AquaFlow-loop scale (pump ≈ 3.5 L/min), so flows are clamped to
MAX_LPM before scoring.

Run (from edge-ai/service):  uvicorn app:app --port 8001
Defaults are the current models (100 households calibrated to real NWSDB usage); the env vars
only override them:
Env: LEAK_MODEL_PATH     (default ../leak_detection/results_calibrated_100/leak_model.joblib)
     FORECAST_MODEL_PATH (default ../usage_forecast/results_calibrated_100/forecast_model.joblib)
     FORECAST_USE_CALENDAR  (default 0; 1 = also use the experimental weather/holiday model, whose
                             effects were ASSUMED, not measured)
     FORECAST_CAL_MODEL_PATH (default ../usage_forecast/results_weather/forecast_model_calendar.joblib)
     FORECAST_LAT / FORECAST_LON (default Colombo)
"""
import os
import sys
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "leak_detection"))
import leakdetect as ld  # noqa: E402

MODEL_PATH = os.environ.get("LEAK_MODEL_PATH", str(HERE.parent / "leak_detection" / "results_calibrated_100" / "leak_model.joblib"))
MAX_LPM = 6.0          # loop scale: anything above is a sensor glitch / out of the model's range
LATCH_MIN = 10         # an alarm stays "active" this long after it last fired (a leaking cistern
                       # only looks like a leak in bursts, with quiet minutes in between)
MIN_MINUTES = 30       # not enough history → no verdict
STALE_MIN = 3          # newest reading older than this → device is offline, no verdict

if not Path(MODEL_PATH).exists():
    sys.exit(f"Leak model not found: {MODEL_PATH}\n"
             "Model files are not in git — copy leak_model.joblib there (or set LEAK_MODEL_PATH).")
saved = joblib.load(MODEL_PATH)
app = FastAPI(title="AquaFlow leak + usage model")

# ── Usage forecast ───────────────────────────────────────────────────────────
sys.path.insert(0, str(HERE.parent / "usage_forecast"))
import threading  # noqa: E402
import time  # noqa: E402
from datetime import date, timedelta  # noqa: E402

import numpy as np  # noqa: E402
import calendar_features as cf  # noqa: E402
import train_forecast as tf  # noqa: E402

FORECAST_PATH = os.environ.get("FORECAST_MODEL_PATH", str(HERE.parent / "usage_forecast" / "results_calibrated_100" / "forecast_model.joblib"))
try:
    forecast_saved = joblib.load(FORECAST_PATH)
except Exception:        # no forecast model on this machine -> simple-average fallback only
    forecast_saved = None
CAL_PATH = os.environ.get("FORECAST_CAL_MODEL_PATH", str(HERE.parent / "usage_forecast" / "results_weather" / "forecast_model_calendar.joblib"))
try:
    calendar_saved = joblib.load(CAL_PATH)
except Exception:
    calendar_saved = None
USE_CALENDAR = os.environ.get("FORECAST_USE_CALENDAR", "0") == "1"  # experimental; off unless asked for


def _refresh_weather_forever():
    """Keep the weather cache fresh: the last few days plus the coming week, every 3 hours."""
    while True:
        try:
            today = date.today()
            cf.refresh(today - timedelta(days=14), today + timedelta(days=8))
        except Exception:
            pass                      # offline: the cache keeps the last values
        time.sleep(3 * 3600)


threading.Thread(target=_refresh_weather_forever, daemon=True).start()
MIN_KNOWN_MODEL = 7      # of the last 14 days, at least this many must have data to use the model
MIN_KNOWN_AVERAGE = 3    # below this there is nothing sensible to forecast from


class Reading(BaseModel):
    timestamp: str
    flowRate: float
    volume: float = 0.0


class ScoreRequest(BaseModel):
    readings: list[Reading]
    now: str | None = None   # testing only: replay history as if this were the current time


@app.get("/health")
def health():
    return {"ok": True, "model": saved["model_type"], "alarms": saved["alarms"], "forecast_model": forecast_saved is not None,
            "calendar_model": calendar_saved is not None and USE_CALENDAR}


@app.post("/score")
def score(req: ScoreRequest):
    if len(req.readings) < 10:
        return {"ready": False, "reason": "not enough readings"}
    r = pd.DataFrame([x.model_dump() for x in req.readings])
    r["timestamp"] = pd.to_datetime(r["timestamp"], utc=True, format="mixed")
    r = r.sort_values("timestamp").reset_index(drop=True)
    r["flowRate"] = r["flowRate"].clip(0, MAX_LPM)
    newest = r["timestamp"].iloc[-1]

    df = ld.readings_to_minutes(r)
    df = df.iloc[:-1]                                    # drop the minute still in progress
    if len(df) < MIN_MINUTES:
        return {"ready": False, "reason": "not enough history"}
    now = pd.Timestamp(req.now, tz="UTC") if req.now else pd.Timestamp.now(tz="UTC")
    if (now - newest) > pd.Timedelta(minutes=STALE_MIN):
        return {"ready": False, "reason": "device silent"}

    X = ld.make_features(df)[saved["features"]]
    sc = ld.class_scores(saved["model"], X)
    out = {"ready": True, "asOf": df.index[-1].isoformat()}
    for name, (thr, persist) in saved["alarms"].items():
        s = sc[name]
        out[name] = {"score": round(float(s.iloc[-1]), 3), "threshold": thr, "persist": persist,
                     "active": bool(ld.alarms(s, thr, persist).iloc[-LATCH_MIN:].any())}
    return out


class DayTotal(BaseModel):
    day: str
    litres: float


class ForecastRequest(BaseModel):
    lastDay: str                    # newest COMPLETE local day in `history`
    history: list[DayTotal]         # days with data; days the device was offline are simply absent


@app.post("/forecast")
def forecast(req: ForecastRequest):
    last = pd.Timestamp(req.lastDay)
    window = pd.date_range(end=last, periods=tf.LAGS, freq="D")
    known = {pd.Timestamp(d.day): d.litres for d in req.history if pd.Timestamp(d.day) in window}
    n_known = len(known)
    if n_known < MIN_KNOWN_AVERAGE:
        return {"ready": False, "reason": "not enough history", "daysUsed": n_known}
    targets = [last + pd.Timedelta(days=h) for h in tf.HORIZONS]
    try:
        cal = cf.features_for([t.date() for t in targets], refresh_if_missing=False)   # from the cache; never blocks on the network
    except Exception:
        cal = None
    context = None if cal is None else [{"tmax": c["tmax"], "rainMm": c["rain_mm"], "holiday": c["holiday"]} for c in cal]

    def with_context(items):
        if context:
            for it, c in zip(items, context):
                it.update(c)
        return items

    vals = np.array(list(known.values()))
    if forecast_saved is None or n_known < MIN_KNOWN_MODEL:
        mean = float(vals.mean())
        out = [{"day": t.date().isoformat(), "litres": round(mean, 1), "low": round(mean * 0.5, 1), "high": round(mean * 1.5, 1)} for t in targets]
        return {"ready": True, "method": "average", "daysUsed": n_known, "usedCalendar": False, "forecast": with_context(out)}
    use_cal = USE_CALENDAR and calendar_saved is not None and cal is not None
    chosen = calendar_saved if use_cal else forecast_saved
    fill = float(np.median(vals))                       # offline days -> the household's usual day
    hist = np.array([known.get(d, fill) for d in window])[::-1]   # hist[0] = newest day
    out = []
    for i, (h, t) in enumerate(zip(tf.HORIZONS, targets)):
        feat, scale = tf.features_at(hist, t, h, cal[i] if use_cal else None)
        x = pd.DataFrame([feat])[chosen["features"]]
        pred = float(chosen["model"].predict(x)[0]) * scale
        hw = chosen["range_halfwidth_80"][h]
        out.append({"day": t.date().isoformat(), "litres": round(max(pred, 0), 1),
                    "low": round(max(pred - hw, 0), 1), "high": round(pred + hw, 1)})
    return {"ready": True, "method": "model", "daysUsed": n_known, "imputedDays": tf.LAGS - n_known,
            "usedCalendar": use_cal, "forecast": with_context(out)}
