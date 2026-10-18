/**
 * Virtual water device — posts flow telemetry to the backend so the whole
 * pipeline can be developed and demoed without real ESP32 hardware.
 *
 * Usage:
 *   node simulation/virtualDevice.js <deviceId> [intervalMs] [scenario]
 *
 * The device must already be registered (POST /api/devices) so the backend
 * knows its deviceId. The simulator cycles through realistic patterns:
 *   idle → normal usage → tank refill → micro-leak → catastrophic burst
 * and honours the valve command the server returns (closed = no flow,
 * throttled = reduced flow), demonstrating remote shut-off / throttling.
 *
 * Scenario (4th arg): random (default) | clean | idle | normal | refill | leak | burst
 *   clean = a realistic mix of idle / normal / refill that NEVER leaks or bursts.
 *
 * RUN - node simulation/virtualDevice.js ESP32-A2 1000          (random mix)
 *       node simulation/virtualDevice.js ESP32-A2 1000 clean    (healthy, no leaks)
 */
import dotenv from "dotenv";
dotenv.config();

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
const deviceId = process.argv[2];
const intervalMs = Number(process.argv[3]) || 3000;
// Optional 4th arg forces one behaviour (good for demoing leak/burst detection).
const scenarioArg = (process.argv[4] || "random").toLowerCase();

if (!deviceId) {
    console.error("Usage: node simulation/virtualDevice.js <deviceId> [intervalMs] [scenario]");
    console.error("  scenario: random (default) | clean | idle | normal | refill | leak | burst");
    console.error("  clean = realistic mix (idle / normal / refill) that never triggers a leak or burst");
    process.exit(1);
}

// Map a scenario arg to a pattern name (random = the weighted mix).
const forcedPattern = {
    idle: "idle",
    normal: "normal-use",
    "normal-use": "normal-use",
    refill: "tank-refill",
    "tank-refill": "tank-refill",
    leak: "micro-leak",
    "micro-leak": "micro-leak",
    burst: "burst",
}[scenarioArg];

// "clean" is a weighted mix of only the healthy patterns — never leaks/bursts.
const cleanNames = ["idle", "normal-use", "tank-refill"];
const isClean = ["clean", "healthy", "no-leak", "noleak"].includes(scenarioArg);

// Flow profiles in litres/minute. Each tick picks behaviour, then we convert
// the flow rate over the interval into a volume for that sample.
const patterns = [
    { name: "idle", base: 0, jitter: 0, weight: 40 },
    { name: "normal-use", base: 8, jitter: 4, weight: 30 },
    { name: "tank-refill", base: 18, jitter: 3, weight: 12 },
    { name: "micro-leak", base: 0.6, jitter: 0.3, weight: 12 },
    { name: "burst", base: 45, jitter: 10, weight: 6 },
];

const pickPattern = (names) => {
    const pool = names ? patterns.filter((p) => names.includes(p.name)) : patterns;
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of pool) {
        if ((r -= p.weight) <= 0) return p;
    }
    return pool[0];
};

const rand = (base, jitter) => Math.max(0, base + (Math.random() * 2 - 1) * jitter);

let valveState = "open";
let throttlePercent = 100;

const byName = (name) => patterns.find((p) => p.name === name) || patterns[0];

const tick = async () => {
    const pattern = forcedPattern ? byName(forcedPattern) : isClean ? pickPattern(cleanNames) : pickPattern();
    let flowRate = rand(pattern.base, pattern.jitter);

    // Apply the last valve command from the server.
    if (valveState === "closed") flowRate = 0;
    else if (valveState === "throttled") flowRate *= throttlePercent / 100;

    // Volume (litres) consumed during this interval.
    const volume = +(flowRate * (intervalMs / 60000)).toFixed(3);

    try {
        const res = await fetch(`${API_URL}/api/readings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, flowRate: +flowRate.toFixed(2), volume }),
        });
        const data = await res.json();

        if (!res.ok) {
            console.error(`✗ ${res.status}: ${data.message}`);
            return;
        }

        // Remember the valve command the server sent back.
        valveState = data.valveState ?? valveState;
        throttlePercent = data.throttlePercent ?? throttlePercent;

        console.log(
            `[${pattern.name.padEnd(12)}] flow ${flowRate.toFixed(1)} L/min  vol ${volume} L` +
                (valveState !== "open" ? `  · valve:${valveState}(${throttlePercent}%)` : "")
        );
    } catch (err) {
        console.error(`✗ cannot reach ${API_URL}: ${err.message}`);
    }
};

console.log(
    `Virtual device "${deviceId}" → ${API_URL}  (every ${intervalMs}ms, scenario: ${
        forcedPattern || (isClean ? "clean" : "random")
    }). Ctrl+C to stop.`
);
tick();
setInterval(tick, intervalMs);
