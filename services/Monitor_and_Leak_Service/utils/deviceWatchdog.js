import Device from "../models/Device.js";
import { emitDeviceChanged } from "../config/socket.js";

// Devices post a reading every ~6 s and are marked "online" when one arrives, but
// nothing ever marked them "offline" again — a unit that was unplugged weeks ago
// kept showing as online. This watchdog flips a device to offline once it has been
// silent for OFFLINE_AFTER_MS. It only touches Device.status (display); readings,
// billing, quotas and leak detection don't read it.
export const OFFLINE_AFTER_MS = 60 * 1000; // ~10 missed readings → offline
const SWEEP_EVERY_MS = 15 * 1000;

export const markStaleDevicesOffline = async (now = Date.now()) => {
    const cutoff = new Date(now - OFFLINE_AFTER_MS);
    const staleFilter = { status: "online", $or: [{ lastSeen: { $lt: cutoff } }, { lastSeen: null }, { lastSeen: { $exists: false } }] };

    const stale = await Device.find(staleFilter).select("_id owner");
    if (stale.length === 0) return 0;

    // Atomic + conditional: if a reading arrives between the find and this update,
    // lastSeen is fresh again and that device is left alone.
    await Device.updateMany({ _id: { $in: stale.map((d) => d._id) }, ...staleFilter }, { $set: { status: "offline" } });

    const flipped = await Device.find({ _id: { $in: stale.map((d) => d._id) }, status: "offline" });
    flipped.forEach((d) => emitDeviceChanged(d)); // tell open dashboards to refetch
    return flipped.length;
};

export const startDeviceWatchdog = () => {
    const timer = setInterval(() => {
        markStaleDevicesOffline().catch((err) => console.error(`Device watchdog: ${err.message}`));
    }, SWEEP_EVERY_MS);
    timer.unref?.(); // never keep the process alive just for this
    return timer;
};
