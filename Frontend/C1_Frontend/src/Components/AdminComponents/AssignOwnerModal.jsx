import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "../../lib/api.js";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";
import HouseholdSelect from "./HouseholdSelect.jsx";

// Assign / reassign a device to a household (admin only).
const AssignOwnerModal = ({ open, device, onClose, onAssigned }) => {
    const [ownerId, setOwnerId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setError("");
        setOwnerId(device?.owner?._id || "");
    }, [open, device]);

    const panelRef = useModalDismiss(open, onClose);

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const data = await apiFetch(`/api/devices/${device._id}`, {
                method: "PUT",
                body: { owner: ownerId || null },
            });
            onAssigned?.(data.device);
            onClose?.();
        } catch (err) {
            setError(err.message);
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
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Assign owner</h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                                aria-label="Close"
                            >
                                <FiX className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {device?.name || device?.deviceId}
                        </p>

                        {error && (
                            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        <form onSubmit={save} className="mt-4 space-y-3">
                            <HouseholdSelect open={open} value={ownerId} onChange={setOwnerId} onError={setError} />

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
                                    disabled={saving}
                                    className="rounded-sm bg-sky-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AssignOwnerModal;
