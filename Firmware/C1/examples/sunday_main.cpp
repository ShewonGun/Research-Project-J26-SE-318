// EXACT copy of the firmware that was running on Sunday 4 Oct (git commit 2a81721),
// kept to A/B-test the hardware: flash with  pio run -e sunday -t upload -t monitor

// AquaFlow — ESP32 firmware.
// Joins Wi-Fi, measures water flow from the hall sensor, posts flow rate +
// volume to the backend every few seconds, and drives the valve relay from the
// server's reply. The server returns the EFFECTIVE valve state, so the frontend
// open/close button, the admin gate, and the automatic leak shut-off all reach
// the relay through this one path.
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Wi-Fi name/password, device ID and backend URL live in include/secrets.h
// (git-ignored). Copy include/secrets.example.h to include/secrets.h to set up.
#include "secrets.h"

// ── Flow sensor (e.g. YF-S201 hall meter) ─────────────────────────────────
#ifndef FLOW_PIN
#define FLOW_PIN 18
#endif
// Pulse frequency (Hz) per litre/minute. YF-S201 ≈ 7.5 (=> ~450 pulses/litre).
// Calibrate per sensor: define FLOW_K_HZ_PER_LPM in include/secrets.h (see
// secrets.example.h for how to measure it). Unset → the datasheet value below.
#ifndef FLOW_K_HZ_PER_LPM
#define FLOW_K_HZ_PER_LPM 7.5f
#endif
static const float K_HZ_PER_LPM = FLOW_K_HZ_PER_LPM;

volatile uint32_t pulseCount = 0;
void IRAM_ATTR onPulse() { pulseCount++; }

static uint32_t lastSampleMs = 0;

// Litres measured but not yet acknowledged by the server. Accumulates every
// interval and is cleared ONLY on a successful POST, so a Wi-Fi outage or a
// failed request doesn't drop usage — it's flushed on the next good cycle.
static double pendingVolume = 0;

// Each batch of undelivered litres is tagged "<bootId>-<seq>". The SAME id is re-sent
// on every retry and only advances once the server acknowledges (2xx), so if a reply
// is lost after the server already saved the litres, the server can tell the retry
// is the same batch and not count it twice.
static uint32_t bootId = 0;
static uint32_t batchSeq = 0;

// ── Relay / valve + pump ────────────────────────────────────────────────────
// Valve on GPIO4 (boot-LOW), pump on GPIO5. GPIO5 is a strapping pin that floats
// HIGH at boot, but only via a weak (~45k) internal pull-up that can't source
// the few mA a relay input needs — so the pump relay does NOT actually energize
// during boot. setup() drives both OFF as its first action regardless.
#ifndef RELAY_PIN
#define RELAY_PIN 4 // solenoid valve relay
#endif
#ifndef PUMP_PIN
#define PUMP_PIN 5 // water pump relay
#endif
// This relay board is ACTIVE-HIGH: driving the IN pin HIGH energizes the coil.
// (Confirmed on the bench: with active-LOW the flow sensor read water FLOWING
// while the valve/pump were commanded "closed", and STOPPED when commanded
// "open" — exactly inverted. If you ever swap to an active-LOW board, set true.)
static const bool ACTIVE_LOW = false;
static const int ON_LEVEL = ACTIVE_LOW ? LOW : HIGH;  // relay energized (valve open / pump running)
static const int OFF_LEVEL = ACTIVE_LOW ? HIGH : LOW; // relay released (valve shut / pump stopped)

// Lead/lag so the pump never pushes against a shut valve. Open the valve, wait
// SEQ_LEAD_MS for it to physically seat, THEN start the pump; on the way down,
// stop the pump, wait SEQ_LAG_MS for pressure to equalize, THEN shut the valve.
static const uint32_t SEQ_LEAD_MS = 300;
static const uint32_t SEQ_LAG_MS = 300;

static bool valveOpen = false; // current valve relay state (start closed = safe)
static bool pumpOn = false;    // current pump relay state (start off = safe)

// The pump is HARD-interlocked to the valve: this is the only place the pump
// pin is driven, and it physically refuses to run while the valve is shut, so
// no other code path (server command, leak event, bug) can dead-head the pump.
void applyPump(bool on) {
    if (on && !valveOpen) on = false; // interlock: no pump unless the valve is open
    if (on == pumpOn) return;
    pumpOn = on;
    digitalWrite(PUMP_PIN, on ? ON_LEVEL : OFF_LEVEL);
    Serial.printf("Pump -> %s\n", on ? "ON" : "OFF");
}

void applyValve(bool open) {
    if (open == valveOpen) return;
    if (open) {
        valveOpen = true; // set first so applyPump()'s interlock will allow the pump
        digitalWrite(RELAY_PIN, ON_LEVEL);
        Serial.println("Valve -> OPEN");
        delay(SEQ_LEAD_MS); // let the valve seat open before any pump can start
    } else {
        applyPump(false);   // stop the pump BEFORE the valve shuts (no dead-heading)
        delay(SEQ_LAG_MS);  // let pressure equalize
        valveOpen = false;
        digitalWrite(RELAY_PIN, OFF_LEVEL);
        Serial.println("Valve -> CLOSED");
    }
}

// Ask the server for the current valve state and apply it right away. Called on
// every (re)connect so the board adopts the backend's open/closed decision
// BEFORE it starts reporting — if the server says closed, the valve and pump
// stay off; if open, they come on. Independent of the reading cycle.
bool syncValveFromServer() {
    if (WiFi.status() != WL_CONNECTED) return false;
    HTTPClient http;
    // NOTE: assumes API_URL is the readings endpoint (…/api/readings); the state
    // route lives beside it at …/api/readings/state.
    String url = String(API_URL) + "/state?deviceId=" + DEVICE_ID;
    http.begin(url);
    http.setConnectTimeout(3000); // don't block boot if the server is unreachable
    http.setTimeout(4000);
    int status = http.GET();
    bool ok = false;
    if (status == 200) {
        JsonDocument doc;
        if (deserializeJson(doc, http.getString()) == DeserializationError::Ok) {
            const char *vs = doc["valveState"] | "closed";
            bool open = strcmp(vs, "closed") != 0;
            applyValve(open); // closing this way also stops the pump first
            applyPump(open);  // pump follows the valve (interlock still guards it)
            Serial.printf("Startup sync: server says \"%s\" -> valve %s, pump %s\n",
                          vs, open ? "OPEN" : "CLOSED", open ? "ON" : "OFF");
            ok = true;
        }
    } else {
        // Couldn't reach the server: stay in the safe default (closed) until a
        // reading succeeds and returns the real state.
        Serial.printf("Startup sync failed (HTTP %d); staying CLOSED for safety.\n", status);
    }
    http.end();
    return ok;
}

// ── Wi-Fi helpers ─────────────────────────────────────────────────────────
const char *wifiReason(wl_status_t s) {
    switch (s) {
        case WL_NO_SSID_AVAIL:  return "network not found (wrong name, 5 GHz-only, or out of range)";
        case WL_CONNECT_FAILED: return "connection rejected (usually a wrong password)";
        case WL_CONNECTION_LOST:return "connection lost";
        case WL_DISCONNECTED:   return "disconnected / still trying (often a wrong password)";
        case WL_IDLE_STATUS:    return "idle";
        default:                return "unknown";
    }
}

void scanNetworks() {
    Serial.println("\nScanning for Wi-Fi networks...");
    int n = WiFi.scanNetworks();
    if (n <= 0) Serial.println("  No networks found.");
    for (int i = 0; i < n; i++) {
        Serial.printf("  %2d. \"%s\"  signal %d dBm  channel %d%s\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i),
                      WiFi.channel(i), WiFi.SSID(i) == WIFI_SSID ? "   <-- yours" : "");
    }
    WiFi.scanDelete();
}

bool connectWiFi() {
    Serial.printf("\nConnecting to \"%s\"", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500);
        Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("\nConnected! ESP32 IP: ");
        Serial.println(WiFi.localIP());
        return true;
    }
    wl_status_t s = WiFi.status();
    Serial.printf("\nFailed: %s (code %d). Retrying in 10 s...\n", wifiReason(s), s);
    WiFi.disconnect();
    return false;
}

void setup() {
    // Force both relays OFF as the ABSOLUTE first thing, before Serial/Wi-Fi, so
    // any boot-time pin level is overridden as early as software can — keeps the
    // pump stopped and the valve shut from the earliest possible moment.
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(PUMP_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, OFF_LEVEL);
    digitalWrite(PUMP_PIN, OFF_LEVEL);

    Serial.begin(115200);
    delay(500);
    Serial.printf("Valve relay on GPIO%d, pump relay on GPIO%d (%s). Starting CLOSED + pump OFF.\n",
                  RELAY_PIN, PUMP_PIN, ACTIVE_LOW ? "active-LOW" : "active-HIGH");

    // Flow sensor.
    pinMode(FLOW_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onPulse, FALLING);
    Serial.printf("Flow sensor on GPIO%d (K=%.1f Hz per L/min).\n", FLOW_PIN, K_HZ_PER_LPM);

    WiFi.mode(WIFI_STA);
    scanNetworks();
    while (!connectWiFi()) {
        delay(10000);
        scanNetworks();
    }
    // Adopt the server's current valve state before we start reporting, so the
    // board never boots into the wrong open/closed state.
    syncValveFromServer();

    // Pulses counted while booting (Wi-Fi scan/connect is electrically noisy) are
    // not water — start the first sample from zero.
    noInterrupts();
    pulseCount = 0;
    interrupts();
    bootId = esp_random(); // hardware RNG (Wi-Fi is up) — makes batch ids unique per boot
    lastSampleMs = millis();
}

void loop() {
    // Measure flow over the time since the last reading.
    noInterrupts();
    uint32_t pulses = pulseCount;
    pulseCount = 0;
    interrupts();

    uint32_t now = millis();
    float seconds = (now - lastSampleMs) / 1000.0f;
    lastSampleMs = now;

    float flowRate = seconds > 0 ? (pulses / seconds) / K_HZ_PER_LPM : 0; // L/min
    pendingVolume += pulses / (K_HZ_PER_LPM * 60.0f);                     // litres, buffered until delivered

    // Re-sync the valve state on the rising edge of a reconnect, so the board
    // adopts any change made while it was offline before the next reading.
    static bool wasConnected = true; // setup() already connected + synced once
    bool isConnected = WiFi.status() == WL_CONNECTED;
    if (isConnected && !wasConnected) {
        Serial.println("Wi-Fi back — re-syncing valve state.");
        syncValveFromServer();
    }
    wasConnected = isConnected;

    if (isConnected) {
        HTTPClient http;
        http.begin(API_URL);
        http.setConnectTimeout(3000); // don't block the loop on a dead server
        http.setTimeout(4000);        // ...or on a stalled response
        http.addHeader("Content-Type", "application/json");

        char body[220];
        snprintf(body, sizeof(body), "{\"deviceId\":\"%s\",\"flowRate\":%.2f,\"volume\":%.4f,\"batchId\":\"%08lx-%lu\"}",
                 DEVICE_ID, flowRate, pendingVolume, (unsigned long)bootId, (unsigned long)batchSeq);
        int status = http.POST(body);

        if (status > 0) {
            String payload = http.getString();
            Serial.printf("flow %.2f L/min  vol %.4f L  ->  %d: %s\n", flowRate, pendingVolume, status, payload.c_str());

            // Delivered (2xx) → the server now owns this volume; reset the
            // accumulator. On any error it stays buffered and retries next cycle.
            if (status >= 200 && status < 300) {
                pendingVolume = 0;
                batchSeq++; // acknowledged — the next litres start a new batch
            }

            // Parse the valve command and drive the relay.
            JsonDocument doc;
            if (deserializeJson(doc, payload) == DeserializationError::Ok) {
                const char *vs = doc["valveState"] | "closed";
                // A relay is on/off: "open"/"throttled" allow flow; "closed" shuts it.
                bool open = strcmp(vs, "closed") != 0;
                applyValve(open); // when closing, this already stops the pump first
                applyPump(open);  // pump follows the valve (interlock still guards it)
            }
        } else {
            Serial.printf("Request failed: %s (volume kept for retry)\n", http.errorToString(status).c_str());
        }
        http.end();
    } else {
        Serial.println("Wi-Fi lost, reconnecting...");
        WiFi.reconnect();
    }

    delay(5000);
}
