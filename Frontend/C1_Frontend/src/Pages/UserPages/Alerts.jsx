import { useState, useEffect, useCallback, useRef } from "react";
import { FiAlertOctagon, FiAlertTriangle, FiCheckCircle, FiShield, FiInfo, FiUser, FiDroplet } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { connectSocket } from "../../lib/socket.js";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import AlertExplanation from "../../Components/SharedComponents/AlertExplanation.jsx";

const PAGE_SIZE = 5;

const severityChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};
const statusBadge = {
    active: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    acknowledged: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};
const filters = [
    { key: "open", label: "Open" },
    { key: "resolved", label: "Resolved" },
    { key: "all", label: "All" },
];

const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const Alerts = () => {
    const { device, loading: ctxLoading } = useMyWater();
    const toast = useToast();
    const [all, setAll] = useState([]);
    const [filter, setFilter] = useState("open");
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [explained, setExplained] = useState(null); // id of the alert whose "Why?" is open
    const lastLoadAt = useRef(0);
    const deviceId = device?._id;

    useEffect(() => setPage(1), [filter]);

    const load = useCallback(async () => {
        lastLoadAt.current = Date.now();
        try {
            const data = await apiFetch(`/api/alerts?limit=200`);
            setAll(data.alerts || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    // Live updates instead of polling — join this device's room and refetch
    // when the server says something actually changed. If we just loaded
    // ourselves (e.g. our own acknowledge/resolve), skip the echo.
    useEffect(() => {
        if (!deviceId) return;
        const socket = connectSocket();
        if (!socket) return;

        socket.emit("device:join", deviceId);
        const onChange = () => {
            if (Date.now() - lastLoadAt.current < 1500) return;
            load();
        };
        socket.on("alert:new", onChange);
        socket.on("alert:updated", onChange);

        // Safety-net poll in case a socket event is ever missed/disconnected.
        const id = setInterval(onChange, 60000);
        return () => {
            socket.emit("device:leave", deviceId);
            socket.off("alert:new", onChange);
            socket.off("alert:updated", onChange);
            clearInterval(id);
        };
    }, [deviceId, load]);

    if (ctxLoading) return <WaterLoader center />;
    if (!device) return <NoDevice />;
    if (loading) return <WaterLoader center />;

    const run = async (fn, successMsg) => {
        try {
            await fn();
            await load();
            if (successMsg) toast.success(successMsg);
        } catch (e) {
            toast.error(e.message);
        }
    };
    const acknowledge = (id) => run(() => apiFetch(`/api/alerts/${id}/acknowledge`, { method: "PUT" }), "Alert dismissed.");
    const resolve = (id) => run(() => apiFetch(`/api/alerts/${id}/resolve`, { method: "PUT" }), "Marked as fixed.");
    // "It was me" / "Yes, a leak" — the household's answer becomes a real label for the leak model.
    const answer = (a, label) => {
        if (label === "normal-use") {
            const valve =
                a.status === "resolved"
                    ? ""
                    : a.autoAction === "valve-closed"
                      ? " The valve stays closed until your provider restores the supply."
                      : a.autoAction === "valve-throttled"
                        ? " The supply stays reduced until your provider restores full flow."
                        : "";
            if (!window.confirm(`Mark this as normal water use? The alert will be closed and similar AI alerts pause for an hour.${valve}`)) return;
        }
        return run(
            () => apiFetch(`/api/alerts/${a._id}/feedback`, { method: "PUT", body: { label } }),
            label === "normal-use" ? "Thanks, noted as normal use." : "Thanks. Please check for the leak and mark it fixed once repaired."
        );
    };

    const activeCount = all.filter((a) => a.status === "active").length;
    const resolvedCount = all.filter((a) => a.status === "resolved").length;

    const list = all.filter((a) =>
        filter === "open" ? a.status !== "resolved" : filter === "resolved" ? a.status === "resolved" : true
    );
    const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div>
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">Leak alerts</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Burst and micro-leak detection for your water meter.</p>

            {/* Summary tiles */}
            <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
                <Stat label="Active" value={activeCount} icon={FiAlertTriangle} tone="red" />
                <Stat label="Resolved" value={resolvedCount} icon={FiCheckCircle} tone="emerald" />
                <Stat label="Total" value={all.length} icon={FiShield} tone="sky" />
            </div>

            {/* Filters */}
            <div className="mt-5 inline-flex gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
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

            {/* List */}
            <div className="mt-4 space-y-3">
                {list.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
                        <FiCheckCircle className="mx-auto h-8 w-8 text-emerald-500" />
                        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">No {filter === "open" ? "open " : ""}alerts</p>
                        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Your water is flowing normally.</p>
                    </div>
                ) : (
                    paged.map((a) => {
                        const burst = a.type === "burst";
                        return (
                            <div key={a._id} className="flex items-start gap-3 rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${severityChip[a.severity]}`}>
                                    {burst ? <FiAlertOctagon className="h-4.5 w-4.5" /> : <FiAlertTriangle className="h-4.5 w-4.5" />}
                                </span>

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{burst ? "Burst detected" : "Possible micro-leak"}</span>
                                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadge[a.status]}`}>{a.status}</span>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{a.message}</p>
                                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                                        {a.flowRate != null && `${a.flowRate.toFixed(1)} L/min · `}
                                        {relativeTime(a.createdAt)}
                                        {" · "}
                                        <button
                                            type="button"
                                            onClick={() => setExplained(explained === a._id ? null : a._id)}
                                            className="inline-flex items-center gap-1 font-medium text-sky-600 hover:underline dark:text-sky-400"
                                        >
                                            <FiInfo className="h-3 w-3" />
                                            {explained === a._id ? "Hide" : "Why?"}
                                        </button>
                                    </p>
                                    {explained === a._id && <AlertExplanation alertId={a._id} />}
                                    {a.userFeedback?.label ? (
                                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {a.userFeedback.label === "normal-use" ? <FiUser className="h-3 w-3" /> : <FiDroplet className="h-3 w-3" />}
                                            {a.userFeedback.label === "normal-use" ? "You said: it was you (normal use)" : "You confirmed: a real leak"}
                                        </p>
                                    ) : (
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Was this a leak?</span>
                                            <button
                                                type="button"
                                                onClick={() => answer(a, "normal-use")}
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                <FiUser className="h-3 w-3" /> It was me
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => answer(a, "real-leak")}
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                <FiDroplet className="h-3 w-3" /> Yes, a leak
                                            </button>
                                        </div>
                                    )}
                                    {a.autoAction === "valve-closed" && a.status !== "resolved" && (
                                        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                            Your supply was automatically shut off. Contact your provider to restore it after checking for damage.
                                        </p>
                                    )}
                                    {a.autoAction === "valve-throttled" && a.status !== "resolved" && (
                                        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                            Your supply was automatically reduced to limit water loss. Fix the leak and mark it fixed, then your provider can restore full flow.
                                        </p>
                                    )}
                                </div>

                                {a.status !== "resolved" && (
                                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                                        {a.status === "active" && (
                                            <button
                                                type="button"
                                                onClick={() => acknowledge(a._id)}
                                                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                            >
                                                Dismiss
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => resolve(a._id)}
                                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
                                        >
                                            Mark fixed
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <Pagination page={page} pageSize={PAGE_SIZE} total={list.length} onChange={setPage} />
        </div>
    );
};

const tones = {
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
};

const Stat = ({ label, value, icon: Icon, tone }) => (
    <div className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
);

export default Alerts;
