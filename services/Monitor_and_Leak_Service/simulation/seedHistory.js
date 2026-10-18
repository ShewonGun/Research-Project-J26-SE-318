/**
 * Write several days of realistic SAMPLE history for a device, from a generated readings CSV,
 * so the usage forecast (and the Usage page) can be checked without waiting weeks.
 *
 *   node simulation/seedHistory.js <readings.csv> [--device ESP32-A1] [--until 2026-10-15T13:00:00+05:30] [--after <ISO time>] [--dry-run]
 *
 * The CSV comes from the loop-calibrated household generator (same columns as the database):
 *   python edge-ai/data/loop_household/generate_dataset.py --no-anomalies --start 2026-10-02 --end 2026-10-15 \
 *          --seed 20261015 --out edge-ai/data/loop_household/out_a1
 *
 * - Only rows up to --until are written (nothing after it, and never "now" unless you say so).
 *   --after <ISO time> skips rows at or before that moment, to continue where an earlier run stopped.
 * - Rows are tagged `synthetic: true`. NOTHING is deleted, by this script or when it ends. Existing
 *   (real) readings on those days are left exactly as they are; sample rows are simply added.
 * - Written straight into the readings collection: billing, quota and the valve are NOT touched.
 * - Refuses to run twice for the same range (it would double the data) — see the check below.
 * - To remove the sample rows later:  db.readings.deleteMany({ synthetic: true })
 */
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import readline from "readline";
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";

const args = process.argv.slice(2);
const csvPath = args[0];
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const deviceId = opt("--device", "ESP32-A1");
const until = new Date(opt("--until", ""));
const after = opt("--after", null) ? new Date(opt("--after")) : null;
const dryRun = args.includes("--dry-run");

if (!csvPath || csvPath.startsWith("--") || Number.isNaN(until.getTime())) {
    console.error("Usage: node simulation/seedHistory.js <readings.csv> --until <ISO time with offset> [--device ESP32-A1] [--dry-run]");
    process.exit(1);
}
if (until > new Date()) {
    console.error("--until is in the future; refusing.");
    process.exit(1);
}

// Stream the CSV: timestamp,device,flowRate,volume,... → rows up to `until`.
const rows = [];
const rl = readline.createInterface({ input: fs.createReadStream(csvPath) });
let header = true;
for await (const line of rl) {
    if (header) {
        header = false;
        continue;
    }
    const c = line.split(",");
    const ts = new Date(c[0]);
    if (ts > until || (after && ts <= after)) continue;
    rows.push({ timestamp: ts, flowRate: +c[2], volume: +c[3] });
}
if (!rows.length) {
    console.error("No rows at or before --until.");
    process.exit(1);
}
rows.sort((a, b) => a.timestamp - b.timestamp);
const first = rows[0].timestamp, last = rows[rows.length - 1].timestamp;

// Per-local-day litres, for the summary.
const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(d);
const perDay = {};
for (const r of rows) perDay[day(r.timestamp)] = (perDay[day(r.timestamp)] || 0) + r.volume;

console.log(`${rows.length.toLocaleString()} readings, ${first.toISOString()} -> ${last.toISOString()}  (${Object.keys(perDay).length} days)`);
console.log("Litres per local day:", Object.fromEntries(Object.entries(perDay).map(([k, v]) => [k, +v.toFixed(0)])));

await mongoose.connect(process.env.MONGODB_URI);
try {
    const device = await Device.findOne({ deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found.`);

    const already = await Reading.countDocuments({ device: device._id, synthetic: true, timestamp: { $gte: first, $lte: last } });
    if (already > 0) throw new Error(`${already} sample readings already exist for ${deviceId} in this range — refusing to add them twice.`);
    const real = await Reading.countDocuments({ device: device._id, synthetic: { $ne: true }, timestamp: { $gte: first, $lte: last } });
    console.log(`${deviceId}: ${real} real readings already in this range (left untouched).`);

    if (dryRun) {
        console.log("\n--dry-run: nothing written.");
    } else {
        const BATCH = 5000;
        for (let i = 0; i < rows.length; i += BATCH) {
            await Reading.insertMany(rows.slice(i, i + BATCH).map((r) => ({ device: device._id, ...r, synthetic: true })), { ordered: false });
            process.stdout.write(`\rwritten ${Math.min(i + BATCH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
        }
        console.log(`\nDone. Sample readings are tagged synthetic:true; nothing was deleted.`);
    }
} catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
