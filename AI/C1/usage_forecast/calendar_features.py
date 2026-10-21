"""
Weather + public-holiday inputs for the usage forecast.

  weather   Open-Meteo (free, no key): daily max temperature and rainfall for Colombo. Past days come
            from their archive (a weather reanalysis on a ~10-25 km grid — good for temperature,
            only rough for rainfall); recent and coming days from their forecast API (skill falls
            off after 2-3 days, rainfall especially). Responses are cached in data/weather_cache.json,
            so repeated calls cost nothing and a short outage falls back to the last values.
  holidays  the `holidays` package for Sri Lanka (Poya days, Sinhala/Tamil New Year, Vesak, ...),
            plus data/holidays_override.csv for corrections from the government gazette
            (moon-dependent dates such as Eid can be a day out).

Everything degrades gracefully: when weather can't be fetched, `features_for` returns None and the
caller uses the model that has no calendar inputs.

Location comes from FORECAST_LAT / FORECAST_LON (default Colombo).
"""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
CACHE = HERE / "data" / "weather_cache.json"
OVERRIDE = HERE / "data" / "holidays_override.csv"
LAT = float(os.environ.get("FORECAST_LAT", 6.93))
LON = float(os.environ.get("FORECAST_LON", 79.85))
TZ = "Asia/Colombo"
RAINY_MM = 5.0           # a day with at least this much rain counts as "rainy" (in the monsoon season nearly every day has >1 mm)
ARCHIVE_LAG_DAYS = 6     # the archive is complete up to ~5 days ago; newer days come from the forecast API
CALENDAR_COLUMNS = ["tmax", "rain_mm", "is_rainy", "is_holiday", "near_holiday"]


# ── Weather ──────────────────────────────────────────────────────────────────
def _get(url, params, timeout=20):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=timeout) as r:
        return json.loads(r.read())


def _load_cache():
    try:
        return json.loads(CACHE.read_text())
    except Exception:
        return {"days": {}, "fetched_at": None}


def _save_cache(cache):
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache))


def _store(cache, daily, observed_before):
    for d, tmax, rain in zip(daily["time"], daily["temperature_2m_max"], daily["precipitation_sum"]):
        if tmax is None or rain is None:
            continue
        cache["days"][d] = {"tmax": tmax, "rain_mm": rain, "final": d < observed_before}


def refresh(start, end):
    """Fetch weather for start..end (dates) into the cache. Raises on network failure."""
    cache = _load_cache()
    today = date.today()
    split = today - timedelta(days=ARCHIVE_LAG_DAYS)
    base = {"latitude": LAT, "longitude": LON, "daily": "temperature_2m_max,precipitation_sum", "timezone": TZ}
    if start < split:
        a_end = min(end, split - timedelta(days=1))
        j = _get("https://archive-api.open-meteo.com/v1/archive", {**base, "start_date": start.isoformat(), "end_date": a_end.isoformat()})
        _store(cache, j["daily"], split.isoformat())
    if end >= split:
        past = max(0, (today - max(start, split)).days)
        ahead = max(1, (end - today).days + 1)
        j = _get("https://api.open-meteo.com/v1/forecast", {**base, "past_days": min(past, 92), "forecast_days": min(ahead, 16)})
        _store(cache, j["daily"], today.isoformat())   # today and later are forecasts, not final
    cache["fetched_at"] = time.time()
    _save_cache(cache)
    return cache


def weather_for(days, refresh_if_missing=True):
    """{date: {tmax, rain_mm}} for the given dates, from the cache (refreshing it if needed)."""
    days = list(days)
    cache = _load_cache()
    stale = any(d.isoformat() not in cache["days"] or (not cache["days"][d.isoformat()]["final"] and
                (cache["fetched_at"] or 0) < time.time() - 3 * 3600) for d in days)
    if stale and refresh_if_missing:
        try:
            cache = refresh(min(days), max(days))
        except Exception:
            pass                                     # offline: use whatever the cache already holds
    return {d: cache["days"][d.isoformat()] for d in days if d.isoformat() in cache["days"]}


# ── Holidays ─────────────────────────────────────────────────────────────────
_holiday_cache = {}


def holiday_names(years):
    """{date: name} for Sri Lanka, with data/holidays_override.csv applied (columns: date,name,action=add|remove)."""
    import holidays
    key = tuple(sorted(set(years)))
    if key not in _holiday_cache:
        out = {d: n for d, n in holidays.LK(years=list(key)).items()}
        if OVERRIDE.exists():
            for r in pd.read_csv(OVERRIDE).itertuples():
                d = pd.Timestamp(r.date).date()
                if str(r.action).strip().lower() == "remove":
                    out.pop(d, None)
                else:
                    out[d] = r.name
        _holiday_cache[key] = out
    return _holiday_cache[key]


def holiday_flags(day):
    """(name or None, is_holiday, near_holiday) for a date; near = the day before or after a holiday."""
    names = holiday_names([day.year - 1, day.year, day.year + 1])
    near = (day - timedelta(days=1)) in names or (day + timedelta(days=1)) in names
    return names.get(day), int(day in names), int(near and day not in names)


# ── Features ─────────────────────────────────────────────────────────────────
def features_for(days, refresh_if_missing=True):
    """Calendar features for each date, as a list of dicts (None if weather is unavailable for any day).
    Keys: day, tmax, rain_mm, is_rainy, is_holiday, near_holiday, holiday (name)."""
    days = [pd.Timestamp(d).date() for d in days]
    w = weather_for(days, refresh_if_missing)
    if len(w) < len(days):
        return None
    out = []
    for d in days:
        name, is_h, near = holiday_flags(d)
        out.append({"day": d.isoformat(), "tmax": float(w[d]["tmax"]), "rain_mm": float(w[d]["rain_mm"]),
                    "is_rainy": int(w[d]["rain_mm"] >= RAINY_MM), "is_holiday": is_h, "near_holiday": near, "holiday": name})
    return out


def table_for(days):
    """DataFrame indexed by date with the CALENDAR_COLUMNS (for training); raises if weather is missing."""
    f = features_for(days)
    if f is None:
        raise RuntimeError("weather unavailable for some of the requested days")
    return pd.DataFrame(f).set_index("day")[CALENDAR_COLUMNS]
