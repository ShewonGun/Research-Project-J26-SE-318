import { dayKey } from "../../lib/dayKey.js";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FiTrendingUp } from "react-icons/fi";
import { useChartTheme } from "./chartTheme.js";

// Running-total area of litres used across the last 7 days. Built from the same
// daily data Home already has, so no extra fetch.
const CumulativeChart = ({ daily }) => {
    const t = useChartTheme();

    const days = [];
    let running = 0;
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        running += daily?.find((x) => x.date === key)?.volume || 0;
        days.push({
            key,
            label: d.toLocaleDateString(undefined, { weekday: "short" }),
            cumulative: Number(running.toFixed(2)),
        });
    }
    const total = running;

    return (
        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <FiTrendingUp className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Cumulative (7 days)</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {total.toFixed(0)} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">L</span>
                </span>
            </div>

            <ResponsiveContainer width="100%" height={110} className="mt-3">
                <AreaChart data={days} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                    <defs>
                        <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} L`, "Total"]} {...t.tooltip} />
                    <Area type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={2} fill="url(#cumFill)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CumulativeChart;
