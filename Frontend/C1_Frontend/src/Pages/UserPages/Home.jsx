import { dayKey } from "../../lib/dayKey.js";
import { useState } from "react";
import { Link } from "react-router-dom";
import { FiDroplet, FiArrowRight, FiAlertTriangle, FiFileText, FiLoader } from "react-icons/fi";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import UsageChart from "../../Components/SharedComponents/UsageChart.jsx";
import FlowChart from "../../Components/SharedComponents/FlowChart.jsx";
import UsageTrend from "../../Components/SharedComponents/UsageTrend.jsx";
import CumulativeChart from "../../Components/SharedComponents/CumulativeChart.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";
import WaterPulse from "../../Components/UserComponents/WaterPulse.jsx";
import BalanceDrop from "../../Components/UserComponents/BalanceDrop.jsx";
import LeakCard from "../../Components/UserComponents/LeakCard.jsx";
import SupplyBanner from "../../Components/UserComponents/SupplyBanner.jsx";
import { supplyStatus } from "../../lib/supplyStatus.js";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";

const statusStyles = {
    open: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    throttled: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    closed: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
};
const statusText = { open: "Water on", throttled: "Restricted", closed: "Shut off" };
const supplyChip = {
    open: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    throttled: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    closed: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
};

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Home = () => {
    const { device, mode, sub, bill, estimate, bills, usage, alerts, loading, setValve, acknowledgeAlert } = useMyWater();
    const toast = useToast();
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [dismissing, setDismissing] = useState(() => new Set());

    if (loading) return <WaterLoader center />;
    if (!device) return <NoDevice />;

    const toggleValve = async () => {
        try {
            await setValve(device.userValveState === "closed" ? "open" : "closed");
        } catch (e) {
            toast.error(e.message);
        }
    };

    const dismissAlert = async (id) => {
        setDismissing((s) => new Set(s).add(id));
        try {
            await acknowledgeAlert(id);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setDismissing((s) => { const n = new Set(s); n.delete(id); return n; });
        }
    };

    const postpaid = mode === "postpaid";
    const active = sub && sub.status === "active";
    const ratio = active ? Math.max(0, Math.min(1, sub.volumeRemaining / sub.volumeTotal)) : 0;
    const low = active && ratio < 0.1;
    const overdue = postpaid && (bills || []).some((b) => b.status === "overdue");
    const activeAlerts = (alerts || []).filter((a) => a.status === "active");
    const supply = supplyStatus({ device, mode, sub, bills: bills || [], alerts: alerts || [] });
    // The banner already explains these two, so their notices below aren't repeated.
    const showLow = low && !supply.covers.includes("low");
    const showOverdue = overdue && !supply.covers.includes("overdue");
    const shownAlerts = supply.covers.includes("alerts") ? [] : activeAlerts;
    const today = usage?.daily?.find((d) => d.date === dayKey())?.volume || 0;
    const week = usage?.total || 0;

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                        Hi{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.
                    </h1>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="truncate">{device.name || "My Water Meter"}</span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {mode}
                        </span>
                    </p>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${statusStyles[device.effectiveValveState]}`}>
                    {statusText[device.effectiveValveState]}
                </span>
            </div>

            <SupplyBanner
                status={supply}
                device={device}
                onToggle={toggleValve}
                onDismiss={dismissAlert}
                dismissing={!!supply.dismissId && dismissing.has(supply.dismissId)}
            />

            {(showLow || showOverdue || shownAlerts.length > 0) && (
                <StaggerGrid className="mt-5 space-y-3">
                    {showLow && (
                        <StaggerItem className="flex items-start gap-2 rounded-md bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Your balance is low, so your water flow is being restricted. Top up to restore full flow.</span>
                        </StaggerItem>
                    )}

                    {showOverdue && (
                        <StaggerItem className="flex items-start gap-2 rounded-md bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
                            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                You have an overdue bill, so your water flow is being restricted.{" "}
                                <Link to="/app/billing" className="font-medium underline">Pay now</Link> to restore full flow.
                            </span>
                        </StaggerItem>
                    )}

                    {/* Leak / burst alerts */}
                    {shownAlerts.map((a) => (
                        <StaggerItem
                            key={a._id}
                            className={`flex items-start gap-2 rounded-md px-3.5 py-2.5 text-sm ${
                                a.severity === "critical"
                                    ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            }`}
                        >
                            <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold">{a.type === "burst" ? "Burst detected" : "Possible micro-leak"}</p>
                                <p className="mt-0.5">{a.message}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => dismissAlert(a._id)}
                                disabled={dismissing.has(a._id)}
                                className="flex shrink-0 items-center gap-1 text-xs font-medium underline hover:no-underline disabled:opacity-50"
                            >
                                {dismissing.has(a._id) && <FiLoader className="h-3 w-3 animate-spin" />}
                                Dismiss
                            </button>
                        </StaggerItem>
                    ))}
                </StaggerGrid>
            )}

            {/* Grid */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
                {/* Balance (prepaid) / current bill (postpaid) */}
                <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                            {postpaid ? <FiFileText className="h-4 w-4" /> : <FiDroplet className="h-4 w-4" />}
                        </span>
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {postpaid ? "This month's bill" : "Water balance"}
                        </span>
                    </div>
                    {postpaid ? (
                        <>
                            <div className="mt-4 flex items-baseline gap-1.5">
                                <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                                    {money(estimate?.amount)}
                                </span>
                                <span className="text-sm text-slate-400 dark:text-slate-500">so far</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                {(bill?.volumeUsed || 0).toFixed(0)} L used this cycle ({estimate?.units ?? 0} units) · estimated at the current tariff.
                            </p>
                            <Link
                                to="/app/billing"
                                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                            >
                                View billing <FiArrowRight className="h-4 w-4" />
                            </Link>
                        </>
                    ) : active ? (
                        <BalanceDrop
                            remaining={sub.volumeRemaining}
                            total={sub.volumeTotal}
                            ratio={ratio}
                            low={low}
                            expiresAt={sub.expiresAt}
                        />
                    ) : (
                        <div className="mt-4">
                            <p className="text-sm text-slate-500 dark:text-slate-400">No active plan.</p>
                            <Link
                                to="/app/plans"
                                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                            >
                                Browse plans
                            </Link>
                        </div>
                    )}
                </div>

                {/* Water control — water flow orb */}
                <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${supplyChip[device.effectiveValveState]}`}>
                            <FiDroplet className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Water supply</span>
                    </div>
                    <div className="flex flex-1 items-center justify-center py-2">
                        <WaterPulse
                            device={device}
                            onToggle={toggleValve}
                        />
                    </div>
                </div>

                {/* Leak detection */}
                <LeakCard />

                {/* Usage summary */}
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:col-span-3">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-8">
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Today</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{today.toFixed(0)} L</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">This week</p>
                                <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{week.toFixed(0)} L</p>
                            </div>
                        </div>
                        <Link
                            to="/app/usage"
                            className="flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                        >
                            Details <FiArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <UsageChart daily={usage?.daily} total={usage?.total} />
                </div>
            </div>

            {/* More charts */}
            <div className="mt-3 sm:mt-4">
                <FlowChart deviceId={device._id} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-2">
                <UsageTrend deviceId={device._id} />
                <CumulativeChart daily={usage?.daily} />
            </div>
        </div>
    );
};

export default Home;
