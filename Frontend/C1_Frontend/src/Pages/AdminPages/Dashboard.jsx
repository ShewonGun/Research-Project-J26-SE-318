import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
    FiWifi,
    FiAlertTriangle,
    FiCreditCard,
    FiDollarSign,
    FiArrowRight,
    FiArrowUpRight,
    FiArrowDownRight,
    FiAlertOctagon,
    FiCheckCircle,
    FiDroplet,
    FiClock,
} from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useChartTheme } from "../../Components/SharedComponents/chartTheme.js";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";
import Sparkline from "../../Components/SharedComponents/Sparkline.jsx";
import UsageChart from "../../Components/SharedComponents/UsageChart.jsx";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [data, setData] = useState({
        devices: [],
        alerts: [],
        subs: [],
        bills: [],
        usage: { daily: [], total: 0 },
    });

    const load = useCallback(async () => {
        const [devs, alerts, subs, bills, usage] = await Promise.all([
            apiFetch("/api/devices").catch(() => ({ devices: [] })),
            apiFetch("/api/alerts?limit=200").catch(() => ({ alerts: [] })),
            apiFetch("/api/subscriptions").catch(() => ({ subscriptions: [] })),
            apiFetch("/api/bills").catch(() => ({ bills: [] })),
            apiFetch("/api/readings/network-usage?days=7").catch(() => ({ daily: [], total: 0 })),
        ]);
        setData({
            devices: devs.devices || [],
            alerts: alerts.alerts || [],
            subs: subs.subscriptions || [],
            bills: bills.bills || [],
            usage,
        });
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [load]);

    const { devices, alerts, subs, bills, usage } = data;
    const online = devices.filter((d) => d.status === "online").length;
    const offline = devices.length - online;
    const activeLeaks = alerts.filter((a) => a.status === "active").length;
    const activePlans = subs.filter((s) => s.status === "active").length;
    const outstanding = bills
        .filter((b) => b.status === "unpaid" || b.status === "overdue")
        .reduce((sum, b) => sum + (b.amount || 0), 0);
    const collected = bills.filter((b) => b.status === "paid").reduce((sum, b) => sum + (b.amount || 0), 0);
    const recentAlerts = alerts.slice(0, 3);

    // Billing mix (postpaid is opt-in; everything else is prepaid).
    const postpaid = devices.filter((d) => d.billingMode === "postpaid").length;
    const prepaid = devices.length - postpaid;

    // Subscription health.
    const subBy = (s) => subs.filter((x) => x.status === s).length;

    // Sparkline + weekly % delta helpers, derived client-side from the same data.
    const bucket14 = (items, getDate, getVal = () => 1) => {
        const counts = {};
        items.forEach((it) => {
            const raw = getDate(it);
            if (!raw) return;
            const k = new Date(raw).toISOString().slice(0, 10);
            counts[k] = (counts[k] || 0) + getVal(it);
        });
        const arr = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            arr.push(counts[d.toISOString().slice(0, 10)] || 0);
        }
        return arr;
    };
    const toSeries = (arr) => arr.slice(7).map((v, i) => ({ i, v }));
    // % change of last 7 days vs the previous 7. null when there's no prior baseline.
    const pctDelta = (arr) => {
        const last = arr.slice(7).reduce((s, v) => s + v, 0);
        const prev = arr.slice(0, 7).reduce((s, v) => s + v, 0);
        if (prev === 0) return last === 0 ? 0 : null;
        return Math.round(((last - prev) / prev) * 100);
    };

    const leak14 = bucket14(alerts, (a) => a.createdAt);
    const plans14 = bucket14(subs, (s) => s.createdAt);
    const bills14 = bucket14(bills, (b) => b.createdAt, (b) => b.amount || 0);

    // Operational attention: active plans running low + overdue bills.
    const lowBalance = subs
        .filter((s) => s.status === "active" && s.volumeTotal > 0 && s.volumeRemaining / s.volumeTotal < 0.1)
        .sort((a, b) => a.volumeRemaining / a.volumeTotal - b.volumeRemaining / b.volumeTotal);
    const overdueBills = bills.filter((b) => b.status === "overdue");

    const connectionData = [
        { name: "Online", value: online, color: "#10b981" },
        { name: "Offline", value: offline, color: "#cbd5e1" },
    ];
    const billingData = [
        { name: "Prepaid", value: prepaid, color: "#0ea5e9" },
        { name: "Postpaid", value: postpaid, color: "#8b5cf6" },
    ];
    const subData = [
        { name: "Active", value: subBy("active"), color: "#10b981" },
        { name: "Exhausted", value: subBy("exhausted"), color: "#ef4444" },
        { name: "Expired", value: subBy("expired"), color: "#f59e0b" },
        { name: "Cancelled", value: subBy("cancelled"), color: "#cbd5e1" },
    ];

    return (
        <div>
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Welcome{user?.name ? `, ${user.name}` : ""}.</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Live overview of your water network.</p>

            {/* Stat tiles */}
            <StaggerGrid className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StaggerItem className="h-full">
                    <StatCard label="Online meters" value={`${online}/${devices.length}`} icon={FiWifi} tone="emerald" />
                </StaggerItem>
                <StaggerItem className="h-full">
                    <StatCard
                        label="Active leaks"
                        value={activeLeaks}
                        icon={FiAlertTriangle}
                        tone={activeLeaks > 0 ? "red" : "slate"}
                        to="/dashboard/alerts"
                        series={toSeries(leak14)}
                        pct={pctDelta(leak14)}
                        deltaInvert
                    />
                </StaggerItem>
                <StaggerItem className="h-full">
                    <StatCard
                        label="Active plans"
                        value={activePlans}
                        icon={FiCreditCard}
                        tone="sky"
                        to="/dashboard/subscriptions"
                        series={toSeries(plans14)}
                        pct={pctDelta(plans14)}
                    />
                </StaggerItem>
                <StaggerItem className="h-full">
                    <StatCard
                        label="Outstanding"
                        value={money(outstanding)}
                        icon={FiDollarSign}
                        tone="amber"
                        to="/dashboard/billing"
                        series={toSeries(bills14)}
                        pct={pctDelta(bills14)}
                        deltaInvert
                    />
                </StaggerItem>
            </StaggerGrid>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {/* Network consumption */}
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Network consumption</p>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {(usage.total || 0).toFixed(0)} L · 7 days
                        </span>
                    </div>
                    <UsageChart daily={usage.daily} total={usage.total} />
                </div>

                {/* Recent alerts */}
                <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Recent alerts</p>
                        <Link to="/dashboard/alerts" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                            View all <FiArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>

                    {recentAlerts.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                            <FiCheckCircle className="h-7 w-7 text-emerald-500" />
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No alerts — network is healthy.</p>
                        </div>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {recentAlerts.map((a) => {
                                const burst = a.type === "burst";
                                return (
                                    <li key={a._id} className="flex items-start gap-2.5">
                                        <span
                                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                                a.severity === "critical"
                                                    ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                                                    : "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                                            }`}
                                        >
                                            {burst ? <FiAlertOctagon className="h-3.5 w-3.5" /> : <FiAlertTriangle className="h-3.5 w-3.5" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                                {burst ? "Burst" : "Micro-leak"}
                                                <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">{a.device?.deviceId}</span>
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                                {a.status} · {relativeTime(a.createdAt)}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* Breakdown donuts */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <DonutCard title="Connections" data={connectionData} centerValue={devices.length} centerLabel="meters" />
                <DonutCard title="Billing mix" data={billingData} centerValue={devices.length} centerLabel="connections" />
                <DonutCard title="Subscriptions" data={subData} centerValue={subs.length} centerLabel="total" />
            </div>

            {/* Collections + attention */}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {/* Collections */}
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Collections</p>
                        <Link to="/dashboard/billing" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                            Billing <FiArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>

                    {collected + outstanding === 0 ? (
                        <p className="mt-6 rounded-md bg-slate-50 py-6 text-center text-xs text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                            No billing activity yet.
                        </p>
                    ) : (
                        <>
                            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                    className="h-full bg-emerald-500"
                                    style={{ width: `${(collected / (collected + outstanding)) * 100}%` }}
                                />
                                <div
                                    className="h-full bg-amber-500"
                                    style={{ width: `${(outstanding / (collected + outstanding)) * 100}%` }}
                                />
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Collected</span>
                                    </div>
                                    <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{money(collected)}</p>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Outstanding</span>
                                    </div>
                                    <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{money(outstanding)}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Needs attention */}
                <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Needs attention</p>

                    {lowBalance.length === 0 && overdueBills.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                            <FiCheckCircle className="h-7 w-7 text-emerald-500" />
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Nothing needs attention.</p>
                        </div>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {lowBalance.slice(0, 4).map((s) => (
                                <li key={s._id} className="flex items-center gap-2.5">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                                        <FiDroplet className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{s.device?.name || s.device?.deviceId || "—"}</p>
                                        <p className="text-xs text-amber-600 dark:text-amber-400">Low balance · {s.volumeRemaining.toFixed(0)} L left</p>
                                    </div>
                                </li>
                            ))}
                            {overdueBills.slice(0, 4).map((b) => (
                                <li key={b._id} className="flex items-center gap-2.5">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                                        <FiClock className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{b.device?.name || b.device?.deviceId || "—"}</p>
                                        <p className="text-xs text-red-600 dark:text-red-400">Overdue · {money(b.amount)}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const sparkColors = {
    sky: "#0ea5e9",
    emerald: "#10b981",
    violet: "#8b5cf6",
    amber: "#f59e0b",
    red: "#ef4444",
    slate: "#94a3b8",
};

const TrendChip = ({ pct, invert }) => {
    if (pct == null) return <span className="text-[11px] text-slate-400 dark:text-slate-500">vs last wk</span>;
    if (pct === 0) return <span className="text-[11px] text-slate-400 dark:text-slate-500">no change</span>;
    const up = pct > 0;
    const good = invert ? !up : up; // for leaks / outstanding (invert), less is better
    const color = good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
    const Arrow = up ? FiArrowUpRight : FiArrowDownRight;
    return (
        <span className={`flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
            <Arrow className="h-3 w-3" />
            {Math.abs(pct)}% vs last wk
        </span>
    );
};

const StatCard = ({ label, value, icon: Icon, tone, to, series, pct, deltaInvert }) => {
    const hasFooter = (series && series.length > 0) || pct !== undefined;
    const inner = (
        <>
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
            {hasFooter && (
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                    <div className="min-w-0">{pct !== undefined && <TrendChip pct={pct} invert={deltaInvert} />}</div>
                    {series && series.length > 0 && (
                        <div className="h-7 w-20 shrink-0">
                            <Sparkline data={series} color={sparkColors[tone] || sparkColors.sky} />
                        </div>
                    )}
                </div>
            )}
        </>
    );
    const cls = "flex h-full flex-col rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
    return to ? (
        <Link to={to} className={`${cls} transition hover:border-sky-300 dark:hover:border-sky-700`}>
            {inner}
        </Link>
    ) : (
        <div className={cls}>{inner}</div>
    );
};

// Donut with a centered total and a legend of labelled counts.
const DonutCard = ({ title, data, centerValue, centerLabel }) => {
    const t = useChartTheme();
    const nonEmpty = data.filter((d) => d.value > 0);
    const hasData = nonEmpty.length > 0;

    return (
        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>

            <div className="mt-3 flex items-center gap-4">
                <div className="relative h-28 w-28 shrink-0">
                    {hasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={nonEmpty}
                                    dataKey="value"
                                    innerRadius={38}
                                    outerRadius={54}
                                    paddingAngle={2}
                                    stroke="none"
                                >
                                    {nonEmpty.map((d) => (
                                        <Cell key={d.name} fill={d.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v, n) => [v, n]} {...t.tooltip} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-slate-100 dark:border-slate-800" />
                    )}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-semibold leading-none text-slate-900 dark:text-white">{centerValue}</span>
                        <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{centerLabel}</span>
                    </div>
                </div>

                <ul className="min-w-0 flex-1 space-y-1.5">
                    {data.map((d) => (
                        <li key={d.name} className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                            <span className="flex-1 truncate text-slate-500 dark:text-slate-400">{d.name}</span>
                            <span className="font-medium text-slate-900 dark:text-white">{d.value}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default Dashboard;
