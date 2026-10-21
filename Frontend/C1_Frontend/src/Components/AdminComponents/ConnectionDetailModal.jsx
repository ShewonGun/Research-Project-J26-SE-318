import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
    FiX,
    FiDroplet,
    FiSliders,
    FiSlash,
    FiCpu,
    FiUser,
    FiArrowRight,
    FiAlertOctagon,
    FiAlertTriangle,
    FiMapPin,
    FiClock,
    FiCalendar,
    FiCreditCard,
    FiActivity,
} from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { connectSocket } from "../../lib/socket.js";
import { useToast } from "../../Context/ToastContext.jsx";
import FlowChart from "../SharedComponents/FlowChart.jsx";
import UsageChart from "../SharedComponents/UsageChart.jsx";
import AssignOwnerModal from "./AssignOwnerModal.jsx";

const valveSegments = [
    { key: "open", label: "Open", icon: FiDroplet, active: "text-emerald-700 dark:text-emerald-400" },
    { key: "throttled", label: "Throttle", icon: FiSliders, active: "text-amber-700 dark:text-amber-400" },
    { key: "closed", label: "Close", icon: FiSlash, active: "text-red-600 dark:text-red-400" },
];
const valveStyles = {
    open: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    closed: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    throttled: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
};
const alertChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};
const alertStatus = {
    active: "text-red-600 dark:text-red-400",
    acknowledged: "text-amber-600 dark:text-amber-400",
    resolved: "text-emerald-600 dark:text-emerald-400",
};

const relativeTime = (date) => {
    if (!date) return "never";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

// Pill-style link/action button — matches DeviceCard's "View details" treatment.
const pillLinkCls =
    "inline-flex items-center gap-1 rounded-md bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-400 dark:hover:bg-sky-950";

// Section card: groups related content with a small heading row.
const Section = ({ icon: Icon, title, right, children }) => (
    <div className="mt-3 rounded-md border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/60 dark:bg-slate-800/20">
        <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {title}
            </div>
            {right}
        </div>
        {children}
    </div>
);

// Full detail / control view for one connection (device), shown in a modal.
const ConnectionDetailModal = ({ open, device, onClose, onUpdated }) => {
    const toast = useToast();
    const [sub, setSub] = useState(null);
    const [usage, setUsage] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [ownerOpen, setOwnerOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [throttlePct, setThrottlePct] = useState(50);

    // Keyed on the device *id*, not the device object — the parent hands this
    // modal a freshly-recreated `device` object on every list refresh (even
    // the harmless 60s fallback poll), so depending on the object itself would
    // re-run this modal's effects — and re-fetch — on every one of those.
    const deviceId = device?._id;

    const load = useCallback(async () => {
        if (!deviceId) return;
        const [s, u, a] = await Promise.all([
            apiFetch(`/api/subscriptions?device=${deviceId}`).catch(() => ({ subscriptions: [] })),
            apiFetch(`/api/readings/usage?device=${deviceId}&days=7`).catch(() => ({ daily: [], total: 0 })),
            apiFetch(`/api/alerts?device=${deviceId}&limit=5`).catch(() => ({ alerts: [] })),
        ]);
        setSub((s.subscriptions || [])[0] || null);
        setUsage(u);
        setAlerts(a.alerts || []);
    }, [deviceId]);

    // Initialize on open (or when switching to a different device). Reading
    // throttlePercent here only on open/switch — not continuously — so a live
    // update elsewhere doesn't yank the slider out from under an admin who's
    // mid-drag.
    useEffect(() => {
        if (!open || !deviceId) return;
        setThrottlePct(device.throttlePercent < 100 ? device.throttlePercent : 50);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, deviceId, load]);

    // Live updates: join this device's room and refetch when the server says
    // something actually changed.
    useEffect(() => {
        if (!open || !deviceId) return;
        const socket = connectSocket();
        if (!socket) return;

        socket.emit("device:join", deviceId);
        const onChange = () => load();
        socket.on("device:updated", onChange);
        socket.on("alert:new", onChange);
        socket.on("alert:updated", onChange);

        // Safety-net poll in case a socket event is ever missed/disconnected.
        const id = setInterval(load, 60000);
        return () => {
            socket.emit("device:leave", deviceId);
            socket.off("device:updated", onChange);
            socket.off("alert:new", onChange);
            socket.off("alert:updated", onChange);
            clearInterval(id);
        };
    }, [open, deviceId, load]);

    if (!device) return null;

    const setValve = async (state, pct) => {
        setBusy(true);
        try {
            const body = state === "throttled" ? { state, throttlePercent: pct } : { state };
            const data = await apiFetch(`/api/devices/${device._id}/valve`, { method: "PUT", body });
            onUpdated?.(data.device);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    const setBillingMode = async (billingMode) => {
        if (billingMode === device.billingMode) return;
        setBusy(true);
        try {
            const data = await apiFetch(`/api/devices/${device._id}`, { method: "PUT", body: { billingMode } });
            onUpdated?.(data.device);
        } catch {
            /* parent reload surfaces errors */
        } finally {
            setBusy(false);
        }
    };

    const postpaid = device.billingMode === "postpaid";
    // Supply can't be reopened while a leak is unresolved (backend enforces this too).
    const hasOpenLeak = alerts.some((a) => a.status === "active" || a.status === "acknowledged");
    const active = sub && sub.status === "active";
    const ratio = active ? Math.max(0, Math.min(1, sub.volumeRemaining / sub.volumeTotal)) : 0;
    const low = active && ratio < 0.1;

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <motion.div
                            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 8 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                            <div className="overflow-y-auto">
                                {/* Header */}
                                <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="relative shrink-0">
                                                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                    <FiCpu className="h-5 w-5" />
                                                </span>
                                                <span
                                                    className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                                                        device.status === "online" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                                                    }`}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{device.name || "Water Meter"}</h2>
                                                <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">{device.deviceId}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${valveStyles[device.effectiveValveState]}`}>
                                                {device.effectiveValveState}
                                                {device.effectiveValveState === "throttled" ? ` ${device.throttlePercent}%` : ""}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                aria-label="Close"
                                                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                            >
                                                <FiX className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5">
                                    {/* Live monitoring */}
                                    <div className="rounded-md border border-slate-100 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-900">
                                        <FlowChart deviceId={device._id} bare />
                                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                                            <UsageChart daily={usage?.daily} total={usage?.total} />
                                        </div>
                                    </div>

                                    {/* Facts */}
                                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        <FactTile icon={FiUser} label="Owner" value={device.owner?.name || "Unassigned"} muted={!device.owner} />
                                        <FactTile icon={FiCreditCard} label="Billing" value={device.billingMode} capitalize />
                                        <FactTile icon={FiMapPin} label="Location" value={device.location || "—"} />
                                        <FactTile icon={FiActivity} label="Status" value={device.status} capitalize />
                                        <FactTile icon={FiClock} label="Last seen" value={relativeTime(device.lastSeen)} />
                                        <FactTile icon={FiCalendar} label="Registered" value={device.createdAt ? new Date(device.createdAt).toLocaleDateString() : "—"} />
                                    </div>

                                    {/* Balance */}
                                    {postpaid ? (
                                        <Section icon={FiCreditCard} title="Billing">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-slate-500 dark:text-slate-400">Postpaid — billed monthly</span>
                                                <Link to="/dashboard/billing" className={pillLinkCls}>
                                                    Billing <FiArrowRight className="h-3.5 w-3.5" />
                                                </Link>
                                            </div>
                                        </Section>
                                    ) : (
                                        <Section icon={FiCreditCard} title="Prepaid balance">
                                            {active ? (
                                                <>
                                                    <div className="flex items-baseline justify-between">
                                                        <span className="text-xs text-slate-500 dark:text-slate-400">Remaining</span>
                                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                            {sub.volumeRemaining.toFixed(0)}{" "}
                                                            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">/ {sub.volumeTotal.toLocaleString()} L</span>
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/70">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${low ? "bg-linear-to-r from-amber-400 to-amber-500" : "bg-linear-to-r from-cyan-500 to-blue-600"}`}
                                                            style={{ width: `${ratio * 100}%` }}
                                                        />
                                                    </div>
                                                    {low && (
                                                        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                                            <FiAlertTriangle className="h-3 w-3 shrink-0" />
                                                            Balance running low
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">{sub ? `Plan ${sub.status}` : "No active plan"}</span>
                                                    <Link to="/dashboard/subscriptions" className={pillLinkCls}>
                                                        Manage <FiArrowRight className="h-3.5 w-3.5" />
                                                    </Link>
                                                </div>
                                            )}
                                        </Section>
                                    )}

                                    {/* Provider gate */}
                                    <Section
                                        icon={FiSliders}
                                        title="Provider gate"
                                        right={
                                            device.userValveState === "closed" && (
                                                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Customer tap off</span>
                                            )
                                        }
                                    >
                                        <div className="relative grid grid-cols-3 gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                                            {valveSegments.map(({ key, label, icon: Icon, active: activeCls }) => {
                                                const isActive = device.adminValveState === key;
                                                // While a leak is unresolved, only "Close" stays available.
                                                const locked = hasOpenLeak && key !== "closed";
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        disabled={busy || locked}
                                                        onClick={() => setValve(key, key === "throttled" ? throttlePct : undefined)}
                                                        className={`relative flex items-center justify-center gap-1.5 rounded-sm py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                                            isActive ? activeCls : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                                        }`}
                                                    >
                                                        {isActive && (
                                                            <motion.span
                                                                layoutId="valve-pill"
                                                                className="absolute inset-0 rounded-sm bg-white shadow-sm dark:bg-slate-900"
                                                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                                            />
                                                        )}
                                                        <Icon className="relative z-10 h-3.5 w-3.5" />
                                                        <span className="relative z-10">{label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {hasOpenLeak && (
                                            <p className="mt-2.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                                <FiAlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                Supply is locked while a leak is unresolved. Mark the alert as fixed to restore it.
                                            </p>
                                        )}
                                        {device.adminValveState === "throttled" && (
                                            <div className="mt-3 flex items-center gap-3">
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="99"
                                                    value={throttlePct}
                                                    disabled={busy}
                                                    onChange={(e) => setThrottlePct(Number(e.target.value))}
                                                    onMouseUp={(e) => setValve("throttled", Number(e.target.value))}
                                                    onTouchEnd={(e) => setValve("throttled", Number(e.target.value))}
                                                    onKeyUp={(e) => setValve("throttled", Number(e.target.value))}
                                                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-amber-500 dark:bg-slate-700"
                                                />
                                                <span className="w-9 text-right text-xs font-semibold text-amber-600 dark:text-amber-400">{throttlePct}%</span>
                                            </div>
                                        )}
                                    </Section>

                                    {/* Recent alerts */}
                                    {alerts.length > 0 && (
                                        <Section icon={FiAlertTriangle} title="Recent alerts">
                                            <ul className="space-y-1.5">
                                                {alerts.map((a) => {
                                                    const burst = a.type === "burst";
                                                    return (
                                                        <li
                                                            key={a._id}
                                                            className="flex items-center gap-2.5 rounded-md border border-slate-100 bg-white px-2.5 py-2 dark:border-slate-800/60 dark:bg-slate-900"
                                                        >
                                                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${alertChip[a.severity]}`}>
                                                                {burst ? <FiAlertOctagon className="h-3.5 w-3.5" /> : <FiAlertTriangle className="h-3.5 w-3.5" />}
                                                            </span>
                                                            <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{burst ? "Burst" : "Micro-leak"}</span>
                                                            <span className={`text-[11px] font-medium capitalize ${alertStatus[a.status]}`}>{a.status}</span>
                                                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{relativeTime(a.createdAt)}</span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </Section>
                                    )}

                                    {/* Manage: owner + billing */}
                                    <Section icon={FiUser} title="Manage">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                                    <FiUser className="h-3.5 w-3.5 shrink-0" />
                                                    {device.owner?.name ? (
                                                        <span className="truncate text-slate-700 dark:text-slate-300">{device.owner.name}</span>
                                                    ) : (
                                                        <span className="text-slate-400 dark:text-slate-500">Unassigned</span>
                                                    )}
                                                </span>
                                                <button type="button" onClick={() => setOwnerOpen(true)} className={pillLinkCls}>
                                                    {device.owner ? "Reassign" : "Assign"}
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-500 dark:text-slate-400">Billing</span>
                                                <div className="flex gap-1 rounded-sm bg-slate-100 p-0.5 dark:bg-slate-800/80">
                                                    {["prepaid", "postpaid"].map((m) => (
                                                        <button
                                                            key={m}
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => setBillingMode(m)}
                                                            className={`rounded-sm px-2 py-0.5 font-medium capitalize transition disabled:opacity-50 ${
                                                                device.billingMode === m
                                                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                                            }`}
                                                        >
                                                            {m}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </Section>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Nested owner modal (sibling so its clicks don't bubble to the detail overlay) */}
            <AssignOwnerModal
                open={ownerOpen}
                device={device}
                onClose={() => setOwnerOpen(false)}
                onAssigned={(updated) => onUpdated?.(updated)}
            />
        </>
    );
};

const FactTile = ({ icon: Icon, label, value, muted, capitalize }) => (
    <div className="min-w-0 rounded-md border border-slate-100 bg-white p-2.5 dark:border-slate-800/60 dark:bg-slate-900">
        <p className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
        </p>
        <p className={`mt-1 truncate text-xs font-semibold ${capitalize ? "capitalize " : ""}${muted ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
            {value}
        </p>
    </div>
);

export default ConnectionDetailModal;
