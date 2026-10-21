import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FiShield, FiAlertTriangle, FiAlertOctagon, FiArrowRight } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";

const statusPill = {
    active: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    acknowledged: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};
const iconChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};

const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

// Home "Leak detection" card: a live mini-feed of recent detections (resolved
// and unresolved), fetched independently so it can include resolved history.
const LeakCard = () => {
    const [alerts, setAlerts] = useState([]);

    const load = useCallback(async () => {
        try {
            const data = await apiFetch("/api/alerts?limit=6");
            setAlerts(data.alerts || []);
        } catch {
            /* keep last */
        }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [load]);

    const activeCount = alerts.filter((a) => a.status === "active").length;
    const recent = alerts.slice(0, 3);

    return (
        <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span
                        className={`flex h-7 w-7 items-center justify-center rounded-md ${
                            activeCount > 0
                                ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                                : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                        }`}
                    >
                        <FiShield className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Leak detection</span>
                </div>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Live
                </span>
            </div>

            {/* Feed */}
            <div className="flex flex-1 flex-col justify-center py-2">
                {recent.length === 0 ? (
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                            <FiShield className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-base font-semibold text-slate-900 dark:text-white">All clear</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Monitored for bursts &amp; micro-leaks</p>
                        </div>
                    </div>
                ) : (
                    <ul className="space-y-2.5">
                        {recent.map((a) => {
                            const burst = a.type === "burst";
                            return (
                                <li key={a._id} className="flex items-center gap-2.5">
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconChip[a.severity]}`}>
                                        {burst ? <FiAlertOctagon className="h-3.5 w-3.5" /> : <FiAlertTriangle className="h-3.5 w-3.5" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-slate-900 dark:text-white">
                                            {burst ? "Burst detected" : "Micro-leak"}
                                        </p>
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{relativeTime(a.createdAt)}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium capitalize ${statusPill[a.status]}`}>
                                        {a.status === "resolved" ? "Solved" : a.status}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Footer */}
            <Link
                to="/app/alerts"
                className="mt-1 flex items-center gap-1 border-t border-slate-100 pt-3 text-sm font-medium text-sky-600 hover:text-sky-500 dark:border-slate-800 dark:text-sky-400"
            >
                View alerts <FiArrowRight className="h-4 w-4" />
            </Link>
        </div>
    );
};

export default LeakCard;
