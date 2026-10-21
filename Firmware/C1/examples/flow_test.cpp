// AquaFlow — flow-sensor bench test (e.g. YF-S201 hall-effect meter).
// Counts pulses each second and prints frequency, flow rate, and running total.
//
// Build & flash ONLY this test (your main.cpp is left alone):
//     pio run -e flow -t upload
//     pio device monitor
//
// Wiring: sensor RED -> 5V,  BLACK -> GND,  YELLOW (signal) -> the GPIO below.
//
//  ⚠ VOLTAGE: a YF-S201 powered at 5V outputs ~5V pulses. ESP32 GPIOs are 3.3V
//    and are NOT 5V-tolerant. Put a level shifter, or a divider on the signal
//    line (e.g. 1kΩ from signal to GPIO + 2kΩ from GPIO to GND ≈ 3.3V), between
//    the sensor and the ESP32 — don't feed raw 5V into the pin.
#include <Arduino.h>

// GPIO wired to the sensor's signal (yellow) line.
#ifndef FLOW_PIN
#define FLOW_PIN 18
#endif

// Sensor calibration: pulse frequency (Hz) per litre/minute. YF-S201 ≈ 7.5.
// (So pulses per litre = K * 60; YF-S201 ≈ 450.) Adjust for your sensor.
static const float K_HZ_PER_LPM = 7.5f;

volatile uint32_t pulseCount = 0;
void IRAM_ATTR onPulse() { pulseCount++; }

static uint32_t lastMs = 0;
static double totalLitres = 0;

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n--- AquaFlow flow-sensor test ---");
    Serial.printf("Signal on GPIO%d, K = %.1f Hz per L/min.\n", FLOW_PIN, K_HZ_PER_LPM);
    Serial.println("Run water (or blow through the sensor) — pulses and flow should rise.\n");

    pinMode(FLOW_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onPulse, FALLING);
    lastMs = millis();
}

void loop() {
    // Sample the line hard for ~1s so we can see ANY movement — this catches a
    // slow hand-spin the pulse counter might miss, and separates a dead line
    // (wiring/power problem) from a counting problem.
    uint32_t start = millis();
    bool sawHigh = false, sawLow = false;
    while (millis() - start < 1000) {
        if (digitalRead(FLOW_PIN)) sawHigh = true;
        else sawLow = true;
    }

    // Snapshot + reset the counter with interrupts briefly off.
    noInterrupts();
    uint32_t pulses = pulseCount;
    pulseCount = 0;
    interrupts();

    uint32_t now = millis();
    float seconds = (now - lastMs) / 1000.0f;
    lastMs = now;
    if (seconds <= 0) return;

    float freq = pulses / seconds;                   // Hz
    float lpm = freq / K_HZ_PER_LPM;                 // litres / minute
    float litres = pulses / (K_HZ_PER_LPM * 60.0f);  // litres this interval
    totalLitres += litres;

    const char *line = sawHigh && sawLow ? "TOGGLING" : sawHigh ? "stuck HIGH" : "stuck LOW";
    Serial.printf("Pulses: %4lu | %6.1f Hz | Flow: %5.2f L/min | Total: %.3f L | line: %s\n",
                  (unsigned long)pulses, freq, lpm, totalLitres, line);
}
