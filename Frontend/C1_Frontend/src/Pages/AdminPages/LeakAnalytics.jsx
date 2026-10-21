import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
    FiAlertOctagon,
    FiAlertTriangle,
    FiDroplet,
    FiShield,
    FiClock,
    FiZap,
    FiCheckCircle,
    FiDownload,
    FiFileText,
} from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { exportCsv, dateStamp } from "../../lib/exportCsv.js";
import { useToast } from "../../Context/ToastContext.jsx";
import { useChartTheme } from "../../Components/SharedComponents/chartTheme.js";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";
import Sparkline from "../../Components/SharedComponents/Sparkline.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";

// Reserved status colours: burst = critical, micro-leak = warning. Always shown
// alongside an icon + label so identity never rests on colour alone.
const BURST = "#ef4444";
const MICRO = "#f59e0b";
const RESOLVED = "#10b981";

const fmtL = (n) => `${Math.round(n || 0).toLocaleString()} L`;
const fmtDuration = (ms) => {
    if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
    const m = ms / 60000;
    if (m < 60) return `${Math.round(m)}m`;
    const h = m / 60;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
};
// Second-granular formatter for detection latency (onset → alert).
const fmtLatency = (ms) => {
    if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
    const s = ms / 1000;
    if (s < 1) return "<1s";
    if (s < 90) return `${Math.round(s)}s`;
    const m = s / 60;
    if (m < 60) return `${m.toFixed(1)}m`;
    return `${(m / 60).toFixed(1)}h`;
};
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

const LeakAnalytics = () => {
    const toast = useToast();
    const t = useChartTheme();
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (silent = false) => {
        try {
            const data = await apiFetch("/api/alerts?limit=500");
            setAlerts(data.alerts || []);
        } catch (e) {
            if (!silent) toast.error(e.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const id = setInterval(() => load(true), 15000);
        return () => clearInterval(id);
    }, [load]);

    if (loading) return <WaterLoader center />;

    // ── Aggregates ──────────────────────────────────────────────────────────
    const total = alerts.length;
    const burstCount = alerts.filter((a) => a.type === "burst").length;
    const microCount = total - burstCount;

    // Water prevented: for each burst that auto-closed the gate, the flow rate it
    // was gushing at × how long the supply then stayed shut (until fixed / now).
    const shutoffs = alerts.filter((a) => a.type === "burst" && a.autoAction === "valve-closed");
    const now = Date.now();
    const waterSaved = shutoffs.reduce((sum, a) => {
        const end = a.resolvedAt ? new Date(a.resolvedAt).getTime() : now;
        const minutes = Math.max(0, (end - new Date(a.createdAt).getTime()) / 60000);
        return sum + (a.flowRate || 0) * minutes;
    }, 0);

    // Resolution timing.
    const resolveDurations = alerts
        .filter((a) => a.status === "resolved" && a.resolvedAt)
        .map((a) => new Date(a.resolvedAt).getTime() - new Date(a.createdAt).getTime());
    const ackDurations = alerts
        .filter((a) => a.acknowledgedAt)
        .map((a) => new Date(a.acknowledgedAt).getTime() - new Date(a.createdAt).getTime());
    const avgResolve = mean(resolveDurations);
    const avgAck = mean(ackDurations);

    // Measured detection latency: onset (startedAt = first anomalous reading) → alert (createdAt).
    const latencyOf = (a) => {
        if (!a.startedAt) return null;
        const l = new Date(a.createdAt).getTime() - new Date(a.startedAt).getTime();
        return l >= 0 ? l : null;
    };
    const burstLat = alerts.filter((a) => a.type === "burst").map(latencyOf).filter((v) => v != null);
    const microLat = alerts.filter((a) => a.type !== "burst").map(latencyOf).filter((v) => v != null);
    const avgBurstLat = mean(burstLat);
    const avgMicroLat = mean(microLat);
    const avgLat = mean([...burstLat, ...microLat]);

    const statusCount = {
        active: alerts.filter((a) => a.status === "active").length,
        acknowledged: alerts.filter((a) => a.status === "acknowledged").length,
        resolved: alerts.filter((a) => a.status === "resolved").length,
    };

    // Detections over time (last 30 days), split by type.
    const byDay = {};
    alerts.forEach((a) => {
        const k = new Date(a.createdAt).toISOString().slice(0, 10);
        byDay[k] = byDay[k] || { burst: 0, micro: 0 };
        if (a.type === "burst") byDay[k].burst += 1;
        else byDay[k].micro += 1;
    });
    const series = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        series.push({
            label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            burst: byDay[k]?.burst || 0,
            micro: byDay[k]?.micro || 0,
        });
    }
    const hasSeries = series.some((s) => s.burst > 0 || s.micro > 0);

    // Total detections: 7-day sparkline + weekly % delta (fewer is better).
    const daily14 = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        daily14.push((byDay[k]?.burst || 0) + (byDay[k]?.micro || 0));
    }
    const sparkSeries = daily14.slice(7).map((v, i) => ({ i, v }));
    const last7 = daily14.slice(7).reduce((s, v) => s + v, 0);
    const prev7 = daily14.slice(0, 7).reduce((s, v) => s + v, 0);
    const weekPct = prev7 === 0 ? (last7 === 0 ? 0 : null) : Math.round(((last7 - prev7) / prev7) * 100);

    // Most-affected connections.
    const perDevice = {};
    alerts.forEach((a) => {
        const id = a.device?._id || a.device;
        if (!id) return;
        perDevice[id] = perDevice[id] || {
            name: a.device?.name || "—",
            deviceId: a.device?.deviceId || "",
            burst: 0,
            micro: 0,
        };
        if (a.type === "burst") perDevice[id].burst += 1;
        else perDevice[id].micro += 1;
    });
    const topDevices = Object.values(perDevice)
        .map((d) => ({ ...d, total: d.burst + d.micro }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    const maxDeviceTotal = topDevices[0]?.total || 1;

    const donut = [
        { name: "Burst", value: burstCount, color: BURST },
        { name: "Micro-leak", value: microCount, color: MICRO },
    ].filter((d) => d.value > 0);

    const exportLeakLog = () => {
        const rows = alerts.map((a) => ({
            connection: a.device?.name || "",
            device_id: a.device?.deviceId || "",
            type: a.type,
            severity: a.severity,
            flow_lpm: a.flowRate != null ? a.flowRate.toFixed(1) : "",
            onset_at: a.startedAt ? new Date(a.startedAt).toISOString() : "",
            detected_at: new Date(a.createdAt).toISOString(),
            detection_latency_s: a.startedAt
                ? Math.max(0, (new Date(a.createdAt) - new Date(a.startedAt)) / 1000).toFixed(1)
                : "",
            status: a.status,
            acknowledged_at: a.acknowledgedAt ? new Date(a.acknowledgedAt).toISOString() : "",
            resolved_at: a.resolvedAt ? new Date(a.resolvedAt).toISOString() : "",
            auto_action: a.autoAction || "",
        }));
        if (exportCsv(`leak-log-${dateStamp()}.csv`, rows)) toast.success(`Exported ${rows.length} detections.`);
    };

    // One-click printable report — opens a clean print view; the browser's
    // "Save as PDF" turns it into a PDF. No dependencies.
    const printReport = () => {
        const w = window.open("", "_blank", "width=820,height=1040");
        if (!w) {
            toast.error("Allow pop-ups to download the report.");
            return;
        }
        const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
        const metric = (label, value) => `<div class="m"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
        const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
        const rows = topDevices
            .map(
                (d) =>
                    `<tr><td>${esc(d.name)} <span class="muted">${esc(d.deviceId)}</span></td><td>${d.burst}</td><td>${d.micro}</td><td>${d.total}</td></tr>`
            )
            .join("");

        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>AquaFlow — Leak Analytics</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 32px; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #64748b; font-size: 13px; margin-top: 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 26px 0 10px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .m { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
  .m .v { font-size: 20px; font-weight: 600; }
  .m .l { font-size: 11px; color: #64748b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #eef2f7; }
  th { color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  td:not(:first-child), th:not(:first-child) { text-align: right; width: 70px; }
  .muted { color: #94a3b8; font-family: ui-monospace, monospace; font-size: 11px; }
  .foot { margin-top: 22px; font-size: 11px; color: #94a3b8; line-height: 1.5; }
  .brand { color: #0284c7; font-weight: 700; }
</style></head><body>
  <h1><span class="brand">AquaFlow</span> — Leak Analytics Report</h1>
  <div class="sub">Generated ${esc(new Date().toLocaleString())}</div>

  <h2>Overview</h2>
  <div class="grid">
    ${metric("Total detections", total)}
    ${metric("Water prevented (est.)", fmtL(waterSaved))}
    ${metric("Auto-shutoffs", shutoffs.length)}
    ${metric("Avg. time to fix", fmtDuration(avgResolve))}
  </div>

  <h2>Detection</h2>
  <div class="grid">
    ${metric("Burst", `${burstCount} (${pct(burstCount)}%)`)}
    ${metric("Micro-leak", `${microCount} (${pct(microCount)}%)`)}
    ${metric("Avg. latency", avgLat != null ? fmtLatency(avgLat) : "—")}
    ${metric("Burst / Micro latency", `${avgBurstLat != null ? fmtLatency(avgBurstLat) : "—"} / ${avgMicroLat != null ? fmtLatency(avgMicroLat) : "—"}`)}
  </div>

  <h2>Resolution</h2>
  <div class="grid">
    ${metric("Active", statusCount.active)}
    ${metric("Acknowledged", statusCount.acknowledged)}
    ${metric("Resolved", statusCount.resolved)}
    ${metric("Avg. time to acknowledge", fmtDuration(avgAck))}
  </div>

  <h2>Most-affected connections</h2>
  <table><thead><tr><th>Connection</th><th>Burst</th><th>Micro</th><th>Total</th></tr></thead><tbody>${rows || '<tr><td class="muted">No data</td><td></td><td></td><td></td></tr>'}</tbody></table>

  <div class="foot">
    Detection latency is measured from anomaly onset (first anomalous reading) to alert. Water prevented is an estimate:
    each auto-shut burst's flow rate × how long the supply stayed closed until the leak was marked fixed.
  </div>
</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => {
            try {
                w.print();
            } catch {
                /* user can print manually */
            }
        }, 300);
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Leak Analytics</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        How the detector is performing across the network.
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={exportLeakLog}
                        disabled={total === 0}
                        className="flex items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <FiDownload className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
                    </button>
                    <button
                        type="button"
                        onClick={printReport}
                        disabled={total === 0}
                        className="flex items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <FiFileText className="h-4 w-4" /> <span className="hidden sm:inline">Report (PDF)</span>
                    </button>
                </div>
            </div>

            {total === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
                    <FiShield className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">No detections yet</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">The network is running clean.</p>
                </div>
            ) : (
                <>
                    {/* Headline stats */}
                    <StaggerGrid className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StaggerItem className="h-full">
                            <Stat
                                label="Total detections"
                                value={total}
                                icon={FiAlertTriangle}
                                tone="sky"
                                series={sparkSeries}
                                pct={weekPct}
                                pctInvert
                            />
                        </StaggerItem>
                        <StaggerItem className="h-full">
                            <Stat label="Water prevented (est.)" value={fmtL(waterSaved)} icon={FiDroplet} tone="emerald" />
                        </StaggerItem>
                        <StaggerItem className="h-full">
                            <Stat label="Auto-shutoffs" value={shutoffs.length} icon={FiZap} tone="red" />
                        </StaggerItem>
                        <StaggerItem className="h-full">
                            <Stat label="Avg. time to fix" value={fmtDuration(avgResolve)} icon={FiClock} tone="violet" />
                        </StaggerItem>
                    </StaggerGrid>

                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                        {/* Detections over time */}
                        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Detections over time</p>
                                <div className="flex items-center gap-3 text-[11px]">
                                    <LegendDot color={BURST} label="Burst" />
                                    <LegendDot color={MICRO} label="Micro-leak" />
                                </div>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Last 30 days</p>

                            {hasSeries ? (
                                <ResponsiveContainer width="100%" height={200} className="mt-3">
                                    <AreaChart data={series} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="laBurst" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={BURST} stopOpacity={0.3} />
                                                <stop offset="100%" stopColor={BURST} stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="laMicro" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={MICRO} stopOpacity={0.3} />
                                                <stop offset="100%" stopColor={MICRO} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={6} />
                                        <YAxis hide allowDecimals={false} domain={[0, "auto"]} />
                                        <Tooltip {...t.tooltip} />
                                        <Area type="monotone" dataKey="micro" name="Micro-leak" stackId="1" stroke={MICRO} strokeWidth={2} fill="url(#laMicro)" />
                                        <Area type="monotone" dataKey="burst" name="Burst" stackId="1" stroke={BURST} strokeWidth={2} fill="url(#laBurst)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="mt-8 mb-6 text-center text-xs text-slate-400 dark:text-slate-500">
                                    No detections in the last 30 days.
                                </p>
                            )}
                        </div>

                        {/* Burst vs micro split */}
                        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">By type</p>
                            <div className="mt-3 flex items-center gap-4">
                                <div className="relative h-28 w-28 shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={donut} dataKey="value" innerRadius={38} outerRadius={54} paddingAngle={2} stroke="none">
                                                {donut.map((d) => (
                                                    <Cell key={d.name} fill={d.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip {...t.tooltip} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-lg font-semibold leading-none text-slate-900 dark:text-white">{total}</span>
                                        <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">total</span>
                                    </div>
                                </div>
                                <ul className="min-w-0 flex-1 space-y-2">
                                    <TypeRow icon={FiAlertOctagon} color={BURST} label="Burst" value={burstCount} total={total} />
                                    <TypeRow icon={FiAlertTriangle} color={MICRO} label="Micro-leak" value={microCount} total={total} />
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                        {/* Most-affected connections */}
                        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Most-affected connections</p>
                            {topDevices.length === 0 ? (
                                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">No connection data.</p>
                            ) : (
                                <ul className="mt-4 space-y-3.5">
                                    {topDevices.map((d) => (
                                        <li key={d.deviceId || d.name}>
                                            <div className="flex items-center justify-between gap-2 text-sm">
                                                <span className="min-w-0 truncate font-medium text-slate-700 dark:text-slate-300">
                                                    {d.name}
                                                    <span className="ml-1.5 font-mono text-xs text-slate-400 dark:text-slate-500">{d.deviceId}</span>
                                                </span>
                                                <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{d.total}</span>
                                            </div>
                                            <div className="mt-1.5 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ width: `${(d.total / maxDeviceTotal) * 100}%` }}>
                                                {d.burst > 0 && <div className="h-full" style={{ width: `${(d.burst / d.total) * 100}%`, background: BURST }} />}
                                                {d.micro > 0 && <div className="h-full" style={{ width: `${(d.micro / d.total) * 100}%`, background: MICRO }} />}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Resolution + detection latency */}
                        <div className="flex flex-col gap-3">
                            {/* Resolution */}
                            <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Resolution</p>
                                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    {statusCount.active > 0 && <div className="h-full" style={{ width: `${(statusCount.active / total) * 100}%`, background: BURST }} />}
                                    {statusCount.acknowledged > 0 && <div className="h-full" style={{ width: `${(statusCount.acknowledged / total) * 100}%`, background: MICRO }} />}
                                    {statusCount.resolved > 0 && <div className="h-full" style={{ width: `${(statusCount.resolved / total) * 100}%`, background: RESOLVED }} />}
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                    <StatusPill label="Active" value={statusCount.active} color={BURST} />
                                    <StatusPill label="Seen" value={statusCount.acknowledged} color={MICRO} />
                                    <StatusPill label="Fixed" value={statusCount.resolved} color={RESOLVED} />
                                </div>
                                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 dark:text-slate-400">Avg. time to acknowledge</span>
                                        <span className="font-medium text-slate-900 dark:text-white">{fmtDuration(avgAck)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 dark:text-slate-400">Avg. time to fix</span>
                                        <span className="font-medium text-slate-900 dark:text-white">{fmtDuration(avgResolve)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Detection latency — measured onset → alert */}
                            <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Detection latency</p>
                                {avgLat != null ? (
                                    <>
                                        <div className="mt-3 flex items-baseline gap-1.5">
                                            <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{fmtLatency(avgLat)}</span>
                                            <span className="text-xs text-slate-400 dark:text-slate-500">avg. onset → alert</span>
                                        </div>
                                        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                                    <span className="h-2 w-2 rounded-full" style={{ background: BURST }} /> Burst
                                                </span>
                                                <span className="font-medium text-slate-900 dark:text-white">{avgBurstLat != null ? fmtLatency(avgBurstLat) : "—"}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                                    <span className="h-2 w-2 rounded-full" style={{ background: MICRO }} /> Micro-leak
                                                </span>
                                                <span className="font-medium text-slate-900 dark:text-white">{avgMicroLat != null ? fmtLatency(avgMicroLat) : "—"}</span>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                                            Measured from anomaly onset (first anomalous reading) to alert. Bursts trip near-instantly; micro-leaks confirm after a sustained trickle.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="mt-3 space-y-2 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                                    <span className="h-2 w-2 rounded-full" style={{ background: BURST }} /> Burst
                                                </span>
                                                <span className="font-medium text-slate-900 dark:text-white">Real-time</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                                    <span className="h-2 w-2 rounded-full" style={{ background: MICRO }} /> Micro-leak
                                                </span>
                                                <span className="font-medium text-slate-900 dark:text-white">~60s window</span>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                                            No latency samples yet — bursts trip on the first reading above {30} L/min; micro-leaks confirm after a sustained ~60s trickle.
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                        <FiCheckCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        Water prevented is an estimate: each auto-shut burst's flow rate × how long the supply stayed closed until the leak was marked fixed.
                    </p>
                </>
            )}
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
};
const sparkColors = { sky: "#0ea5e9", emerald: "#10b981", violet: "#8b5cf6", red: "#ef4444" };

const Stat = ({ label, value, icon: Icon, tone, series, pct, pctInvert }) => {
    const hasFooter = (series && series.length > 0) || pct !== undefined;
    return (
        <div className="flex h-full flex-col rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
            {hasFooter && (
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                    <div className="min-w-0">{pct !== undefined && <PctChip pct={pct} invert={pctInvert} />}</div>
                    {series && series.length > 0 && (
                        <div className="h-7 w-20 shrink-0">
                            <Sparkline data={series} color={sparkColors[tone] || sparkColors.sky} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const PctChip = ({ pct, invert }) => {
    if (pct == null) return <span className="text-[11px] text-slate-400 dark:text-slate-500">vs last wk</span>;
    if (pct === 0) return <span className="text-[11px] text-slate-400 dark:text-slate-500">no change</span>;
    const up = pct > 0;
    const good = invert ? !up : up;
    const color = good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
    return (
        <span className={`text-[11px] font-medium ${color}`}>
            {up ? "▲" : "▼"} {Math.abs(pct)}% vs last wk
        </span>
    );
};

const LegendDot = ({ color, label }) => (
    <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
    </span>
);

const TypeRow = ({ icon: Icon, color, label, value, total }) => (
    <li className="flex items-center gap-2 text-xs">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${color}1a`, color }}>
            <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 truncate text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-medium text-slate-900 dark:text-white">{value}</span>
        <span className="w-9 text-right text-slate-400 dark:text-slate-500">{total ? Math.round((value / total) * 100) : 0}%</span>
    </li>
);

const StatusPill = ({ label, value, color }) => (
    <div className="rounded-md bg-slate-50 py-2 dark:bg-slate-800/50">
        <p className="text-lg font-semibold leading-none" style={{ color }}>{value}</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
);

export default LeakAnalytics;
