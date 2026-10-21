import { dayKey } from "../../lib/dayKey.js";
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiBarChart2, FiActivity, FiDroplet, FiDownload, FiTrendingUp } from "react-icons/fi";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import { apiFetch } from "../../lib/api.js";
import { exportCsv, dateStamp, csvDateText } from "../../lib/exportCsv.js";
import { useChartTheme } from "../../Components/SharedComponents/chartTheme.js";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import StatTile from "../../Components/SharedComponents/StatTile.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";

const DAYS = 30;

// Full 30-day usage breakdown — chart + day-by-day table. Fetches its own
// window independently of MyWaterContext (which only carries the 7-day
// summary used by Home/Usage).
const UsageHistory = () => {
    const { device, loading: deviceLoading } = useMyWater();
    const toast = useToast();
    const t = useChartTheme();
    const [daily, setDaily] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!device) return;
        try {
            const res = await apiFetch(`/api/readings/usage?device=${device._id}&days=${DAYS}`);
            setDaily(res.daily || []);
        } catch {
            setDaily([]);
        } finally {
            setLoading(false);
        }
    }, [device]);

    useEffect(() => {
        load();
        const id = setInterval(load, 60000);
        return () => clearInterval(id);
    }, [load]);

    if (deviceLoading || (loading && device)) return <WaterLoader center />;
    if (!device) return <NoDevice />;

    // Fixed 30-day window so the chart/table stay stable even with gaps.
    const days = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        days.push({
            key,
            label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            fullLabel: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
            volume: daily.find((x) => x.date === key)?.volume || 0,
        });
    }

    const total = days.reduce((sum, d) => sum + d.volume, 0);
    const activeDays = days.filter((d) => d.volume > 0);
    const avgDaily = total / DAYS;
    const peak = days.reduce((m, d) => (d.volume > m.volume ? d : m), days[0]);

    const exportHistory = () => {
        const rows = days.map((d) => ({ date: csvDateText(d.key), litres: d.volume.toFixed(2) }));
        if (exportCsv(`usage-30-days-${dateStamp()}.csv`, rows)) toast.success(`Exported ${rows.length} days of usage.`);
        else toast.info("No usage to export yet.");
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <Link
                        to="/app/usage"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                        <FiArrowLeft className="h-4 w-4" /> Usage
                    </Link>
                    <h1 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">Last 30 days</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Full daily breakdown of your water consumption.</p>
                </div>
                <button
                    type="button"
                    onClick={exportHistory}
                    disabled={activeDays.length === 0}
                    className="flex shrink-0 items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    <FiDownload className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
                </button>
            </div>

            {/* Stat tiles */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatTile label="Total (30d)" value={`${total.toFixed(0)} L`} icon={FiDroplet} tone="sky" />
                <StatTile label="Daily average" value={`${avgDaily.toFixed(0)} L`} icon={FiActivity} tone="violet" />
                <StatTile label="Peak day" value={`${peak.volume.toFixed(0)} L`} icon={FiTrendingUp} tone="red" />
                <StatTile label="Days with usage" value={`${activeDays.length} / ${DAYS}`} icon={FiCalendar} tone="emerald" />
            </div>

            {/* Chart */}
            <div className="mt-3 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:mt-4">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiBarChart2 className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Daily consumption</p>
                </div>

                {activeDays.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260} className="mt-3">
                        <BarChart data={days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke={t.grid} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={2} />
                            <YAxis tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} width={32} />
                            <Tooltip
                                cursor={{ fill: t.grid }}
                                formatter={(v) => [`${Number(v).toFixed(2)} L`, "Usage"]}
                                labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""}
                                {...t.tooltip}
                            />
                            <Bar dataKey="volume" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={18} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="mt-4 rounded-md bg-slate-50 py-6 text-center text-xs text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                        No usage recorded in the last 30 days.
                    </p>
                )}
            </div>

            {/* Day-by-day table */}
            <div className="mt-3 overflow-hidden rounded-sm border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:mt-4">
                <div className="border-b border-slate-200 p-5 pb-3 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Day by day</p>
                </div>
                <div className="max-h-105 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900">
                            <tr className="text-left text-xs text-slate-400 dark:text-slate-500">
                                <th className="px-5 py-2 font-medium">Date</th>
                                <th className="px-5 py-2 text-right font-medium">Usage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...days].reverse().map((d) => (
                                <tr key={d.key} className="border-t border-slate-100 dark:border-slate-800/60">
                                    <td className="px-5 py-2 text-slate-600 dark:text-slate-300">{d.fullLabel}</td>
                                    <td className="px-5 py-2 text-right font-medium text-slate-900 dark:text-white">
                                        {d.volume > 0 ? `${d.volume.toFixed(1)} L` : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UsageHistory;
