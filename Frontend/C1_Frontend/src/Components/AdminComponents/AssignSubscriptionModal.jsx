import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";

// Assign a package to a device from the Subscriptions page (device + package pickers).
const AssignSubscriptionModal = ({ open, onClose, onAssigned }) => {
    const toast = useToast();
    const [devices, setDevices] = useState([]);
    const [packages, setPackages] = useState([]);
    const [deviceId, setDeviceId] = useState("");
    const [packageId, setPackageId] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setDeviceId("");
        setPackageId("");
        Promise.all([
            apiFetch("/api/devices").catch(() => ({ devices: [] })),
            apiFetch("/api/water-packages?active=true").catch(() => ({ packages: [] })),
        ]).then(([d, p]) => {
            setDevices(d.devices || []);
            setPackages(p.packages || []);
        });
    }, [open]);

    const panelRef = useModalDismiss(open, onClose);

    const assign = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const device = devices.find((d) => d._id === deviceId);
            await apiFetch("/api/subscriptions", {
                method: "POST",
                body: { deviceId: device.deviceId, packageId },
            });
            onAssigned?.();
            onClose?.();
            toast.success("Package assigned.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div
                        ref={panelRef}
                        tabIndex={-1}
                        className="w-full max-w-sm rounded-sm border border-slate-200 bg-white p-5 shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Assign package</h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                                aria-label="Close"
                            >
                                <FiX className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={assign} className="mt-4 space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Device</label>
                                <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required className={inputCls}>
                                    <option value="" disabled>Select a device…</option>
                                    {devices.map((d) => (
                                        <option key={d._id} value={d._id}>{d.name || d.deviceId} ({d.deviceId})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Package</label>
                                <select value={packageId} onChange={(e) => setPackageId(e.target.value)} required className={inputCls}>
                                    <option value="" disabled>Select a package…</option>
                                    {packages.map((p) => (
                                        <option key={p._id} value={p._id}>
                                            {p.name} — {p.volumeLiters.toLocaleString()} L · Rs. {p.price.toLocaleString()}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-sm px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !deviceId || !packageId}
                                    className="rounded-sm bg-sky-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
                                >
                                    {saving ? "Assigning…" : "Assign"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const inputCls =
    "w-full rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800";

export default AssignSubscriptionModal;
