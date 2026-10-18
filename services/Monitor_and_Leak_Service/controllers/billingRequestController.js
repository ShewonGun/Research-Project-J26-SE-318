import mongoose from "mongoose";
import BillingModeRequest from "../models/BillingModeRequest.js";
import Device from "../models/Device.js";
import { billingModeBlocker, applyBillingMode } from "../utils/billingMode.js";
import { emitDeviceChanged, emitBillingRequestChanged } from "../config/socket.js";

const populateRequest = (q) =>
    q
        .populate("device", "name deviceId billingMode")
        .populate("user", "name email accountNumber")
        .populate("decidedBy", "name");

// Create a pending request for a device (used by the device billing-mode route).
// Returns { error: {status, message} } or { request }.
export const createModeRequest = async (device, user, toMode, reason) => {
    if (device.billingMode === toMode) {
        return { error: { status: 400, message: `This connection is already ${toMode}.` } };
    }
    const pending = await BillingModeRequest.findOne({ device: device._id, status: "pending" });
    if (pending) {
        return { error: { status: 409, message: "A billing mode request is already awaiting admin approval." } };
    }
    const blocker = await billingModeBlocker(device, toMode);
    if (blocker) return { error: { status: 409, message: blocker } };

    const created = await BillingModeRequest.create({
        device: device._id,
        user: user._id,
        fromMode: device.billingMode,
        toMode,
        reason: reason || undefined,
    });
    const request = await populateRequest(BillingModeRequest.findById(created._id));
    emitBillingRequestChanged(request);
    return { request };
};

// List requests (own, or all for admin)
// @route   GET /api/billing-requests?status=pending&device=<id>
// @access  Private
export const getBillingRequests = async (req, res) => {
    try {
        const filter = req.user.role === "admin" ? {} : { user: req.user._id };
        if (req.query.status) filter.status = { $in: req.query.status.split(",") };
        if (req.query.device && mongoose.isValidObjectId(req.query.device)) filter.device = req.query.device;

        const requests = await populateRequest(BillingModeRequest.find(filter).sort({ createdAt: -1 }).limit(200));
        return res.json({ count: requests.length, requests });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Approve a request — applies the switch.
// @route   PUT /api/billing-requests/:id/approve
// @access  Admin
export const approveBillingRequest = async (req, res) => {
    try {
        const request = await BillingModeRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: "Request not found" });
        if (request.status !== "pending") {
            return res.status(409).json({ message: `Request was already ${request.status}.` });
        }

        const device = await Device.findById(request.device);
        if (!device) return res.status(404).json({ message: "Device no longer exists" });
        if (String(device.owner) !== String(request.user)) {
            return res.status(409).json({ message: "This connection now belongs to a different household. Reject this request." });
        }
        if (device.billingMode === request.toMode) {
            return res.status(409).json({ message: `Connection is already ${request.toMode}. Reject this request instead.` });
        }

        // State may have changed since the request was made — re-check.
        const blocker = await billingModeBlocker(device, request.toMode);
        if (blocker) return res.status(409).json({ message: blocker });

        await applyBillingMode(device, request.toMode);

        request.status = "approved";
        request.adminNote = req.body?.note || undefined;
        request.decidedBy = req.user._id;
        request.decidedAt = new Date();
        await request.save();

        emitDeviceChanged(device);
        emitBillingRequestChanged(request);
        return res.json({ request: await populateRequest(BillingModeRequest.findById(request._id)) });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Reject a request — nothing changes on the device.
// @route   PUT /api/billing-requests/:id/reject
// @access  Admin
export const rejectBillingRequest = async (req, res) => {
    try {
        const request = await BillingModeRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ message: "Request not found" });
        if (request.status !== "pending") {
            return res.status(409).json({ message: `Request was already ${request.status}.` });
        }

        request.status = "rejected";
        request.adminNote = req.body?.note || undefined;
        request.decidedBy = req.user._id;
        request.decidedAt = new Date();
        await request.save();

        emitBillingRequestChanged(request);
        return res.json({ request: await populateRequest(BillingModeRequest.findById(request._id)) });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Withdraw your own pending request.
// @route   DELETE /api/billing-requests/:id
// @access  Private (requester)
export const cancelBillingRequest = async (req, res) => {
    try {
        const request = await BillingModeRequest.findOne({ _id: req.params.id, user: req.user._id });
        if (!request) return res.status(404).json({ message: "Request not found" });
        if (request.status !== "pending") {
            return res.status(409).json({ message: `Request was already ${request.status}.` });
        }
        request.status = "cancelled";
        await request.save();
        emitBillingRequestChanged(request);
        return res.json({ request });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
