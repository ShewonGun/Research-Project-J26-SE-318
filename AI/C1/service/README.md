# Leak-model service

Scores a device's recent readings with the leak model and forecasts usage. By default it loads the
current models — trained on 100 simulated households calibrated to real NWSDB usage:

| Model | Default file (not in git — copy it there, or train it in Colab) | Override |
|---|---|---|
| Leak / burst | `../leak_detection/results_calibrated_100/leak_model.joblib` | `LEAK_MODEL_PATH` |
| Daily forecast | `../usage_forecast/results_calibrated_100/forecast_model.joblib` | `FORECAST_MODEL_PATH` |

    pip install -r requirements.txt   # the models need numpy 1.26.4, pandas 2.1.4, scikit-learn 1.9.1
    uvicorn app:app --port 8001

`GET /health` should show `"forecast_model": true, "calendar_model": false`. The service stops with a clear
message if the leak model file is missing; without the forecast file it falls back to a simple average.

Backend: set `LEAK_MODEL_URL=http://localhost:8001` in `backend/.env` and restart. Once a
minute the backend sends each online device's last 12 h of readings to `POST /score` and
raises / clears alerts (`source: "model"`) from the verdict. Unset = feature off.

* Alert only by default. **Opt-in shut-off:** add `MODEL_AUTO_SHUTOFF=true` to `backend/.env` (and restart the
  backend) and a confident burst verdict also closes the provider valve. It needs the burst alarm active (flow
  non-stop for ~20 min), a score of at least `MODEL_SHUTOFF_MIN_SCORE` (default 0.7) and the pump still running
  now (latest reading >= 2 L/min and under 2 minutes old). Such an alert is never auto-resolved: someone must mark
  the leak fixed, after which the supply can be restored (the existing safety lock applies). Without the setting
  the 30 L/min rule is the only automatic shut-off, and it cannot fire on the loop's ~3.5 L/min pump.
* **Opt-in micro-leak response:** `MODEL_LEAK_ACTION=throttle` reduces the provider gate to
  `MODEL_LEAK_THROTTLE_PERCENT` (default 30 %) when the model raises a micro-leak alert; `MODEL_LEAK_ACTION=close`
  shuts it. Either needs a score of at least `MODEL_LEAK_MIN_SCORE` (default 0.8) and water still flowing now
  (latest reading > 0.05 L/min, under 2 minutes old). Like a burst shut-off, the alert is never auto-resolved: mark
  the leak fixed, then restore the supply (admin Alerts → Reopen). Unset / `off` = alert only (default).
* While a leak alert that closed or throttled the gate is open, buying a plan, paying a bill or switching to
  postpaid does not reopen the gate; it is restored after the leak is marked fixed.
* After a person resolves an AI alert, the same type isn't raised again on that device for
  `ALERT_RESOLVED_GRACE_MIN` minutes (default 12; the model keeps an alarm latched for 10). After "It was me",
  AI alerts of that type pause for `ALERT_SNOOZE_MIN` (default 60). A leak the household confirmed ("Yes, a
  leak") stays open until it is marked fixed.
* Trained at AquaFlow-loop scale (pump ≈ 3.5 L/min); flows are clamped to 6 L/min.
* Validated on simulated data only (see `../leak_detection/results_calibrated_100/REPORT.md`).

## Usage forecast

`POST /forecast` (used by the backend's `GET /api/forecast?device=<id>`): the next 7 days of litres with
an 80 % range, from the household's own last 14 days of daily totals. Uses
`../usage_forecast/results_calibrated_100/forecast_model.joblib` (train it with the Colab notebook
`../colab/AquaFlow_Train_Forecast.ipynb`; not in git). With 7+ of the last 14 days present it uses the model
(offline days are filled with the household's median); with 3-6 it falls back to the plain average;
fewer than 3 days -> no forecast. Restart the service after pulling to enable it.

**Weather and holidays (experimental, off by default).** `FORECAST_USE_CALENDAR=1` switches to an older model
that also uses the target days' weather (Open-Meteo: max temperature, rainfall) and Sri Lankan public holidays
(`../usage_forecast/results_weather/forecast_model_calendar.joblib`, from `python ../usage_forecast/train_forecast.py
--daily-csv data/patterned_weather_daily.csv --calendar`). **Its reaction to heat / rain / holidays was learned
from ASSUMED effect sizes** (the simulated households don't respond to weather), so it stays off until it is
retrained on real usage history. Location: `FORECAST_LAT` / `FORECAST_LON` (default Colombo).

The backend adds, by billing mode, a prepaid run-out date (balance vs forecast, capped by plan expiry) or a
postpaid bill estimate (open cycle so far + forecast to a 30-day cycle end, priced with the active tariff).
