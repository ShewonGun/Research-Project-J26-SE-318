// AquaFlow — flow-sensor wiring check.
// Tells you whether the sensor's signal wire is actually connected and the
// sensor is powered, and shows live pulses while water flows.
//
// Build & flash ONLY this check (your main.cpp is left alone):
//     pio run -e sensorcheck -t upload
//     pio device monitor
//
// How it works: a disconnected (floating) wire just follows the ESP32's weak
// internal resistor, so it reads HIGH with pull-up and LOW with pull-down. A
// connected, powered sensor drives the line itself, so both reads agree.
#include <Arduino.h>

#ifndef FLOW_PIN
#define FLOW_PIN 18 // same pin as the main firmware
#endif
static const float K_HZ_PER_LPM = 7.5f; // YF-S201

volatile uint32_t pulseCount = 0;
void IRAM_ATTR onPulse() { pulseCount++; }

// Read the pin several times with the given internal resistor; true if mostly HIGH.
bool readWith(uint8_t mode) {
    pinMode(FLOW_PIN, mode);
    delay(5);
    int highs = 0;
    for (int i = 0; i < 20; i++) {
        highs += digitalRead(FLOW_PIN);
        delayMicroseconds(200);
    }
    return highs > 10;
}

void wiringCheck(uint32_t pulsesSinceLast) {
    detachInterrupt(digitalPinToInterrupt(FLOW_PIN));
    bool up = readWith(INPUT_PULLUP);
    bool down = readWith(INPUT_PULLDOWN);
    pinMode(FLOW_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onPulse, FALLING);

    Serial.printf("Wiring check (GPIO%d): pull-up=%s pull-down=%s  ->  ", FLOW_PIN, up ? "HIGH" : "LOW",
                  down ? "HIGH" : "LOW");
    if (pulsesSinceLast > 0) {
        Serial.println("OK: pulses received, sensor is connected and working.");
    } else if (up && !down) {
        Serial.println("FLOATING: nothing holds the line HIGH. Either the yellow wire is not on this pin, or the "
                       "sensor has no power (check RED -> 5V), or it needs a pull-up (10k from this pin to 3V3).");
    } else if (up && down) {
        Serial.println("Line held HIGH. Run water: steady pulses = working. NO pulses with water flowing "
                       "usually means the sensor's power is REVERSED (red/black swapped) - fix that first.");
    } else {
        Serial.println("Line held LOW: sensor not powered (check red wire / 5V), resistor divider "
                       "backwards, or the rotor stopped on a magnet. Run water and watch for pulses.");
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.printf("\nFlow sensor check on GPIO%d. Wiring: RED->5V, BLACK->GND, YELLOW->GPIO%d\n", FLOW_PIN, FLOW_PIN);
    pinMode(FLOW_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(FLOW_PIN), onPulse, FALLING);
}

void loop() {
    static uint32_t total = 0, sinceCheck = 0, seconds = 0;
    delay(1000);
    noInterrupts();
    uint32_t p = pulseCount;
    pulseCount = 0;
    interrupts();
    total += p;
    sinceCheck += p;
    seconds++;

    Serial.printf("[%3lus] pulses this second: %3lu   flow %.2f L/min   total pulses %lu\n", (unsigned long)seconds,
                  (unsigned long)p, p / K_HZ_PER_LPM, (unsigned long)total);

    if (seconds % 3 == 0) {
        wiringCheck(sinceCheck);
        sinceCheck = 0;
    }
}
