import { useState, useEffect, useCallback, useRef } from "react";
import { FiAlertOctagon, FiAlertTriangle, FiCheckCircle, FiShield, FiLoader, FiCpu } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { connectSocket } from "../../lib/socket.js";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import StatTile from "../../Components/SharedComponents/StatTile.jsx";
import SearchInput from "../../Components/SharedComponents/SearchInput.jsx";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";
import { useToast } from "../../Context/ToastContext.jsx";

const PAGE_SIZE = 5;

const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const severityChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};
const statusStyles = {
    active: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    acknowledged: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};
const sourceFilters = [
    { key: "all", label: "All sources" },
    { key: "rules", label: "Rules" },
    { key: "model", label: "AI model" },
];
const filters = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "acknowledged", label: "Acknowledged" },
    { key: "resolved", label: "Resolved" },
];

// Small tag shown on alerts raised by the ML model service (rule-based ones carry no tag).
// The household's answer ("It was me" / "Yes, a leak"), if any.
const FeedbackBadge = ({ feedback }) =>
    feedback?.label ? (
        <span
            title={feedback.note || undefined}
            className={`ml-1.5 rounded-md px-1.5 py-0.5 align-middle text-[10px] font-medium ${
                feedback.label === "normal-use"
                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    : "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
            }`}
        >
            {feedback.label === "normal-use" ? "Household: normal use" : "Household: real leak"}
        </span>
    ) : null;

const SourceBadge = ({ source }) =>
    source === "model" ? (
        <span className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 align-middle text-[10px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
            <FiCpu className="h-3 w-3" /> AI model
        </span>
    ) : null;

const Alerts = () => {
    const toast = useToast();
    const [alerts, setAlerts] = useState([]);
    const [filter, setFilter] = useState("all");
    const [source, setSource] = useState("all"); // which detector raised it: rules or the AI model
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(() => new Set());
    const lastLoadAt = useRef(0);

    useEffect(() => setPage(1), [filter, source, search]);

    const load = useCallback(async (silent = false) => {
        lastLoadAt.current = Date.now();
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/alerts?limit=200");
            setAlerts(data.alerts || []);
        } catch (err) {
            if (!silent) toast.error(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const socket = connectSocket();
        // If we just loaded (e.g. our own acknowledge/resolve), an incoming
        // socket notification for that same change is just an echo — skip it.
        const onChange = () => {
            if (Date.now() - lastLoadAt.current < 1500) return;
            load(true);
        };
        socket?.on("alert:new", onChange);
        socket?.on("alert:updated", onChange);
        // Safety-net poll in case a socket event is ever missed/disconnected.
        const id = setInterval(() => load(true), 60000);
        return () => {
            socket?.off("alert:new", onChange);
            socket?.off("alert:updated", onChange);
            clearInterval(id);
        };
    }, [load]);

    const run = async (fn, successMsg, key) => {
        if (key) setPending((s) => new Set(s).add(key));
        try {
            await fn();
            await load();
            if (successMsg) toast.success(successMsg);
        } catch (e) {
            toast.error(e.message);
        } finally {
            if (key) setPending((s) => { const n = new Set(s); n.delete(key); return n; });
        }
    };
    const acknowledge = (id) => run(() => apiFetch(`/api/alerts/${id}/acknowledge`, { method: "PUT" }), "Alert acknowledged.", `ack-${id}`);
    const resolve = (id) => run(() => apiFetch(`/api/alerts/${id}/resolve`, { method: "PUT" }), "Alert resolved.", `res-${id}`);
    const reopen = (deviceId) => run(() => apiFetch(`/api/devices/${deviceId}/valve`, { method: "PUT", body: { state: "open" } }), "Supply reopened.", `reopen-${deviceId}`);

    const q = search.trim().toLowerCase();
    const shown = alerts
        .filter((a) => filter === "all" || a.status === filter)
        .filter((a) => source === "all" || (a.source || "rules") === source)
        .filter((a) => !q || [a.device?.name, a.device?.deviceId, a.type].some((v) => v?.toLowerCase().includes(q)));
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const activeCount = alerts.filter((a) => a.status === "active").length;
    const resolvedCount = alerts.filter((a) => a.status === "resolved").length;

    if (loading) return <WaterLoader center />;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Leak Alerts</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Burst and micro-leak detections across the network.</p>
                </div>
            </div>

            {/* Summary tiles */}
            <StaggerGrid className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StaggerItem><StatTile label="Active alerts" value={activeCount} icon={FiAlertTriangle} tone="red" /></StaggerItem>
                <StaggerItem><StatTile label="Resolved" value={resolvedCount} icon={FiCheckCircle} tone="emerald" /></StaggerItem>
                <StaggerItem><StatTile label="Total" value={alerts.length} icon={FiShield} tone="sky" /></StaggerItem>
            </StaggerGrid>

            {/* Filter + search */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                    {filters.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setFilter(f.key)}
                            className={`rounded-sm px-3 py-1 text-xs font-medium transition ${
                                filter === f.key
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="inline-flex gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                    {sourceFilters.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setSource(f.key)}
                            className={`rounded-sm px-3 py-1 text-xs font-medium transition ${
                                source === f.key
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <SearchInput value={search} onChange={setSearch} placeholder="Search by device, ID, or type…" className="w-full sm:w-64" />
            </div>

            {/* Table */}
            {shown.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <FiCheckCircle className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                        {q ? `No alerts match "${search}".` : `No ${filter === "all" ? "" : `${filter} `}alerts.`}
                    </p>
                </div>
            ) : (
                <>
                {/* Cards (mobile) */}
                <div className="mt-4 space-y-3 md:hidden">
                    {paged.map((a) => {
                        const burst = a.type === "burst";
                        return (
                            <div key={a._id} className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${severityChip[a.severity]}`}>
                                            {burst ? <FiAlertOctagon className="h-4 w-4" /> : <FiAlertTriangle className="h-4 w-4" />}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-900 dark:text-white">{burst ? "Burst" : "Micro-leak"}<SourceBadge source={a.source} /><FeedbackBadge feedback={a.userFeedback} /></p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">{relativeTime(a.createdAt)}</p>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[a.status]}`}>
                                        {a.status}
                                    </span>
                                </div>

                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{a.message}</p>

                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Device</span>
                                        <span className="truncate pl-2 text-right text-slate-700 dark:text-slate-300">
                                            {a.device?.name || "—"}
                                            <span className="ml-1 font-mono text-xs text-slate-400 dark:text-slate-500">{a.device?.deviceId}</span>
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Flow</span>
                                        <span className="text-slate-700 dark:text-slate-300">{a.flowRate != null ? `${a.flowRate.toFixed(1)} L/min` : "—"}</span>
                                    </div>
                                </div>

                                {(a.status === "active" || a.status !== "resolved" || (["valve-closed", "valve-throttled"].includes(a.autoAction) && a.device?._id)) && (
                                    <div className="mt-3 flex items-center justify-end gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                        {a.status === "active" && (
                                            <button
                                                type="button"
                                                onClick={() => acknowledge(a._id)}
                                                disabled={pending.has(`ack-${a._id}`)}
                                                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:text-white"
                                            >
                                                {pending.has(`ack-${a._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                                Acknowledge
                                            </button>
                                        )}
                                        {a.status !== "resolved" && (
                                            <button
                                                type="button"
                                                onClick={() => resolve(a._id)}
                                                disabled={pending.has(`res-${a._id}`)}
                                                className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 transition hover:text-emerald-500 disabled:opacity-50 dark:text-emerald-400"
                                            >
                                                {pending.has(`res-${a._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                                Resolve
                                            </button>
                                        )}
                                        {["valve-closed", "valve-throttled"].includes(a.autoAction) && a.status === "resolved" && a.device?._id && (
                                            <button
                                                type="button"
                                                onClick={() => reopen(a.device._id)}
                                                disabled={pending.has(`reopen-${a.device._id}`)}
                                                className="flex items-center gap-1.5 text-xs font-medium text-sky-600 transition hover:text-sky-500 disabled:opacity-50 dark:text-sky-400"
                                            >
                                                {pending.has(`reopen-${a.device._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                                Reopen
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Table (desktop) */}
                <div className="mt-4 hidden overflow-x-auto rounded-sm border border-slate-200 md:block dark:border-slate-800">
                    <table className="w-full min-w-200 text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                <th className="px-4 py-2.5 font-medium">Alert</th>
                                <th className="px-4 py-2.5 font-medium">Device</th>
                                <th className="px-4 py-2.5 font-medium">Flow</th>
                                <th className="px-4 py-2.5 font-medium">Detected</th>
                                <th className="px-4 py-2.5 font-medium">Status</th>
                                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map((a) => {
                                const burst = a.type === "burst";
                                return (
                                    <tr key={a._id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${severityChip[a.severity]}`}>
                                                    {burst ? <FiAlertOctagon className="h-4 w-4" /> : <FiAlertTriangle className="h-4 w-4" />}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-slate-900 dark:text-white">{burst ? "Burst" : "Micro-leak"}<SourceBadge source={a.source} /><FeedbackBadge feedback={a.userFeedback} /></p>
                                                    <p className="max-w-xs truncate text-xs text-slate-400 dark:text-slate-500">{a.message}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900 dark:text-white">{a.device?.name || "—"}</p>
                                            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{a.device?.deviceId}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                            {a.flowRate != null ? `${a.flowRate.toFixed(1)} L/min` : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{relativeTime(a.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[a.status]}`}>
                                                {a.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-3">
                                                {a.status === "active" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => acknowledge(a._id)}
                                                        disabled={pending.has(`ack-${a._id}`)}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:text-white"
                                                    >
                                                        {pending.has(`ack-${a._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                                        Acknowledge
                                                    </button>
                                                )}
                                                {a.status !== "resolved" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => resolve(a._id)}
                                                        disabled={pending.has(`res-${a._id}`)}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 transition hover:text-emerald-500 disabled:opacity-50 dark:text-emerald-400"
                                                    >
                                                        {pending.has(`res-${a._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                                        Resolve
                                                    </button>
                                                )}
                                                {["valve-closed", "valve-throttled"].includes(a.autoAction) && a.status === "resolved" && a.device?._id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => reopen(a.device._id)}
                                                        disabled={pending.has(`reopen-${a.device._id}`)}
                                                        title="Restore supply after inspecting"
                                                        className="flex items-center gap-1.5 text-xs font-medium text-sky-600 transition hover:text-sky-500 disabled:opacity-50 dark:text-sky-400"
                                                    >
                                                        {pending.has(`reopen-${a.device._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                                        Reopen
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />
        </div>
    );
};

export default Alerts;
