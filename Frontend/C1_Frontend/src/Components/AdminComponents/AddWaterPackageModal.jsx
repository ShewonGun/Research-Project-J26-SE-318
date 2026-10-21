import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";

const emptyForm = {
    name: "",
    description: "",
    volumeLiters: "",
    price: "",
    validityDays: 30,
    isActive: true,
};

const AddWaterPackageModal = ({ open, editing, onClose, onSaved }) => {
    const toast = useToast();
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    // Sync the form whenever the modal opens (for create) or the target changes (edit).
    useEffect(() => {
        if (!open) return;
        setForm(
            editing
                ? {
                      name: editing.name,
                      description: editing.description || "",
                      volumeLiters: editing.volumeLiters,
                      price: editing.price,
                      validityDays: editing.validityDays,
                      isActive: editing.isActive,
                  }
                : emptyForm
        );
    }, [open, editing]);

    const panelRef = useModalDismiss(open, onClose);

    const set = (key) => (e) =>
        setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                description: form.description,
                volumeLiters: Number(form.volumeLiters),
                price: Number(form.price),
                validityDays: Number(form.validityDays),
                isActive: form.isActive,
            };
            if (editing) {
                await apiFetch(`/api/water-packages/${editing._id}`, { method: "PUT", body: payload });
            } else {
                await apiFetch("/api/water-packages", { method: "POST", body: payload });
            }
            onSaved?.();
            onClose?.();
            toast.success(editing ? "Package updated." : "Package created.");
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
                                {editing ? "Edit package" : "New package"}
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
                            <Field label="Name">
                                <input type="text" required value={form.name} onChange={set("name")} className={inputCls} placeholder="Basic 5000L" />
                            </Field>

                            <Field label="Description">
                                <input type="text" value={form.description} onChange={set("description")} className={inputCls} placeholder="Monthly prepaid plan" />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Volume (L)">
                                    <input type="number" required min="1" value={form.volumeLiters} onChange={set("volumeLiters")} className={inputCls} placeholder="5000" />
                                </Field>
                                <Field label="Price (Rs.)">
                                    <input type="number" required min="0" value={form.price} onChange={set("price")} className={inputCls} placeholder="1500" />
                                </Field>
                            </div>

                            <Field label="Validity (days)">
                                <input type="number" min="1" value={form.validityDays} onChange={set("validityDays")} className={inputCls} />
                            </Field>

                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={form.isActive} onChange={set("isActive")} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                                Available for purchase
                            </label>

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
                                    {saving ? "Saving…" : editing ? "Save" : "Create"}
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

export default AddWaterPackageModal;
