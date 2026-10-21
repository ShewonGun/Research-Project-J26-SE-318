import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api.js";

// Household picker shared by device registration and owner (re)assignment —
// fetches the household list whenever the host modal opens.
const HouseholdSelect = ({ open, value, onChange, label = "Household", onError, id }) => {
    const [households, setHouseholds] = useState([]);

    useEffect(() => {
        if (!open) return;
        apiFetch("/api/users?role=user")
            .then((d) => setHouseholds(d.users || []))
            .catch((e) => onError?.(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
            >
                <option value="">Unassigned</option>
                {households.map((h) => (
                    <option key={h._id} value={h._id}>{h.name} ({h.email})</option>
                ))}
            </select>
        </div>
    );
};

export default HouseholdSelect;
