import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";
import { emitAlertChanged, emitDeviceChanged } from "../config/socket.js";

// ML leak detector (edge-ai/service). Once a minute, for every online device, send the
// last HISTORY_MS of readings to the Python model service and raise / clear alerts from
// its verdict. Complements the rule-based detector (utils/leakDetection.js) — the rules
// can't see a slow leak on the loop's ~3.5 L/min pump, the model can.
//
// By default the model only ALERTS. Set MODEL_AUTO_SHUTOFF=true in .env to let a confident burst
// verdict also close the provider valve (the 30 L/min rule, which can't fire on the loop's
// ~3.5 L/min pump, remains the only other automatic shut-off). A shut-off needs ALL of:
//   - the burst alarm is active (the model has seen flow run non-stop for ~20 minutes),
//   - its score is at least MODEL_SHUTOFF_MIN_SCORE (default 0.7),
//   - the pump is still running now (latest reading >= 2 L/min and under 2 minutes old) —
//     closing the valve after the flow already stopped would only cut water for no reason.
// A shut-off alert is never auto-resolved: like the rule-based burst it must be marked fixed
// by a person (the existing safety lock then lets the supply be restored).
// Off unless LEAK_MODEL_URL is set (e.g. http://localhost:8001).
const HISTORY_MS = 12 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;
const TYPE_OF = { micro_leak: "micro-leak", burst: "burst" };

const MESSAGE = {
    "micro-leak": "Possible leak (AI model) — flow pattern looks like a continuous leak.",
    burst: "Possible burst (AI model) — flow has been running non-stop far longer than normal use.",
};

const SHUTOFF_MIN_FLOW_LPM = 2.0;
const SHUTOFF_MAX_READING_AGE_MS = 2 * 60 * 1000;
export const autoShutoffEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env.MODEL_AUTO_SHUTOFF || "").toLowerCase());
const shutoffMinScore = () => Number(process.env.MODEL_SHUTOFF_MIN_SCORE) || 0.7;

// Should this burst verdict close the valve? (pure — easy to test)
export const shouldShutOff = ({ enabled, score, lastFlow, lastReadingAt, now = Date.now() }) =>
    enabled && score >= shutoffMinScore() && lastFlow >= SHUTOFF_MIN_FLOW_LPM && now - new Date(lastReadingAt).getTime() <= SHUTOFF_MAX_READING_AGE_MS;

const closeValve = async (device) => {
    device.adminValveState = "closed";
    device.throttlePercent = 0;
    await device.save();
    emitDeviceChanged(device);
};

const burstShutoffMessage = (score) =>
    `Burst detected by the AI model (confidence ${Math.round(score * 100)}%) — flow has been running non-stop far longer than normal use. Supply was automatically shut off to prevent flooding.`;

const openModelAlert = (deviceId, type) =>
    Alert.findOne({ device: deviceId, type, source: "model", status: { $in: ["active", "acknowledged"] } });

export const scoreDevice = async (baseUrl, device) => {
    const since = new Date(Date.now() - HISTORY_MS);
    const readings = await Reading.find({ device: device._id, timestamp: { $gte: since } })
        .sort({ timestamp: 1 })
        .select("timestamp flowRate volume")
        .lean();
    if (readings.length < 10) return;

    const res = await fetch(`${baseUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            readings: readings.map((r) => ({ timestamp: r.timestamp.toISOString(), flowRate: r.flowRate, volume: r.volume })),
        }),
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`model service ${res.status}`);
    const verdict = await res.json();
    if (!verdict.ready) return;

    for (const [key, type] of Object.entries(TYPE_OF)) {
        const v = verdict[key];
        if (!v) continue;
        const open = await openModelAlert(device._id, type);
        const last = readings[readings.length - 1];
        const shut = type === "burst" && shouldShutOff({ enabled: autoShutoffEnabled(), score: v.score, lastFlow: last.flowRate, lastReadingAt: last.timestamp });
        if (v.active && !open) {
            if (shut) await closeValve(device);
            await Alert.create({
                device: device._id,
                user: device.owner,
                type,
                severity: type === "burst" ? "critical" : "warning",
                source: "model",
                flowRate: last.flowRate,
                message: shut ? burstShutoffMessage(v.score) : `${MESSAGE[type]} (confidence ${Math.round(v.score * 100)}%)`,
                autoAction: shut ? "valve-closed" : null,
                startedAt: new Date(),
            });
            emitAlertChanged("active", { userId: device.owner, deviceId: device._id });
        } else if (v.active && open && shut && open.autoAction !== "valve-closed") {
            // An alert-only burst became confident enough (or the setting was switched on): escalate.
            await closeValve(device);
            open.autoAction = "valve-closed";
            open.message = burstShutoffMessage(v.score);
            await open.save();
            emitAlertChanged("active", { userId: device.owner, deviceId: device._id });
        } else if (!v.active && open && open.autoAction !== "valve-closed") {
            open.status = "resolved";
            open.resolvedAt = new Date();
            open.autoAction = "auto-resolved";
            await open.save();
            emitAlertChanged("resolved", { userId: device.owner, deviceId: device._id });
        }
    }
};

export const sweepModelDetection = async (baseUrl) => {
    const devices = await Device.find({ status: "online" });
    for (const d of devices) {
        try {
            await scoreDevice(baseUrl, d);
        } catch (err) {
            console.error(`Model leak detection (${d.deviceId}): ${err.message}`);
        }
    }
};

export const startModelLeakDetection = () => {
    const baseUrl = process.env.LEAK_MODEL_URL;
    if (!baseUrl) return null;
    console.log(`Model leak detection on → ${baseUrl}`);
    let running = false;
    const timer = setInterval(async () => {
        if (running) return; // never overlap sweeps
        running = true;
        try {
            await sweepModelDetection(baseUrl);
        } catch (err) {
            // e.g. the database is briefly unreachable — log it and try again next minute,
            // never let it crash the server.
            console.error(`Model leak detection sweep: ${err.message}`);
        } finally {
            running = false;
        }
    }, SWEEP_EVERY_MS);
    timer.unref?.();
    return timer;
};
