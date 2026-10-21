import { dayKey } from "../../lib/dayKey.js";
import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FiBarChart2 } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useChartTheme } from "./chartTheme.js";

// 30-day daily-usage bar chart. Fetches its own window so it stays independent
// of the 7-day summary the rest of Home uses.
const DAYS = 30;

const UsageTrend = ({ deviceId }) => {
    const t = useChartTheme();
    const [daily, setDaily] = useState([]);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/readings/usage?device=${deviceId}&days=${DAYS}`);
            setDaily(res.daily || []);
        } catch {
            setDaily([]);
        }
    }, [deviceId]);

    useEffect(() => {
        load();
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, [load]);

    // Fixed 30-day window so the axis is stable even with gaps.
    const bars = [];
    for (let i = DAYS - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        bars.push({
            key,
            label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
            volume: daily.find((x) => x.date === key)?.volume || 0,
        });
    }
    const total = bars.reduce((s, b) => s + b.volume, 0);
    const avg = total / DAYS;

    return (
        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                        <FiBarChart2 className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">30-day trend</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    avg <span className="font-medium text-slate-700 dark:text-slate-300">{avg.toFixed(1)} L</span>/day
                </span>
            </div>

            <ResponsiveContainer width="100%" height={96} className="mt-4">
                <BarChart data={bars} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={6} />
                    <Tooltip cursor={{ fill: t.grid }} formatter={(v) => [`${Number(v).toFixed(1)} L`, "Usage"]} {...t.tooltip} />
                    <Bar dataKey="volume" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
            <div className="mt-1 text-right text-[10px] text-slate-400 dark:text-slate-500">{total.toFixed(0)} L total</div>
        </div>
    );
};

export default UsageTrend;
