/**
 * Check that the leak MODEL detects a burst / micro-leak, using loop-like sample data on
 * device ESP32-A2 (never A1). NOTHING IS DELETED: the readings and the alert stay in the
 * database after the script ends, so you can look at them in the app.
 *
 *   node simulation/modelCheckA2.js <normal|trickle|cistern|burst> [--replace] [--device ESP32-A2]
 *
 *   normal   healthy use only (expect no alert — the control)
 *   trickle  steady 0.4 L/min leak for the last 90 min     (expect a micro-leak alert)
 *   cistern  leaking cistern, pump refill every 2–4 min    (expect a micro-leak alert)
 *   burst    pump running non-stop for the last 40 min     (expect a burst alert)
 *
 * It writes 2.5 h of loop-like history ending now, then asks the model service for a verdict
 * (the same code path the backend's per-minute sweep uses) and prints PASS / FAIL.
 *
 * If A2 already has readings in the last 2.5 h (e.g. a previous check) the script stops,
 * because new data would overlap and distort the old. Run it later, or pass --replace to
 * delete A2's readings + model alerts from the last 4 h first (the only way anything is deleted).
 *
 * Needs the model service running (LEAK_MODEL_URL, default http://localhost:8001).
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";
import { scoreDevice } from "../utils/modelLeakDetection.js";
import { SCENARIOS, buildScenario, backfillRows } from "./loopScenario.js";

const args = process.argv.slice(2);
const scenario = args[0];
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const deviceId = opt("--device", "ESP32-A2");
const replace = args.includes("--replace");
const url = process.env.LEAK_MODEL_URL || "http://localhost:8001";
const PAST = 150 * 60;
const EXPECT = { normal: null, trickle: "micro-leak", cistern: "micro-leak", burst: "burst" };

if (!SCENARIOS.includes(scenario)) {
    console.error(`Usage: node simulation/modelCheckA2.js <${SCENARIOS.join("|")}> [--replace]`);
    process.exit(1);
}
if (deviceId === "ESP32-A1") {
    console.error("Refusing to write test data to ESP32-A1 (the real device).");
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const device = await Device.findOne({ deviceId });
if (!device) {
    console.error(`Device ${deviceId} not found.`);
    await mongoose.disconnect();
    process.exit(1);
}

try {
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    console.log(`Model service OK (${health.model}) at ${url}`);
} catch {
    console.error(`Model service not reachable at ${url} — start it first (cd edge-ai/service; python -m uvicorn app:app --port 8001).`);
    await mongoose.disconnect();
    process.exit(1);
}

const recent = await Reading.countDocuments({ device: device._id, timestamp: { $gte: new Date(Date.now() - PAST * 1000) } });
if (recent > 0 && !replace) {
    console.error(`\n${deviceId} already has ${recent} readings in the last 2.5 h. Nothing was written or deleted.`);
    console.error("Wait until they are older than 2.5 h, or re-run with --replace to delete the last 4 h of A2 test readings first.");
    await mongoose.disconnect();
    process.exit(1);
}
if (replace) {
    const r = await Reading.deleteMany({ device: device._id, timestamp: { $gte: new Date(Date.now() - 4 * 3600 * 1000) } });
    const a = await Alert.deleteMany({ device: device._id, source: "model" });
    console.log(`--replace: deleted ${r.deletedCount} readings and ${a.deletedCount} model alerts.`);
}

const { sample } = buildScenario(scenario, PAST);
const rows = backfillRows(device._id, sample, PAST);
await Reading.insertMany(rows);
device.status = "online";
device.lastSeen = new Date();
await device.save();
console.log(`Wrote ${rows.length} readings (last 2.5 h) to ${deviceId}, scenario "${scenario}".`);

await scoreDevice(url, device);
const raised = (await Alert.find({ device: device._id, source: "model", status: { $in: ["active", "acknowledged"] } })).map((a) => a.type);
const want = EXPECT[scenario];
const ok = want ? raised.includes(want) : raised.length === 0;
console.log(`\n${scenario}: expected ${want || "no alert"}, got ${raised.join(", ") || "no alert"} → ${ok ? "PASS" : "FAIL"}`);
console.log("The data and any alert are left in the database (nothing deleted).");
await mongoose.disconnect();
process.exitCode = ok ? 0 : 1;
