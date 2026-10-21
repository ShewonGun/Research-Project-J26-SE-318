// AquaFlow — relay module bench test.
// Confirms the relay is wired correctly and responding: it clicks ON/OFF every
// 2 seconds, and you can also drive it by hand from the Serial Monitor.
//
// Build & flash ONLY this test (your WiFi main.cpp is left alone):
//     pio run -e relay -t upload
//     pio device monitor
//
// Typical 1-channel 5V relay module wiring:
//     VCC -> 5V (VIN)   GND -> GND   IN -> the GPIO set below
// Most of these boards are ACTIVE-LOW: IN = LOW energizes the coil (you hear a
// click and the module's LED turns on). If yours is active-high, flip ACTIVE_LOW.
#include <Arduino.h>

// GPIO wired to the relay's IN pin. Change to match your wiring.
// (Override without editing this file: add  build_flags = -DRELAY_PIN=26  to the env.)
#ifndef RELAY_PIN
#define RELAY_PIN 4
#endif

// Most 1-channel relay boards are active-low: LOW turns the relay ON.
static const bool ACTIVE_LOW = true;

static const int ON_LEVEL = ACTIVE_LOW ? LOW : HIGH;
static const int OFF_LEVEL = ACTIVE_LOW ? HIGH : LOW;

static bool relayOn = false;
static bool autoToggle = true;
static unsigned long lastToggle = 0;

void setRelay(bool on) {
    relayOn = on;
    digitalWrite(RELAY_PIN, on ? ON_LEVEL : OFF_LEVEL);
    Serial.printf("Relay: %-3s  (GPIO%d driven %s)\n", on ? "ON" : "OFF", RELAY_PIN,
                  (on ? ON_LEVEL : OFF_LEVEL) == HIGH ? "HIGH" : "LOW");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    // Drive the pin to OFF as the very first action so the relay doesn't sit
    // energized (or click) while the board boots.
    pinMode(RELAY_PIN, OUTPUT);
    setRelay(false);

    Serial.println("\n--- AquaFlow relay test ---");
    Serial.printf("Pin GPIO%d, %s module.\n", RELAY_PIN, ACTIVE_LOW ? "active-LOW" : "active-HIGH");
    Serial.println("Auto-toggling every 2s. Commands (type + Enter): on | off | toggle | auto");
    Serial.println("Each switch should give an audible click and change the module's LED.\n");
    lastToggle = millis();
}

void handleSerial() {
    if (!Serial.available()) return;
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    if (cmd.isEmpty()) return;

    if (cmd == "on") {
        autoToggle = false;
        setRelay(true);
    } else if (cmd == "off") {
        autoToggle = false;
        setRelay(false);
    } else if (cmd == "toggle") {
        autoToggle = false;
        setRelay(!relayOn);
    } else if (cmd == "auto") {
        autoToggle = true;
        Serial.println("Auto-toggle resumed.");
    } else {
        Serial.printf("Unknown command \"%s\". Use: on | off | toggle | auto\n", cmd.c_str());
    }
}

void loop() {
    handleSerial();
    if (autoToggle && millis() - lastToggle >= 2000) {
        lastToggle = millis();
        setRelay(!relayOn);
    }
}
