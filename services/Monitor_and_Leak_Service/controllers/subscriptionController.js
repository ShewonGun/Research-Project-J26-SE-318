import mongoose from "mongoose";
import Subscription from "../models/Subscription.js";
import Device from "../models/Device.js";
import WaterPackage from "../models/WaterPackage.js";

const ownershipFilter = (req) => (req.user.role === "admin" ? {} : { user: req.user._id });

// Resolve a device the requester is allowed to act on, by mongo id or hardware id.
const resolveDevice = async (req, { device, deviceId }) => {
    const base = req.user.role === "admin" ? {} : { owner: req.user._id };
    if (device && mongoose.isValidObjectId(device)) return Device.findOne({ _id: device, ...base });
    if (deviceId) return Device.findOne({ deviceId, ...base });
    return null;
};

// Purchase a package for a device (start a prepaid subscription)
// @route   POST /api/subscriptions
// @access  Private
export const purchaseSubscription = async (req, res) => {
    try {
        const { packageId } = req.body;

        const device = await resolveDevice(req, req.body);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const existing = await Subscription.findOne({ device: device._id, status: "active" });
        if (existing) {
            return res.status(409).json({ message: "Device already has an active subscription" });
        }

        const pkg = await WaterPackage.findById(packageId);
        if (!pkg) return res.status(404).json({ message: "Package not found" });

        const expiresAt = new Date(Date.now() + (pkg.validityDays || 30) * 24 * 60 * 60 * 1000);

        const subscription = await Subscription.create({
            user: device.owner || req.user._id,
            device: device._id,
            package: pkg._id,
            volumeTotal: pkg.volumeLiters,
            volumeRemaining: pkg.volumeLiters,
            price: pkg.price,
            expiresAt,
        });

        // Start service: open the valve.
        // Restore the provider gate; the household's own tap is left as-is.
        device.adminValveState = "open";
        device.throttlePercent = 100;
        await device.save();

        return res.status(201).json({ subscription });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// List subscriptions (own, or all for admin)
// @route   GET /api/subscriptions?device=<id>&status=active
// @access  Private
export const getSubscriptions = async (req, res) => {
    try {
        const filter = { ...ownershipFilter(req) };
        if (req.query.device && mongoose.isValidObjectId(req.query.device)) filter.device = req.query.device;
        if (req.query.status) filter.status = req.query.status;

        const subscriptions = await Subscription.find(filter)
            .populate("package", "name volumeLiters price")
            .populate("device", "name deviceId")
            .sort({ createdAt: -1 });

        return res.json({ count: subscriptions.length, subscriptions });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get one subscription
// @route   GET /api/subscriptions/:id
// @access  Private
export const getSubscriptionById = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ _id: req.params.id, ...ownershipFilter(req) })
            .populate("package", "name volumeLiters price")
            .populate("device", "name deviceId");
        if (!subscription) return res.status(404).json({ message: "Subscription not found" });
        return res.json({ subscription });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Cancel a subscription (stops service — closes the valve)
// @route   DELETE /api/subscriptions/:id
// @access  Private
export const cancelSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!subscription) return res.status(404).json({ message: "Subscription not found" });

        subscription.status = "cancelled";
        await subscription.save();

        // No paid balance anymore → close the valve.
        await Device.findByIdAndUpdate(subscription.device, { adminValveState: "closed", throttlePercent: 0 });

        return res.json({ message: "Subscription cancelled" });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
