// Read-only export of REAL readings from MongoDB (uses backend/.env; prints no secrets).
// Usage: node export_readings.cjs   -> writes readings_<deviceId>.csv per device + prints a summary
const path = require("path");
const fs = require("fs");
const backend = path.resolve(__dirname, "../../../backend");
const mongoose = require(path.join(backend, "node_modules/mongoose"));
require(path.join(backend, "node_modules/dotenv")).config({ path: path.join(backend, ".env") });

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection("readings");
  const devs = await col.aggregate([{ $group: { _id: "$device", n: { $sum: 1 }, first: { $min: "$timestamp" }, last: { $max: "$timestamp" }, meanFlow: { $avg: "$flowRate" }, maxFlow: { $max: "$flowRate" } } }]).toArray();
  console.log(JSON.stringify(devs, null, 1));
  for (const d of devs) {
    const rows = await col.find({ device: d._id }, { projection: { _id: 0, timestamp: 1, flowRate: 1, volume: 1 } }).sort({ timestamp: 1 }).toArray();
    const out = path.join(__dirname, `readings_${d._id}.csv`);
    fs.writeFileSync(out, "timestamp,flowRate,volume\n" + rows.map(r => `${new Date(r.timestamp).toISOString()},${r.flowRate},${r.volume ?? 0}`).join("\n") + "\n");
    console.log("wrote", path.basename(out), rows.length);
  }
  await mongoose.disconnect();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
