import Device from "../models/Device.js";
import Alert from "../models/Alert.js";
import BillingModeRequest from "../models/BillingModeRequest.js";
import { billingModeBlocker, applyBillingMode } from "../utils/billingMode.js";
import { createModeRequest } from "./billingRequestController.js";
import { emitDeviceChanged, emitDeviceListChanged, emitBillingRequestChanged } from "../config/socket.js";

// A user sees only their own devices; an admin sees all.
const ownershipFilter = (req) => (req.user.role === "admin" ? {} : { owner: req.user._id });

// Register a new device
// @route   POST /api/devices
// @access  Private
export const createDevice = async (req, res) => {
    try {
        const { deviceId, name, location, owner, billingMode } = req.body;

        const exists = await Device.findOne({ deviceId });
        if (exists) {
            return res.status(409).json({ message: "Device id already registered" });
        }

        const device = await Device.create({
            deviceId,
            name,
            location,
            // Admins may assign to any user; others own the device themselves.
            owner: req.user.role === "admin" && owner ? owner : req.user._id,
            billingMode: ["prepaid", "postpaid"].includes(billingMode) ? billingMode : undefined,
        });

        emitDeviceListChanged();
        return res.status(201).json({ device });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// List devices (own, or all for admin)
// @route   GET /api/devices
// @access  Private
export const getDevices = async (req, res) => {
    try {
        const devices = await Device.find(ownershipFilter(req))
            .populate("owner", "name email")
            .sort({ createdAt: -1 });
        return res.json({ count: devices.length, devices });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get one device
// @route   GET /api/devices/:id
// @access  Private
export const getDeviceById = async (req, res) => {
    try {
        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) }).populate(
            "owner",
            "name email"
        );
        if (!device) return res.status(404).json({ message: "Device not found" });
        return res.json({ device });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update device details
// @route   PUT /api/devices/:id
// @access  Private
export const updateDevice = async (req, res) => {
    try {
        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });

        const { name, location, owner, billingMode } = req.body;
        if (name !== undefined) device.name = name;
        if (location !== undefined) device.location = location;
        // Only admins may (re)assign the device to a household.
        if (owner !== undefined && req.user.role === "admin") device.owner = owner || null;
        // Only admins switch a connection between prepaid and postpaid.
        if (billingMode !== undefined && req.user.role === "admin" && ["prepaid", "postpaid"].includes(billingMode)) {
            device.billingMode = billingMode;
        }

        await device.save();
        const updated = await device.populate("owner", "name email");
        emitDeviceChanged(updated);
        return res.json({ device: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Control the valve. Admins set the provider gate (open/closed/throttled);
// households set their own tap (open/closed). Water flows only if both allow it.
// @route   PUT /api/devices/:id/valve
// @access  Private
export const setValve = async (req, res) => {
    try {
        const { state, throttlePercent } = req.body;

        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });

        // Safety lock: while a leak alert is unresolved, the supply can't be
        // reopened (admin gate → open/throttled, or household tap → open). The
        // alert must be resolved ("marked fixed") first, so damage is inspected
        // before water flows again.
        const opensFlow = req.user.role === "admin" ? state !== "closed" : state === "open";
        if (opensFlow) {
            const openLeak = await Alert.findOne({
                device: device._id,
                status: { $in: ["active", "acknowledged"] },
            });
            if (openLeak) {
                return res.status(409).json({
                    message:
                        "This connection has an unresolved leak alert. Mark the leak as fixed before restoring the supply.",
                });
            }
        }

        if (req.user.role === "admin") {
            // Provider gate — the authoritative supply valve.
            if (!["open", "closed", "throttled"].includes(state)) {
                return res.status(400).json({ message: "state must be open, closed, or throttled" });
            }
            device.adminValveState = state;
            if (state === "open") device.throttlePercent = 100;
            else if (state === "throttled") {
                const pct = Number(throttlePercent);
                if (Number.isNaN(pct) || pct < 1 || pct > 99) {
                    return res.status(400).json({ message: "throttlePercent must be between 1 and 99" });
                }
                device.throttlePercent = pct;
            }
        } else {
            // Household tap — on/off only.
            if (!["open", "closed"].includes(state)) {
                return res.status(400).json({ message: "state must be open or closed" });
            }
            device.userValveState = state;
        }

        const updated = await device.save();
        emitDeviceChanged(updated);
        return res.json({ device: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Switch a connection between prepaid and postpaid.
//   admin → applied immediately.
//   user  → can't switch alone: this files a request that an admin must approve
//           (see billingRequestController). The guardrails in utils/billingMode.js
//           apply both when the request is made and when it is approved.
// @route   PUT /api/devices/:id/billing-mode
// @access  Private (owner files a request; admin applies directly)
export const changeBillingMode = async (req, res) => {
    try {
        const { billingMode, reason } = req.body;
        if (!["prepaid", "postpaid"].includes(billingMode)) {
            return res.status(400).json({ message: "billingMode must be prepaid or postpaid" });
        }

        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });

        if (req.user.role !== "admin") {
            const { error, request } = await createModeRequest(device, req.user, billingMode, reason);
            if (error) return res.status(error.status).json({ message: error.message });
            return res.status(202).json({ request });
        }

        if (device.billingMode !== billingMode) {
            const blocker = await billingModeBlocker(device, billingMode);
            if (blocker) return res.status(409).json({ message: blocker });
            await applyBillingMode(device, billingMode);
        }
        const updated = await device.populate("owner", "name email");
        emitDeviceChanged(updated);
        return res.json({ device: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Delete a device
// @route   DELETE /api/devices/:id
// @access  Private
export const deleteDevice = async (req, res) => {
    try {
        const device = await Device.findOneAndDelete({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });
        // A deleted connection can't switch mode — drop its pending requests from the admin queue.
        const pending = await BillingModeRequest.find({ device: device._id, status: "pending" });
        if (pending.length) {
            await BillingModeRequest.updateMany({ _id: { $in: pending.map((r) => r._id) } }, { status: "cancelled" });
            pending.forEach((r) => emitBillingRequestChanged(r));
        }
        emitDeviceListChanged();
        return res.json({ message: "Device deleted" });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
