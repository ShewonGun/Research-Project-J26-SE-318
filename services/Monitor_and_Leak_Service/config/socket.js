import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Device from "../models/Device.js";

let io = null;

// Rooms:
//   user:<userId>   — this person's own updates (their device, their alerts)
//   admin           — every admin (network-wide device/alert changes)
//   device:<id>     — live readings/alerts for one device, joined on demand by
//                     whichever page is actually looking at that device
//
// Initialise once from server.js, on the same HTTP server Express listens on.
export const initSocket = (httpServer) => {
    io = new Server(httpServer, { cors: { origin: "*" } });

    // Authenticate the handshake with the same JWT REST calls use.
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error("Not authorized"));
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (!user) return next(new Error("Not authorized"));
            socket.user = user;
            next();
        } catch {
            next(new Error("Not authorized"));
        }
    });

    io.on("connection", (socket) => {
        socket.join(`user:${socket.user._id}`);
        if (socket.user.role === "admin") socket.join("admin");

        // Join a device's room to receive its live readings/alerts — ownership
        // is re-checked here, same rule as the REST endpoints.
        socket.on("device:join", async (deviceId) => {
            const filter =
                socket.user.role === "admin" ? { _id: deviceId } : { _id: deviceId, owner: socket.user._id };
            const device = await Device.findOne(filter).select("_id").catch(() => null);
            if (device) socket.join(`device:${deviceId}`);
        });

        socket.on("device:leave", (deviceId) => socket.leave(`device:${deviceId}`));
    });

    return io;
};

export const getIO = () => io;

// A device's supply/status meaningfully changed (valve transition, came back
// online, billing mode switched, ownership changed…) — tell whoever cares to
// refetch. Not fired on every raw reading; see readingController.
export const emitDeviceChanged = (device) => {
    getIO()?.to(`device:${device._id}`).to(`user:${device.owner}`).to("admin").emit("device:updated", {
        deviceId: String(device._id),
    });
};

// The admin device list gained/lost an entry.
export const emitDeviceListChanged = () => {
    getIO()?.to("admin").emit("device:list-changed");
};

// A fresh telemetry sample — high frequency, consumed by live flow charts.
export const emitReading = (device, { flowRate, volume, timestamp }) => {
    getIO()?.to(`device:${device._id}`).emit("reading:new", {
        device: String(device._id),
        flowRate,
        volume,
        timestamp,
    });
};

// A postpaid device's open cycle accrued a reading — the running litres and the
// live charge at the current tariff. Sent on every postpaid reading, so clients
// patch it in place rather than refetching.
export const emitBillUpdated = (device, bill, estimate) => {
    getIO()?.to(`device:${device._id}`).to(`user:${device.owner}`).to("admin").emit("bill:updated", {
        deviceId: String(device._id),
        bill: { _id: String(bill._id), volumeUsed: bill.volumeUsed, periodStart: bill.periodStart, status: bill.status },
        estimate,
    });
};

// A billing-mode request was filed or decided — admins refetch their queue, and
// the requesting household sees the outcome.
export const emitBillingRequestChanged = (request) => {
    const userId = request.user?._id || request.user;
    getIO()?.to("admin").to(`user:${userId}`).emit("billing-request:changed", {
        requestId: String(request._id),
        status: request.status,
    });
};

// A leak/burst alert was raised, acknowledged, resolved, or auto-cleared.
export const emitAlertChanged = (status, { userId, deviceId } = {}) => {
    const io_ = getIO();
    if (!io_) return;
    let op = io_.to("admin");
    if (deviceId) op = op.to(`device:${deviceId}`);
    if (userId) op = op.to(`user:${userId}`);
    op.emit(status === "active" ? "alert:new" : "alert:updated", {});
};
