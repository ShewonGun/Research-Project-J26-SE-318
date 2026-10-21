import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";
import HouseholdSelect from "./HouseholdSelect.jsx";

const emptyForm = { deviceId: "", name: "", location: "", owner: "" };

const AddDeviceModal = ({ open, editing, onClose, onSaved }) => {
    const toast = useToast();
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    // Sync the form whenever the modal opens (for create) or the target changes (edit).
    useEffect(() => {
        if (!open) return;
        setForm(
            editing
                ? {
                      deviceId: editing.deviceId,
                      name: editing.name || "",
                      location: editing.location || "",
                      owner: editing.owner?._id || "",
                  }
                : emptyForm
        );
    }, [open, editing]);

    const panelRef = useModalDismiss(open, onClose);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editing) {
                await apiFetch(`/api/devices/${editing._id}`, {
                    method: "PUT",
                    body: { name: form.name, location: form.location },
                });
            } else {
                const body = { ...form };
                if (!body.owner) delete body.owner; // omit when unassigned
                await apiFetch("/api/devices", { method: "POST", body });
            }
            onSaved?.();
            onClose?.();
            toast.success(editing ? "Connection updated." : "Connection registered.");
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
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                {editing ? "Edit connection" : "Register connection"}
                            </h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                                aria-label="Close"
                            >
                                <FiX className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                            <Field label="Device ID">
                                <input
                                    type="text"
                                    required
                                    disabled={!!editing}
                                    value={form.deviceId}
                                    onChange={set("deviceId")}
                                    className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/50`}
                                    placeholder="ESP32-A1B2C3"
                                />
                                {editing && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Device ID can't be changed.</p>}
                            </Field>
                            <Field label="Name">
                                <input type="text" value={form.name} onChange={set("name")} className={inputCls} placeholder="97/A" />
                            </Field>
                            <Field label="Location">
                                <input type="text" value={form.location} onChange={set("location")} className={inputCls} placeholder="Colombo" />
                            </Field>
                            {!editing && (
                                <HouseholdSelect
                                    open={open}
                                    label="Owner (household)"
                                    value={form.owner}
                                    onChange={(v) => setForm((f) => ({ ...f, owner: v }))}
                                />
                            )}

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
                                    {saving ? "Saving…" : editing ? "Save" : "Register"}
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
    "w-full rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800";

const Field = ({ label, children }) => (
    <div>
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
        {children}
    </div>
);

export default AddDeviceModal;
