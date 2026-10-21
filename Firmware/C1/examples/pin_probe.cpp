// Pin connectivity probe — is anything actually wired to this GPIO?
//
//   pio run -e probe -t upload   &&   pio device monitor
//
// It reads the pin with the internal pull-up, then the pull-down:
//   • pullup=1 pulldown=0  -> FLOATING: nothing driving it (sensor unpowered
//                             or the signal wire isn't on this pin / not connected)
//   • pullup=1 pulldown=1  -> held HIGH by something external (sensor powered,
//                             idle-high) => connected
//   • pullup=0 pulldown=0  -> held LOW  (tied to GND: a short, a divider's
//                             lower resistor, or the wrong wire) => connected to GND
// Spin the flow-sensor impeller while watching: a connected+powered sensor
// should flip between HIGH and LOW.
#include <Arduino.h>

#ifndef PROBE_PIN
#define PROBE_PIN 18
#endif

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.printf("\n--- Pin probe on GPIO%d --- spin the sensor while watching.\n", PROBE_PIN);
}

void loop() {
    pinMode(PROBE_PIN, INPUT_PULLUP);
    delay(20);
    int up = digitalRead(PROBE_PIN);

    pinMode(PROBE_PIN, INPUT_PULLDOWN);
    delay(20);
    int down = digitalRead(PROBE_PIN);

    const char *verdict;
    if (up == HIGH && down == LOW) verdict = "FLOATING - nothing connected / sensor unpowered";
    else if (up == HIGH && down == HIGH) verdict = "held HIGH externally - connected & powered";
    else if (up == LOW && down == LOW) verdict = "held LOW - tied to GND (short / divider / wrong wire)";
    else verdict = "weak/ambiguous - check wiring";

    Serial.printf("pullup=%d  pulldown=%d  ->  %s\n", up, down, verdict);
    delay(1000);
}
