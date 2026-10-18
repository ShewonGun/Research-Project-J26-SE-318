import mongoose from "mongoose";
import Bill from "../models/Bill.js";
import Device from "../models/Device.js";
import { getActiveTariff } from "../models/Tariff.js";
import { computeBill } from "../utils/computeBill.js";
import { getOrOpenBill, closeCycle, restoreIfClear } from "../utils/postpaid.js";

const ownershipFilter = (req) => (req.user.role === "admin" ? {} : { user: req.user._id });

// Confirm the requester may act on this device (admins bypass ownership).
const resolveDevice = async (req, deviceId) => {
    if (!mongoose.isValidObjectId(deviceId)) return null;
    const filter = req.user.role === "admin" ? { _id: deviceId } : { _id: deviceId, owner: req.user._id };
    return Device.findOne(filter);
};

// The device's running (open) bill, with a LIVE estimate from the active tariff.
// @route   GET /api/bills/current?device=<id>
// @access  Private
export const getCurrentBill = async (req, res) => {
    try {
        const device = await resolveDevice(req, req.query.device);
        if (!device) return res.status(404).json({ message: "Device not found" });
        if (device.billingMode !== "postpaid") {
            return res.json({ bill: null, message: "Device is not postpaid" });
        }

        const bill = await getOrOpenBill(device);
        const tariff = await getActiveTariff();
        const estimate = computeBill(bill.volumeUsed, tariff);

        return res.json({ bill, estimate, tariff });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Bill history (own, or all for admin), newest first.
// @route   GET /api/bills?device=<id>&status=unpaid
// @access  Private
export const getBills = async (req, res) => {
    try {
        const filter = { ...ownershipFilter(req) };
        if (req.query.device && mongoose.isValidObjectId(req.query.device)) filter.device = req.query.device;
        if (req.query.status) filter.status = req.query.status;

        const bills = await Bill.find(filter)
            .populate({
                path: "device",
                select: "name deviceId owner",
                populate: { path: "owner", select: "name accountNumber" },
            })
            .sort({ createdAt: -1 });

        return res.json({ count: bills.length, bills });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Close the current billing cycle for every postpaid device into payable bills.
// @route   POST /api/bills/run
// @access  Private (admin)
export const runBilling = async (req, res) => {
    try {
        const tariff = await getActiveTariff();
        const devices = await Device.find({ billingMode: "postpaid" });

        const generated = [];
        for (const device of devices) {
            const bill = await closeCycle(device, tariff);
            if (bill) generated.push(bill);
        }

        const total = generated.reduce((sum, b) => sum + (b.amount || 0), 0);
        return res.json({ count: generated.length, total, bills: generated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Pay a bill (household pays own; admin may settle any). Restores supply if the
// device has no remaining dues.
// @route   PUT /api/bills/:id/pay
// @access  Private
export const payBill = async (req, res) => {
    try {
        const bill = await Bill.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!bill) return res.status(404).json({ message: "Bill not found" });
        if (bill.status === "paid") return res.status(409).json({ message: "Bill already paid" });
        if (bill.status === "open") return res.status(400).json({ message: "Cycle is still open" });

        bill.status = "paid";
        bill.paidAt = new Date();
        await bill.save();

        const device = await Device.findById(bill.device);
        if (device) await restoreIfClear(device);

        return res.json({ bill });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
