import { dayKey } from "../../lib/dayKey.js";
import { useState } from "react";
import { Link } from "react-router-dom";
import { FiTrendingUp, FiCalendar, FiBarChart2, FiActivity, FiDroplet, FiDownload, FiLoader } from "react-icons/fi";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import { apiFetch } from "../../lib/api.js";
import { exportCsv, dateStamp, csvDateText } from "../../lib/exportCsv.js";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import FlowChart from "../../Components/SharedComponents/FlowChart.jsx";
import UsageTrend from "../../Components/SharedComponents/UsageTrend.jsx";
import CumulativeChart from "../../Components/SharedComponents/CumulativeChart.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";
import UsageForecast from "../../Components/UserComponents/UsageForecast.jsx";
import DailyConsumption from "../../Components/UserComponents/DailyConsumption.jsx";
import GoalCard from "../../Components/UserComponents/GoalCard.jsx";

const EXPORT_DAYS = 30;

const Usage = () => {
    const { device, sub, usage, loading } = useMyWater();
    const toast = useToast();
    const [exporting, setExporting] = useState(false);

    if (loading) return <WaterLoader center />;
    if (!device) return <NoDevice />;

    const daily = usage?.daily || [];
    const week = usage?.total || 0;
    const today = daily.find((d) => d.date === dayKey())?.volume || 0;
    const daysWithData = daily.length;
    const avgDaily = daysWithData ? week / daysWithData : 0;
    const peak = daily.reduce((m, d) => Math.max(m, d.volume), 0);

    const active = sub && sub.status === "active";
    const daysLeft = active && avgDaily > 0 ? sub.volumeRemaining / avgDaily : null;
    const runOut = daysLeft != null ? new Date(Date.now() + daysLeft * 86400000) : null;

    // Pulls a fresh 30-day window (independent of the 7-day summary this page
    // otherwise shows) and zero-fills every day, so the export always covers
    // the full last-30-days range rather than only the days with a reading.
    const exportUsage = async () => {
        setExporting(true);
        try {
            const res = await apiFetch(`/api/readings/usage?device=${device._id}&days=${EXPORT_DAYS}`);
            const usage30 = res.daily || [];
            const rows = [];
            for (let i = EXPORT_DAYS - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = dayKey(d);
                const volume = usage30.find((x) => x.date === key)?.volume || 0;
                rows.push({ date: csvDateText(key), litres: volume.toFixed(2) });
            }
            exportCsv(`usage-30-days-${dateStamp()}.csv`, rows);
            toast.success(`Exported ${rows.length} days of usage.`);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">Usage</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your water consumption and forecast.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        to="/app/usage/history"
                        className="flex items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <FiCalendar className="h-4 w-4" /> <span className="hidden sm:inline">Last 30 days</span>
                    </Link>
                    <button
                        type="button"
                        onClick={exportUsage}
                        disabled={exporting}
                        className="flex shrink-0 items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        {exporting ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiDownload className="h-4 w-4" />}{" "}
                        <span className="hidden sm:inline">Export CSV</span>
                    </button>
                </div>
            </div>

            {/* Stat tiles */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <Stat label="Today" value={`${today.toFixed(0)} L`} icon={FiCalendar} tone="sky" />
                <Stat label="This week" value={`${week.toFixed(0)} L`} icon={FiBarChart2} tone="emerald" />
                <Stat label="Daily average" value={`${avgDaily.toFixed(0)} L`} icon={FiActivity} tone="violet" />
                <Stat label="Peak day" value={`${peak.toFixed(0)} L`} icon={FiDroplet} tone="amber" />
            </div>

            {/* Live flow */}
            <div className="mt-3 sm:mt-4">
                <FlowChart deviceId={device._id} />
            </div>

            {/* Daily consumption + forecast */}
            <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
                <DailyConsumption daily={daily} />

                {/* Model forecast (7 days + run-out / bill estimate); the simple estimate below is the fallback. */}
                <UsageForecast
                    deviceId={device._id}
                    fallback={
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                            <FiTrendingUp className="h-4 w-4" />
                        </span>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Forecast</p>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                        {!active ? (
                            "Buy a plan to see how long your water balance will last."
                        ) : daysLeft == null ? (
                            "Not enough usage yet to forecast. Check back after a day of activity."
                        ) : (
                            <>
                                At your current rate of about{" "}
                                <span className="font-semibold text-slate-900 dark:text-white">{avgDaily.toFixed(1)} L/day</span>, your
                                balance of{" "}
                                <span className="font-semibold text-slate-900 dark:text-white">{sub.volumeRemaining.toFixed(0)} L</span>{" "}
                                will last about{" "}
                                <span className="font-semibold text-sky-600 dark:text-sky-400">
                                    {Math.floor(daysLeft)} more {Math.floor(daysLeft) === 1 ? "day" : "days"}
                                </span>
                                {runOut && ` — until around ${runOut.toLocaleDateString()}`}.
                            </>
                        )}
                    </p>
                </div>
                    }
                />
            </div>

            {/* Daily goal + tips */}
            <div className="mt-3 sm:mt-4">
                <GoalCard deviceId={device._id} />
            </div>

            {/* Trend + cumulative */}
            <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
                <UsageTrend deviceId={device._id} />
                <CumulativeChart daily={daily} />
            </div>
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
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

export default Usage;
