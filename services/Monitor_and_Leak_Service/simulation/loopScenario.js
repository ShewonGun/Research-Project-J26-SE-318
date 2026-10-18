/**
 * Loop-scale sample flow for the leak-model checks (shared by streamToA2.js and modelCheckA2.js).
 * Behaves like the real AquaFlow loop: pump ≈ 3.5 L/min, each run drifts slowly and
 * occasionally dips, a reading every ~6 s, idle noise ≈ 0.
 *
 *   normal   healthy household use only
 *   trickle  steady 0.4 L/min leak starting 90 min before "now"
 *   cistern  leaking cistern: pump refill of 8–18 s every 2–4 min, from 90 min before "now"
 *   burst    pump running non-stop from 40 min before "now"
 */
export const SCENARIOS = ["normal", "trickle", "cistern", "burst"];
export const PUMP = 3.5;

export const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// pastSec: seconds of history before "now"; liveMinutes: seconds-worth of scenario after now.
export const buildScenario = (scenario, pastSec, liveMinutes = 0) => {
    const TOTAL = pastSec + (liveMinutes + 5) * 60;
    const flow = new Float64Array(TOTAL);
    for (let t = rand(60, 600); t < TOTAL; t += rand(600, 2100)) {
        const len = rand(20, 120), lvl = rand(3.2, 3.8);
        for (let s = Math.floor(t); s < Math.min(TOTAL, t + len); s++) flow[s] = lvl; // healthy use
    }
    const leakStart = pastSec - 90 * 60;
    if (scenario === "trickle") for (let s = leakStart; s < TOTAL; s++) flow[s] += 0.4;
    if (scenario === "cistern")
        for (let t = leakStart; t < TOTAL; t += rand(120, 240)) {
            const end = Math.min(TOTAL, t + rand(8, 18));
            for (let s = Math.floor(t); s < end; s++) flow[s] = Math.max(flow[s], 0.9 * PUMP);
        }
    if (scenario === "burst") for (let s = pastSec - 40 * 60; s < TOTAL; s++) flow[s] = PUMP * (1 + rand(-0.03, 0.03));

    // Pump level drifts slowly during a run (sd 0.15 L/min, ~1 min memory) and a reading
    // occasionally dips — as measured on the real loop.
    let drift = 0;
    const sample = (sec) => {
        let f = flow[Math.max(0, Math.min(TOTAL - 1, Math.floor(sec)))];
        if (f >= 3) {
            drift += (0 - drift) * (6 / 60) + 0.15 * Math.sqrt((2 * 6) / 60) * gauss();
            f = Math.max(0.5, f + drift);
            if (Math.random() < 0.008) f *= rand(0.25, 0.8);
        } else drift = 0;
        const noisy = f > 0 ? Math.max(0, f + rand(-0.07, 0.07)) : 0;
        const flowRate = +noisy.toFixed(2);
        return { flowRate, volume: +((flowRate * 5.8) / 60).toFixed(4) };
    };
    return { sample, pastSec };
};

// Historical readings ending now: [{timestamp, flowRate, volume}] spaced like the firmware.
export const backfillRows = (device, sample, pastSec, now = Date.now()) => {
    const rows = [];
    for (let t = 0; t < pastSec; t += rand(5.6, 6.4)) rows.push({ device, timestamp: new Date(now - (pastSec - t) * 1000), ...sample(t) });
    return rows;
};
