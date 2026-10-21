import { useState, useEffect } from "react";
import { FiX, FiTarget, FiTrash2 } from "react-icons/fi";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";
import ConfirmationBox from "../SharedComponents/ConfirmationBox.jsx";

const MIN_LITRES = 10;
const MAX_LITRES = 5000;

const inputCls =
    "w-full rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800";

/* Dialog for setting, changing or removing a device's daily water goal.
   goal            current goal in litres, or null when none is set
   suggestedLitres the server's suggestion (about 10 % below the household's usual day), or null
   onSaved         called after a goal was saved or removed, so the card can reload */
const GoalModal = ({ open, deviceId, goal, suggestedLitres, onClose, onSaved }) => {
    const toast = useToast();
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const editing = goal != null;

    // Start from the current goal, or the suggestion, every time the dialog opens.
    useEffect(() => {
        if (open) setValue(String(goal ?? suggestedLitres ?? ""));
    }, [open, goal, suggestedLitres]);

    const panelRef = useModalDismiss(open && !confirmRemove, onClose);

    const num = Number(value);
    const valid = Number.isFinite(num) && num >= MIN_LITRES && num <= MAX_LITRES;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!valid) return;
        setSaving(true);
        try {
            await apiFetch("/api/goals", { method: "PUT", body: { device: deviceId, dailyLitres: Math.round(num) } });
            toast.success(editing ? "Daily goal updated." : "Daily goal set.");
            onSaved?.();
            onClose?.();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        setSaving(true);
        try {
            await apiFetch(`/api/goals?device=${deviceId}`, { method: "DELETE" });
            toast.success("Daily goal removed.");
            setConfirmRemove(false);
            onSaved?.();
            onClose?.();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Quick picks: the suggestion, and a 10 % cut from the current goal when editing.
    const picks = [];
    if (suggestedLitres) picks.push({ label: `Suggested ${suggestedLitres} L`, litres: suggestedLitres });
    if (editing) picks.push({ label: `10% less (${Math.max(MIN_LITRES, Math.round((goal * 0.9) / 5) * 5)} L)`, litres: Math.max(MIN_LITRES, Math.round((goal * 0.9) / 5) * 5) });

    return (
        <>
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
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="goal-modal-title"
                            className="w-full max-w-sm rounded-sm border border-slate-200 bg-white p-5 shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900"
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 8 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                                        <FiTarget className="h-4 w-4" />
                                    </span>
                                    <h2 id="goal-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
                                        {editing ? "Edit daily goal" : "Set a daily goal"}
                                    </h2>
                                </div>
                                <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200" aria-label="Close">
                                    <FiX className="h-4 w-4" />
                                </button>
                            </div>

                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                Choose how much water you want to stay under each day. The Usage page then shows whether today and the coming week are on track.
                            </p>

                            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                                <div>
                                    <label htmlFor="goal-litres" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Litres per day
                                    </label>
                                    <input
                                        id="goal-litres"
                                        type="number"
                                        inputMode="numeric"
                                        min={MIN_LITRES}
                                        max={MAX_LITRES}
                                        step="5"
                                        required
                                        value={value}
                                        onChange={(e) => setValue(e.target.value)}
                                        className={inputCls}
                                        placeholder="e.g. 200"
                                    />
                                    {value !== "" && !valid && (
                                        <p className="mt-1 text-xs text-red-500">Enter a number between {MIN_LITRES} and {MAX_LITRES}.</p>
                                    )}
                                </div>

                                {picks.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {picks.map((p) => (
                                            <button
                                                key={p.label}
                                                type="button"
                                                onClick={() => setValue(String(p.litres))}
                                                className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {suggestedLitres && (
                                    <p className="text-xs text-slate-400 dark:text-slate-500">The suggestion is about 10% below your usual day, so it is achievable but still a saving.</p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-1">
                                    {editing ? (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmRemove(true)}
                                            disabled={saving}
                                            className="flex items-center gap-1 text-xs text-red-500 transition hover:text-red-600 disabled:opacity-60"
                                        >
                                            <FiTrash2 className="h-3.5 w-3.5" /> Remove goal
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="rounded-sm px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={saving || !valid}
                                            className="rounded-sm bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                        >
                                            {saving ? "Saving…" : editing ? "Save" : "Set goal"}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ConfirmationBox
                open={confirmRemove}
                title="Remove your daily goal?"
                message="You can set a new one at any time."
                confirmText="Remove"
                loading={saving}
                onConfirm={handleRemove}
                onCancel={() => setConfirmRemove(false)}
            />
        </>
    );
};

export default GoalModal;
