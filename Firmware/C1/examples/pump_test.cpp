// AquaFlow — valve + pump relay bench test.
// Drives the two relays INDEPENDENTLY from the Serial Monitor so you can confirm
// the polarity and wiring of each one, separately from the sync/interlock logic.
//
// Build & flash ONLY this test (your WiFi main.cpp is left alone):
//     pio run -e pump -t upload
//     pio device monitor
//
// Commands (type + Enter):
//     vo / vc   -> valve  open / close
//     po / pc   -> pump   on   / off
//     off       -> both off (safe)
//
// WHAT TO CHECK (this is the whole point):
//   1. Type  pc  (pump off). Does the pump physically STOP?
//        - If the pump KEEPS RUNNING when the line says "Pump  OFF", your relay
//          is either ACTIVE-HIGH (flip ACTIVE_LOW below to false) or the pump is
//          wired to the relay's NC terminal instead of NO (move it to NO).
//   2. Type  vo / vc  and watch/listen to the valve relay click. Note which
//          command actually OPENS the valve.
//   3. Once BOTH read correctly here, the same ACTIVE_LOW setting is what
//          src/main.cpp needs.
#include <Arduino.h>

#ifndef VALVE_PIN
#define VALVE_PIN 4
#endif
#ifndef PUMP_PIN
#define PUMP_PIN 5
#endif

// This hardware is ACTIVE-HIGH (confirmed on the bench). Flip a flag to true
// only if you swap in an active-LOW board. Test one relay at a time.
static const bool VALVE_ACTIVE_LOW = false;
static const bool PUMP_ACTIVE_LOW = false;

static const int VALVE_ON = VALVE_ACTIVE_LOW ? LOW : HIGH;
static const int VALVE_OFF = VALVE_ACTIVE_LOW ? HIGH : LOW;
static const int PUMP_ON = PUMP_ACTIVE_LOW ? LOW : HIGH;
static const int PUMP_OFF = PUMP_ACTIVE_LOW ? HIGH : LOW;

static void setValve(bool open) {
    digitalWrite(VALVE_PIN, open ? VALVE_ON : VALVE_OFF);
    Serial.printf("Valve %-6s (GPIO%d driven %s)\n", open ? "OPEN" : "CLOSED", VALVE_PIN,
                  (open ? VALVE_ON : VALVE_OFF) == HIGH ? "HIGH" : "LOW");
}

static void setPump(bool on) {
    digitalWrite(PUMP_PIN, on ? PUMP_ON : PUMP_OFF);
    Serial.printf("Pump  %-6s (GPIO%d driven %s)\n", on ? "ON" : "OFF", PUMP_PIN,
                  (on ? PUMP_ON : PUMP_OFF) == HIGH ? "HIGH" : "LOW");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    // Both OFF as the very first action so nothing runs while the board boots.
    pinMode(VALVE_PIN, OUTPUT);
    pinMode(PUMP_PIN, OUTPUT);
    setValve(false);
    setPump(false);

    Serial.println("\n--- AquaFlow valve + pump test ---");
    Serial.printf("Valve GPIO%d (%s), Pump GPIO%d (%s).\n", VALVE_PIN, VALVE_ACTIVE_LOW ? "active-LOW" : "active-HIGH",
                  PUMP_PIN, PUMP_ACTIVE_LOW ? "active-LOW" : "active-HIGH");
    Serial.println("Commands: vo | vc | po | pc | off");
    Serial.println("Start by typing  pc  and check the pump actually STOPS.\n");
}

void loop() {
    if (!Serial.available()) return;
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    if (cmd.isEmpty()) return;

    if (cmd == "vo") setValve(true);
    else if (cmd == "vc") setValve(false);
    else if (cmd == "po") setPump(true);
    else if (cmd == "pc") setPump(false);
    else if (cmd == "off") { setPump(false); setValve(false); }
    else Serial.printf("Unknown \"%s\". Use: vo | vc | po | pc | off\n", cmd.c_str());
}
