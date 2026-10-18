import Bill from "../models/Bill.js";
import { getActiveTariff } from "../models/Tariff.js";
import { computeBill } from "./computeBill.js";

// Postpaid enforcement policy.
export const DUE_DAYS = 14; // days after cycle close before a bill is due
export const GRACE_DAYS = 7; // days a bill may stay overdue before disconnection
export const OVERDUE_THROTTLE = 30; // % flow allowed while overdue (drought-equity)

const DAY_MS = 24 * 60 * 60 * 1000;

// Find the device's running cycle, opening one if none exists yet.
export const getOrOpenBill = async (device) => {
    let bill = await Bill.findOne({ device: device._id, status: "open" });
    if (!bill) {
        bill = await Bill.create({
            user: device.owner,
            device: device._id,
            periodStart: new Date(),
            volumeUsed: 0,
        });
    }
    return bill;
};

// Enforce the provider gate for a postpaid device based on its unpaid bills.
// One-directional: it only ever TIGHTENS supply (open → throttled → closed) as
// bills pass their due date and grace period. Loosening happens only on payment
// (see restoreIfClear), so a manual admin close is never auto-reverted here.
export const applyPostpaidEnforcement = async (device) => {
    const now = new Date();
    const bills = await Bill.find({
        device: device._id,
        status: { $in: ["unpaid", "overdue"] },
    });

    let action = null; // null → nothing | "throttle" | "close"
    for (const bill of bills) {
        if (!bill.dueDate) continue;

        // Past due → mark overdue.
        if (now > bill.dueDate && bill.status === "unpaid") {
            bill.status = "overdue";
            await bill.save();
        }

        if (now > new Date(+bill.dueDate + GRACE_DAYS * DAY_MS)) {
            action = "close"; // grace exhausted → disconnect
        } else if (now > bill.dueDate && action !== "close") {
            action = "throttle";
        }
    }

    if (action === "close" && device.adminValveState !== "closed") {
        device.adminValveState = "closed";
        device.throttlePercent = 0;
        await device.save();
    } else if (action === "throttle" && device.adminValveState === "open") {
        device.adminValveState = "throttled";
        device.throttlePercent = OVERDUE_THROTTLE;
        await device.save();
    }

    return device;
};

// After a payment, restore supply if the device has no remaining dues.
export const restoreIfClear = async (device) => {
    const outstanding = await Bill.countDocuments({
        device: device._id,
        status: { $in: ["unpaid", "overdue"] },
    });
    if (outstanding === 0 && device.adminValveState !== "open") {
        device.adminValveState = "open";
        device.throttlePercent = 100;
        await device.save();
    }
    return device;
};

// Close a device's open cycle into a payable (unpaid) bill and start a fresh
// cycle. Returns the finalized bill, or null if there was nothing to bill.
export const closeCycle = async (device, tariff) => {
    const open = await Bill.findOne({ device: device._id, status: "open" });
    if (!open) return null;

    const t = tariff || (await getActiveTariff());
    const priced = computeBill(open.volumeUsed, t);
    const now = new Date();

    open.periodEnd = now;
    open.units = priced.units;
    open.usageCharge = priced.usageCharge;
    open.fixedCharge = priced.fixedCharge;
    open.amount = priced.amount;
    open.breakdown = priced.breakdown;
    open.status = "unpaid";
    open.dueDate = new Date(+now + DUE_DAYS * DAY_MS);
    await open.save();

    // Begin the next cycle immediately so telemetry keeps accruing.
    await Bill.create({
        user: device.owner,
        device: device._id,
        periodStart: now,
        volumeUsed: 0,
    });

    return open;
};
