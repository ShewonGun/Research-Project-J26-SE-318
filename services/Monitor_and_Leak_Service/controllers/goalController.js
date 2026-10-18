import Goal from "../models/Goal.js";
import Reading from "../models/Reading.js";
import Subscription from "../models/Subscription.js";
import Bill from "../models/Bill.js";
import { getActiveTariff } from "../models/Tariff.js";
import { computeBill } from "../utils/computeBill.js";
import { resolveTimeZone } from "../utils/dayWindow.js";
import { localDayKey, fractionOfDayLeft, daysUntilEmpty, buildBillEstimate, DAY_MS } from "../utils/usageForecast.js";
import { suggestGoal, todayProgress, weekOutlook, streaks, buildTips } from "../utils/goalProgress.js";
import { canAccessDevice, dailyTotals, forecastCached } from "./forecastController.js";

// Daily water-use goal: set a target in litres, see today's and this week's forecast against it.
const DEFAULT_TZ = "Asia/Colombo";
const HISTORY_DAYS = 14;

// Average litres used in each LOCAL hour of the day over the last `days` days.
const hourlyAverage = async (deviceObjId, days, timeZone, daysWithData) => {
    const since = new Date(Date.now() - days * DAY_MS);
    const rows = await Reading.aggregate([
        { $match: { device: deviceObjId, timestamp: { $gte: since } } },
        { $group: { _id: { $hour: { date: "$timestamp", timezone: timeZone } }, litres: { $sum: "$volume" } } },
    ]);
    const hourly = new Array(24).fill(0);
    const divisor = Math.max(1, daysWithData); // a new device has fewer days than the window
    for (const r of rows) hourly[r._id] = r.litres / divisor;
    return hourly;
};

const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();

// @route   GET /api/goals?device=<id>&tz=Asia/Colombo
// @access  Private (owner or admin)
export const getGoal = async (req, res) => {
    try {
        const device = await canAccessDevice(req, req.query.device);
        if (!device) return res.status(404).json({ message: "Device not found" });
        const timeZone = resolveTimeZone(req.query.tz || DEFAULT_TZ);
        const now = new Date();
        const todayKey = localDayKey(now, timeZone);

        const totals = await dailyTotals(device._id, HISTORY_DAYS + 1, timeZone);
        const usedToday = totals[todayKey]?.litres || 0;
        const completed = Object.entries(totals)
            .filter(([day, t]) => day < todayKey && t.n > 0)
            .map(([day, t]) => ({ day, litres: +t.litres.toFixed(2) }))
            .sort((a, b) => a.day.localeCompare(b.day));

        const goalDoc = await Goal.findOne({ device: device._id });
        const suggested = suggestGoal(completed.map((d) => d.litres));
        if (!goalDoc) return res.json({ goal: null, suggestedLitres: suggested, usedToday: +usedToday.toFixed(1) });

        const goal = goalDoc.dailyLitres;
        let fc = null;
        try {
            const r = await forecastCached(device, timeZone);
            if (r.body?.available) fc = r.body;
        } catch {
            /* progress still works from today's usage alone */
        }
        const forecast = fc?.forecast || [];
        const progress = todayProgress({ goal, usedToday, forecastToday: forecast[0]?.litres ?? null });
        const hourly = await hourlyAverage(device._id, HISTORY_DAYS, timeZone, completed.length);

        // What meeting the goal would mean for the balance / the bill.
        const flat = Array.from({ length: 7 }, () => ({ litres: goal, low: goal, high: goal }));
        let impact = null;
        const frac = fractionOfDayLeft(now, timeZone);
        if (device.billingMode === "postpaid") {
            const bill = await Bill.findOne({ device: device._id, status: "open" });
            if (bill && fc?.billEstimate) {
                const atGoal = buildBillEstimate({ volumeUsed: bill.volumeUsed, periodStart: bill.periodStart, forecast: flat, usedToday, now, timeZone, tariff: await getActiveTariff(), computeBill });
                impact = { kind: "bill", atForecast: fc.billEstimate.amount.mid, atGoal: atGoal.amount.mid, saving: Math.max(0, +(fc.billEstimate.amount.mid - atGoal.amount.mid).toFixed(2)) };
            }
        } else {
            const sub = await Subscription.findOne({ device: device._id, status: "active" });
            if (sub && fc?.runOut) {
                const days = daysUntilEmpty(sub.volumeRemaining, flat.map((d) => d.litres), usedToday, frac);
                impact = { kind: "balance", balanceLitres: +sub.volumeRemaining.toFixed(1), daysAtForecast: fc.runOut.daysLeft, daysAtGoal: +days.toFixed(1) };
            }
        }

        return res.json({
            goal,
            updatedAt: goalDoc.updatedAt,
            timeZone,
            usedToday: +usedToday.toFixed(1),
            progress,
            outlook: weekOutlook(forecast, goal),
            streak: streaks(completed, goal),
            impact,
            tips: buildTips({ hourly, completed, dow: weekday, forecast, goal, expectedToday: progress.expectedToday, usedToday }),
            forecastMethod: fc?.method || null,
            suggestedLitres: suggested,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// @route   PUT /api/goals   body: { device, dailyLitres }
// @access  Private (owner or admin)
export const setGoal = async (req, res) => {
    try {
        const device = await canAccessDevice(req, req.body.device);
        if (!device) return res.status(404).json({ message: "Device not found" });
        const litres = Number(req.body.dailyLitres);
        if (!Number.isFinite(litres) || litres < 10 || litres > 5000)
            return res.status(400).json({ message: "Daily goal must be between 10 and 5000 litres." });
        const goal = await Goal.findOneAndUpdate(
            { device: device._id },
            { dailyLitres: Math.round(litres), user: req.user._id },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );
        return res.json({ goal: goal.dailyLitres });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// @route   DELETE /api/goals?device=<id>
// @access  Private (owner or admin)
export const clearGoal = async (req, res) => {
    try {
        const device = await canAccessDevice(req, req.query.device);
        if (!device) return res.status(404).json({ message: "Device not found" });
        await Goal.deleteOne({ device: device._id });
        return res.json({ goal: null });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
