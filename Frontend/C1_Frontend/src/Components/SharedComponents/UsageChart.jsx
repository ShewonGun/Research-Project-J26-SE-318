import { dayKey } from "../../lib/dayKey.js";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useChartTheme } from "./chartTheme.js";

/* Compact single-series 7-day usage bar chart (reused by admin + consumer). */
const UsageChart = ({ daily, total }) => {
    const t = useChartTheme();

    // Build a fixed 7-day window so the axis is stable even with gaps.
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        days.push({
            key,
            label: d.toLocaleDateString(undefined, { weekday: "short" }),
            volume: daily?.find((x) => x.date === key)?.volume || 0,
        });
    }
    const hasData = days.some((d) => d.volume > 0);

    return (
        <div className="mt-3">
            <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">Last 7 days</span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{(total || 0).toFixed(1)} L</span>
            </div>

            {hasData ? (
                <ResponsiveContainer width="100%" height={80} className="mt-2">
                    <BarChart data={days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={0} />
                        <Tooltip
                            cursor={{ fill: t.grid }}
                            formatter={(v) => [`${Number(v).toFixed(2)} L`, "Usage"]}
                            {...t.tooltip}
                        />
                        <Bar dataKey="volume" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={30} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <p className="mt-3 rounded-md bg-slate-50 py-4 text-center text-xs text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                    No usage recorded in the last 7 days.
                </p>
            )}
        </div>
    );
};

export default UsageChart;
