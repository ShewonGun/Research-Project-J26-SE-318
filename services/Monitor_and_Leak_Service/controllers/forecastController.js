import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Subscription from "../models/Subscription.js";
import Bill from "../models/Bill.js";
import { getActiveTariff } from "../models/Tariff.js";
import { computeBill } from "../utils/computeBill.js";
import { resolveTimeZone } from "../utils/dayWindow.js";
import { localDayKey, buildRunOut, buildBillEstimate, DAY_MS } from "../utils/usageForecast.js";

// Usage forecast for one device: the next 7 days of litres (with an 80 % range) from the model
// service, plus — by billing mode — the prepaid run-out date or the postpaid bill estimate.
//
// The service (edge-ai/service, same URL as the leak model) gets the household's own recent daily
// totals every time, so the forecast follows its latest usage; nothing is retrained here.
const HISTORY_DAYS = 14; // days of history the model uses
const DEFAULT_TZ = "Asia/Colombo"; // the model was trained on Sri Lanka local days

const serviceUrl = () => process.env.ML_SERVICE_URL || process.env.LEAK_MODEL_URL;

// Confirm the requesting user owns the device (admins bypass).
export const canAccessDevice = async (req, deviceId) => {
    if (!mongoose.isValidObjectId(deviceId)) return null;
    const filter = req.user.role === "admin" ? { _id: deviceId } : { _id: deviceId, owner: req.user._id };
    return Device.findOne(filter);
};

// Litres and reading counts per LOCAL day over the last `days` days (today included).
export const dailyTotals = async (deviceObjId, days, timeZone) => {
    const since = new Date(Date.now() - (days + 2) * DAY_MS);
    const rows = await Reading.aggregate([
        { $match: { device: deviceObjId, timestamp: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: timeZone } }, litres: { $sum: "$volume" }, n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, { litres: r.litres, n: r.n }]));
};

// The forecast for one device. Returns { status, body } so the single-device and the network
// endpoints share one implementation.
export const buildForecast = async (device, timeZone) => {
    const base = serviceUrl();
    if (!base) return { status: 503, body: { available: false, message: "Forecast service is not configured (set LEAK_MODEL_URL / ML_SERVICE_URL)." } };

    const now = new Date();
    const todayKey = localDayKey(now, timeZone);
    const yesterdayKey = localDayKey(new Date(now.getTime() - DAY_MS), timeZone);

    const totals = await dailyTotals(device._id, HISTORY_DAYS + 1, timeZone);
    const usedToday = totals[todayKey]?.litres || 0;
    // Complete days only; a day the device sent nothing is "unknown", not zero litres.
    const history = Object.entries(totals)
        .filter(([day, t]) => day < todayKey && t.n > 0)
        .map(([day, t]) => ({ day, litres: +t.litres.toFixed(3) }));

    let result;
    try {
        const r = await fetch(`${base}/forecast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastDay: yesterdayKey, history }),
            signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw new Error(`service ${r.status}`);
        result = await r.json();
    } catch (err) {
        return { status: 503, body: { available: false, message: `Forecast service unreachable (${err.message}).` } };
    }

    if (!result.ready) {
        return {
            status: 200,
            body: {
                available: false,
                reason: result.reason,
                message: `Not enough usage history yet (${result.daysUsed} day(s) with data; at least 3 are needed).`,
                daysUsed: result.daysUsed,
            },
        };
    }

    // forecast[0] is TODAY (the day after the last complete day).
    const forecast = result.forecast;
    const body = {
        available: true,
        device: device._id,
        timeZone,
        method: result.method, // "model" (>= 7 of the last 14 days have data) or "average" (fewer)
        usedCalendar: !!result.usedCalendar, // true when weather + public holidays fed the forecast numbers
        daysUsed: result.daysUsed,
        usedToday: +usedToday.toFixed(2),
        forecast,
        billingMode: device.billingMode,
        asOf: now,
    };

    if (device.billingMode === "postpaid") {
        const bill = await Bill.findOne({ device: device._id, status: "open" });
        body.billEstimate = bill
            ? buildBillEstimate({
                  volumeUsed: bill.volumeUsed,
                  periodStart: bill.periodStart,
                  forecast,
                  usedToday,
                  now,
                  timeZone,
                  tariff: await getActiveTariff(),
                  computeBill,
              })
            : null;
    } else {
        const sub = await Subscription.findOne({ device: device._id, status: "active" });
        body.runOut = sub
            ? buildRunOut({ balance: sub.volumeRemaining, expiresAt: sub.expiresAt, forecast, usedToday, now, timeZone })
            : null;
    }
    return { status: 200, body };
};

// The Usage page asks for the forecast and the goal card in the same moment, and both need it.
// Share one computation per device for a minute (and join a request already in flight).
const CACHE_MS = 60 * 1000;
const forecastCache = new Map();
export const forecastCached = (device, timeZone) => {
    const key = `${device._id}|${timeZone}`;
    const hit = forecastCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = buildForecast(device, timeZone);
    forecastCache.set(key, { at: Date.now(), promise });
    promise.catch(() => forecastCache.delete(key)); // never cache a failure
    return promise;
};

// @route   GET /api/forecast?device=<id>&tz=Asia/Colombo
// @access  Private (owner or admin)
export const getForecast = async (req, res) => {
    try {
        const device = await canAccessDevice(req, req.query.device);
        if (!device) return res.status(404).json({ message: "Device not found" });
        const { status, body } = await forecastCached(device, resolveTimeZone(req.query.tz || DEFAULT_TZ));
        return res.status(status).json(body);
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// One row per device for the admin overview: expected usage over the next 7 days and the
// run-out date (prepaid) or projected bill (postpaid). Devices with too little history are
// listed with a message instead of being left out.
// @route   GET /api/forecast/network?tz=Asia/Colombo
// @access  Private (admin)
export const getNetworkForecast = async (req, res) => {
    try {
        const timeZone = resolveTimeZone(req.query.tz || DEFAULT_TZ);
        const devices = await Device.find({}).populate("owner", "name email").sort({ createdAt: 1 });
        const rows = await Promise.all(
            devices.map(async (device) => {
                const info = {
                    _id: device._id,
                    deviceId: device.deviceId,
                    name: device.name,
                    owner: device.owner ? { name: device.owner.name, email: device.owner.email } : null,
                    billingMode: device.billingMode,
                    status: device.status,
                };
                try {
                    const { body } = await buildForecast(device, timeZone);
                    if (!body.available) return { ...info, available: false, message: body.message };
                    const next7 = body.forecast.reduce((sum, d) => sum + d.litres, 0);
                    return {
                        ...info,
                        available: true,
                        method: body.method,
                        daysUsed: body.daysUsed,
                        usedToday: body.usedToday,
                        next7Litres: +next7.toFixed(1),
                        avgPerDay: +(next7 / body.forecast.length).toFixed(1),
                        runOut: body.runOut ? { balanceLitres: body.runOut.balanceLitres, daysLeft: body.runOut.daysLeft, date: body.runOut.date, limitedBy: body.runOut.limitedBy } : null,
                        bill: body.billEstimate ? { projectedLitres: body.billEstimate.projectedLitres.mid, amount: body.billEstimate.amount, daysLeftInCycle: body.billEstimate.daysLeftInCycle } : null,
                    };
                } catch (err) {
                    return { ...info, available: false, message: err.message };
                }
            })
        );
        return res.json({ timeZone, count: rows.length, devices: rows });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
