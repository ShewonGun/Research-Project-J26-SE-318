import mongoose from "mongoose";
import Reading from "../models/Reading.js";
import Device from "../models/Device.js";
import Subscription from "../models/Subscription.js";
import { getOrOpenBill, applyPostpaidEnforcement } from "../utils/postpaid.js";
import { runLeakDetection } from "../utils/leakDetection.js";
import { getActiveTariff } from "../models/Tariff.js";
import { computeBill } from "../utils/computeBill.js";
import { emitReading, emitDeviceChanged, emitBillUpdated } from "../config/socket.js";
import { resolveTimeZone, dayWindow } from "../utils/dayWindow.js";

// Throttle flow to this % once the prepaid balance drops below LOW_BALANCE_RATIO.
const LOW_BALANCE_RATIO = 0.1;
const LOW_BALANCE_THROTTLE = 50;

// Draw the sample's volume down against the device's active subscription and
// enforce the PROVIDER GATE: throttle when the balance is low, close when it's
// out or the plan has expired. Returns the (possibly updated) device.
const enforceQuota = async (device, consumedVolume) => {
    const sub = await Subscription.findOne({ device: device._id, status: "active" });
    if (!sub) return device;

    // Expired plan → stop service.
    if (sub.expiresAt && sub.expiresAt < new Date()) {
        sub.status = "expired";
        await sub.save();
        device.adminValveState = "closed";
        device.throttlePercent = 0;
        await device.save();
        return device;
    }

    sub.volumeRemaining = Math.max(0, sub.volumeRemaining - (consumedVolume || 0));

    if (sub.volumeRemaining <= 0) {
        // Quota exhausted → close the provider gate.
        sub.status = "exhausted";
        device.adminValveState = "closed";
        device.throttlePercent = 0;
        await device.save();
    } else if (sub.volumeRemaining < sub.volumeTotal * LOW_BALANCE_RATIO && device.adminValveState === "open") {
        // Low balance → proportional throttling (drought-equity), not a hard cut-off.
        device.adminValveState = "throttled";
        device.throttlePercent = LOW_BALANCE_THROTTLE;
        await device.save();
    }

    await sub.save();
    return device;
};

// Postpaid: no balance to draw down — accrue the sample's volume onto the open
// billing cycle, then enforce the gate against any overdue bills.
const accruePostpaid = async (device, consumedVolume) => {
    const bill = await getOrOpenBill(device);
    bill.volumeUsed += consumedVolume || 0;
    await bill.save();

    // Push the running total + live charge so the household (and admin) see the
    // bill tick up with every reading instead of waiting for the cycle to close.
    // Display only — a failure here must never fail (and so re-send) the reading.
    try {
        const estimate = computeBill(bill.volumeUsed, await getActiveTariff());
        emitBillUpdated(device, bill, estimate);
    } catch {
        /* clients still catch up on their next refresh */
    }

    return applyPostpaidEnforcement(device);
};

// Ingest a telemetry sample from a device
// @route   POST /api/readings
// @access  Public (device) — identified by deviceId, not a user token
export const ingestReading = async (req, res) => {
    try {
        const { deviceId, flowRate, volume } = req.body;

        if (!deviceId || flowRate === undefined) {
            return res.status(400).json({ message: "deviceId and flowRate are required" });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ message: "Unknown device" });
        }

        // Live readings only: each sample is the litres used in the device's last
        // interval, recorded at the moment it arrives (server time).
        const consumed = Math.max(0, Number(volume) || 0);
        const readingAt = new Date();
        await Reading.create({
            device: device._id,
            flowRate,
            volume: consumed,
            timestamp: readingAt,
        });

        // Was the device already known-online, and what was its supply state
        // before this sample? Used below to detect a *meaningful* change worth
        // pushing to clients, as opposed to every single reading.
        const wasOnline = device.status === "online";
        const prevEffective = device.effectiveValveState;
        const prevThrottle = device.effectiveThrottle;

        // Mark the device online and record the heartbeat.
        device.status = "online";
        device.lastSeen = new Date();
        await device.save();

        // Route consumption by billing mode: prepaid draws down the balance;
        // postpaid accrues to the monthly bill. Both enforce the provider gate.
        if (device.billingMode === "postpaid") {
            await accruePostpaid(device, consumed);
        } else {
            await enforceQuota(device, consumed);
        }

        // Analyse the flow stream for leaks/bursts (may auto-shut on a burst).
        // Pass the reading's timestamp as the anomaly-onset for latency metrics.
        await runLeakDetection(device, flowRate, readingAt);

        // Push the sample to anyone watching this device's live flow chart...
        emitReading(device, { flowRate, volume: consumed, timestamp: readingAt });
        // ...but only notify device/list watchers when something actually
        // changed (came online, or the effective valve state/throttle moved) —
        // otherwise every 5s reading would be as noisy as the polling it replaces.
        if (!wasOnline || device.effectiveValveState !== prevEffective || device.effectiveThrottle !== prevThrottle) {
            emitDeviceChanged(device);
        }

        // Return the EFFECTIVE valve command (both provider gate + household tap).
        return res.status(201).json({
            valveState: device.effectiveValveState,
            throttlePercent: device.effectiveThrottle,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Current supply state for a device, WITHOUT recording a reading. Devices call
// this on every (re)connect so they adopt the backend's open/closed decision
// immediately — before, and independently of, their first telemetry sample.
// @route   GET /api/readings/state?deviceId=<hardwareId>
// @access  Public (device) — identified by deviceId, not a user token
export const getDeviceState = async (req, res) => {
    try {
        const { deviceId } = req.query;
        if (!deviceId) {
            return res.status(400).json({ message: "deviceId is required" });
        }
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ message: "Unknown device" });
        }
        // Same effective command the reading POST returns (provider gate AND tap).
        return res.json({
            valveState: device.effectiveValveState,
            throttlePercent: device.effectiveThrottle,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Litres per calendar day over the last `days` days (today included), grouped by
// local day in `tz` so "today" means the caller's today. `match` narrows the rows.
const dailyUsage = async (match, days, tz) => {
    const timeZone = resolveTimeZone(tz);
    const { startKey, since } = dayWindow(timeZone, days);
    const daily = await Reading.aggregate([
        { $match: { ...match, timestamp: { $gte: since } } },
        { $addFields: { day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: timeZone } } } },
        { $match: { day: { $gte: startKey } } },
        { $group: { _id: "$day", volume: { $sum: "$volume" } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: "$_id", volume: 1 } },
    ]);
    return { timeZone, daily, total: daily.reduce((sum, d) => sum + d.volume, 0) };
};

// Confirm the requesting user owns the device (admins bypass).
const canAccessDevice = async (req, deviceId) => {
    if (!mongoose.isValidObjectId(deviceId)) return null;
    const filter = req.user.role === "admin" ? { _id: deviceId } : { _id: deviceId, owner: req.user._id };
    return Device.findOne(filter);
};

// Recent readings for a device
// @route   GET /api/readings?device=<id>&limit=100
// @access  Private
export const getReadings = async (req, res) => {
    try {
        const { device: deviceId, limit } = req.query;
        const device = await canAccessDevice(req, deviceId);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const readings = await Reading.find({ device: device._id })
            .sort({ timestamp: -1 })
            .limit(Math.min(Number(limit) || 100, 1000));

        return res.json({ count: readings.length, readings });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Flow history for the flow chart over a chosen range, averaged into fixed time bins
// (so a day or a week is a few dozen points, not 14,000). Empty bins are returned as 0 so the
// time axis stays continuous — a bin with n = 0 means "no readings" (idle or device offline).
const SERIES_RANGES = {
    "1h": { ms: 60 * 60 * 1000, unit: "minute", bin: 1 },
    "6h": { ms: 6 * 60 * 60 * 1000, unit: "minute", bin: 5 },
    "24h": { ms: 24 * 60 * 60 * 1000, unit: "minute", bin: 15 },
    "7d": { ms: 7 * 24 * 60 * 60 * 1000, unit: "hour", bin: 1 },
};
const BIN_MS = { minute: 60 * 1000, hour: 60 * 60 * 1000 };

// @route   GET /api/readings/series?device=<id>&range=1h|6h|24h|7d
// @access  Private
export const getFlowSeries = async (req, res) => {
    try {
        const device = await canAccessDevice(req, req.query.device);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const range = SERIES_RANGES[req.query.range] ? req.query.range : "24h";
        const { ms, unit, bin } = SERIES_RANGES[range];
        const binMs = BIN_MS[unit] * bin;
        const end = Math.ceil(Date.now() / binMs) * binMs; // end of the current bin
        const start = end - Math.round(ms / binMs) * binMs;

        const rows = await Reading.aggregate([
            { $match: { device: device._id, timestamp: { $gte: new Date(start), $lt: new Date(end) } } },
            {
                $group: {
                    _id: { $dateTrunc: { date: "$timestamp", unit, binSize: bin } },
                    flow: { $avg: "$flowRate" },
                    max: { $max: "$flowRate" },
                    litres: { $sum: "$volume" },
                    n: { $sum: 1 },
                },
            },
        ]);
        const byTime = new Map(rows.map((r) => [r._id.getTime(), r]));
        const points = [];
        for (let t = start; t < end; t += binMs) {
            const r = byTime.get(t);
            points.push({ t, flow: r ? +r.flow.toFixed(3) : 0, max: r ? r.max : 0, litres: r ? +r.litres.toFixed(3) : 0, n: r ? r.n : 0 });
        }
        return res.json({ device: device._id, range, binMinutes: binMs / 60000, points });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Network-wide daily usage (all devices) over the last N days
// @route   GET /api/readings/network-usage?days=7
// @access  Private (admin)
export const getNetworkUsage = async (req, res) => {
    try {
        const windowDays = Math.min(Number(req.query.days) || 7, 90);
        const { timeZone, daily, total } = await dailyUsage({}, windowDays, req.query.tz);
        return res.json({ days: windowDays, timeZone, total, daily });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Daily usage totals for a device over the last N days
// @route   GET /api/readings/usage?device=<id>&days=7
// @access  Private
export const getUsage = async (req, res) => {
    try {
        const { device: deviceId, days } = req.query;
        const device = await canAccessDevice(req, deviceId);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const windowDays = Math.min(Number(days) || 7, 90);
        const { timeZone, daily, total } = await dailyUsage({ device: device._id }, windowDays, req.query.tz);
        return res.json({ device: device._id, days: windowDays, timeZone, total, daily });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
