/**
 * Seed SAMPLE readings into the database and run the leak model on them — to check the
 * model service + backend connection without waiting for the physical loop.
 *
 *   node simulation/seedModelTest.js <scenario> [--owner you@email.com] [--cleanup]
 *
 *   scenario: normal   healthy household use only (expect NO alert)
 *             trickle  steady 0.4 L/min leak for the last 90 min   (expect micro-leak alert)
 *             cistern  leaking cistern, pump refills every 2–4 min  (expect micro-leak alert)
 *             burst    pump running flat out for the last 40 min    (expect burst alert)
 *
 * Writes to the database in .env under a clearly marked TEST device (deviceId
 * TEST-MODEL-<scenario>): ~3 h of readings ending now + one device record. --owner attaches
 * it to your user so the alert shows on that user's Alerts page. Re-running replaces the
 * previous test data for that scenario. `--cleanup` deletes the test device, readings and
 * alerts instead of seeding.
 *
 * Needs the model service running and LEAK_MODEL_URL set in .env (e.g. http://localhost:8001).
 * Flows are loop-scale (pump ≈ 3.5 L/min) — the scale the model was trained on.
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";
import User from "../models/User.js";
import { scoreDevice } from "../utils/modelLeakDetection.js";

const SCENARIOS = ["normal", "trickle", "cistern", "burst"];
const args = process.argv.slice(2);
const scenario = args[0];
const cleanup = args.includes("--cleanup");
const ownerEmail = args.includes("--owner") ? args[args.indexOf("--owner") + 1] : null;
const url = process.env.LEAK_MODEL_URL || "http://localhost:8001";

if (!SCENARIOS.includes(scenario)) {
    console.error(`Usage: node simulation/seedModelTest.js <${SCENARIOS.join("|")}> [--owner email] [--cleanup]`);
    process.exit(1);
}

const rand = (a, b) => a + Math.random() * (b - a);
const HOURS = 3;
const PUMP = 3.5;

// Per-second true flow (L/min) for the last HOURS hours.
const buildFlow = () => {
    const n = HOURS * 3600;
    const flow = new Float64Array(n);
    // Healthy use: a 20–120 s pump run every 10–35 min.
    for (let t = rand(60, 600); t < n; t += rand(600, 2100)) {
        const len = rand(20, 120), lvl = rand(3.2, 3.8);
        for (let s = t; s < Math.min(n, t + len); s++) flow[s] = lvl;
    }
    const leakStart = n - 90 * 60;
    if (scenario === "trickle") for (let s = leakStart; s < n; s++) flow[s] += 0.4;
    if (scenario === "cistern")
        for (let t = leakStart; t < n; t += rand(120, 240)) {
            const end = Math.min(n, t + rand(8, 18)); // draw the refill length once
            for (let s = Math.floor(t); s < end; s++) flow[s] = Math.max(flow[s], 0.9 * PUMP);
        }
    if (scenario === "burst") for (let s = n - 40 * 60; s < n; s++) flow[s] = PUMP * (1 + rand(-0.03, 0.03));
    return flow;
};

// Sample like the firmware: a reading every ~5.8 s, volume = flow × interval.
const buildReadings = (deviceObjId) => {
    const flow = buildFlow();
    const end = Date.now();
    const start = end - flow.length * 1000;
    const out = [];
    for (let t = 0; t < flow.length; t += rand(5.6, 6.4)) {
        const f = Math.max(0, flow[Math.floor(t)] + (flow[Math.floor(t)] > 0 ? rand(-0.07, 0.07) : 0));
        out.push({ device: deviceObjId, timestamp: new Date(start + t * 1000), flowRate: +f.toFixed(2), volume: +((f * 5.8) / 60).toFixed(4) });
    }
    return out;
};

await mongoose.connect(process.env.MONGODB_URI);
const deviceId = `TEST-MODEL-${scenario}`;
try {
    const old = await Device.findOne({ deviceId });
    if (old) {
        await Reading.deleteMany({ device: old._id });
        await Alert.deleteMany({ device: old._id });
        await Device.deleteOne({ _id: old._id });
    }
    if (cleanup) {
        console.log(`Removed test device ${deviceId} and its readings/alerts.`);
    } else {
        let owner;
        if (ownerEmail) {
            owner = (await User.findOne({ email: ownerEmail }))?._id;
            if (!owner) throw new Error(`No user with email ${ownerEmail}`);
        }
        const device = await Device.create({
            deviceId, name: `TEST model — ${scenario}`, owner, status: "online", lastSeen: new Date(),
        });
        const readings = buildReadings(device._id);
        await Reading.insertMany(readings);
        console.log(`Seeded ${readings.length} readings for ${deviceId} (last ${HOURS} h, ending now).`);

        await scoreDevice(url, device);
        const alerts = await Alert.find({ device: device._id, source: "model" });
        if (alerts.length) alerts.forEach((a) => console.log(`ALERT raised: ${a.type} (${a.severity}) — ${a.message}`));
        else console.log("No alert raised.");
        console.log(`\nExpected: ${scenario === "normal" ? "no alert" : scenario === "burst" ? "a burst alert" : "a micro-leak alert"}.`);
        console.log(`Remove it with: node simulation/seedModelTest.js ${scenario} --cleanup`);
    }
} catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
