// Template for secrets.h — this file IS committed; secrets.h is not.
// Setup: copy this file to secrets.h (same folder) and fill in your values.
#pragma once

#define WIFI_SSID     "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define DEVICE_ID     "ESP32-A2"   // must match a connection registered in the admin console
#define API_URL       "http://YOUR_PC_LAN_IP:5000/api/readings"   // e.g. http://192.168.1.100:5000/api/readings

// ── Optional: flow-sensor calibration ───────────────────────────────────────
// Sensors differ by ~10% or more from the datasheet (7.5 Hz per L/min for a
// YF-S201). To calibrate: pour an exactly-known volume (e.g. 1 L into a measuring
// jug) through the sensor and note the litres the dashboard/serial shows, then
//     new K = 7.5 × (litres shown ÷ litres actually poured)
// and uncomment/set it here (reading too HIGH → K goes up; too LOW → K goes down).
// Repeat with 2–3 pours and use the average. Re-flash after changing it.
// #define FLOW_K_HZ_PER_LPM 7.5f
