import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, LabelList, ResponsiveContainer } from "recharts";
import { FiBarChart2 } from "react-icons/fi";
import { dayKey } from "../../lib/dayKey.js";
import { useChartTheme } from "../SharedComponents/chartTheme.js";

const litres = (n) => `${Math.round(n || 0).toLocaleString()} L`;

/* Usage page: the last 7 days of consumption — values on the bars, the daily average as a line,
   today's bar marked as "so far", and a short summary underneath. Fills the height of its row. */
const DailyConsumption = ({ daily }) => {
    const t = useChartTheme();
    const todayKey = dayKey();

    // Fixed 7-day window so the axis is stable even with gaps.
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        days.push({
            key,
            label: key === todayKey ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }),
            volume: daily?.find((x) => x.date === key)?.volume || 0,
            today: key === todayKey,
        });
    }
    const total = days.reduce((s, d) => s + d.volume, 0);
    const complete = days.filter((d) => !d.today && d.volume > 0); // today is still running
    const average = complete.length ? complete.reduce((s, d) => s + d.volume, 0) / complete.length : 0;
    const peak = days.reduce((m, d) => (d.volume > m.volume ? d : m), days[0]);
    const hasData = total > 0;

    return (
        <div className="flex h-full flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                    <FiBarChart2 className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Daily consumption</p>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">Last 7 days</span>
            </div>

            {hasData ? (
                <>
                    <div className="mt-3 min-h-[170px] flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={days} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: t.tick }} tickLine={false} axisLine={false} interval={0} />
                                <YAxis hide domain={[0, (max) => Math.max(1, max * 1.15)]} />
                                <Tooltip
                                    cursor={{ fill: t.grid }}
                                    formatter={(v, _n, p) => [litres(v), p.payload.today ? "Today so far" : "Used"]}
                                    {...t.tooltip}
                                />
                                {average > 0 && (
                                    <ReferenceLine y={average} stroke={t.tick} strokeDasharray="4 3" ifOverflow="extendDomain" />
                                )}
                                <Bar dataKey="volume" radius={[3, 3, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                                    {days.map((d) => (
                                        <Cell key={d.key} fill="#0ea5e9" fillOpacity={d.today ? 0.45 : 1} />
                                    ))}
                                    <LabelList dataKey="volume" position="top" formatter={(v) => (v > 0 ? Math.round(v) : "")} style={{ fontSize: 10, fill: t.tick }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Dashed line: your daily average. Today's bar is lighter: the day isn't over yet.</p>

                    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">7-day total</dt>
                            <dd className="mt-0.5 text-base font-semibold text-slate-900 dark:text-white">{litres(total)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">Daily average</dt>
                            <dd className="mt-0.5 text-base font-semibold text-slate-900 dark:text-white">{average > 0 ? litres(average) : "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-500 dark:text-slate-400">Highest day</dt>
                            <dd className="mt-0.5 text-base font-semibold text-slate-900 dark:text-white">
                                {litres(peak.volume)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{peak.label}</span>
                            </dd>
                        </div>
                    </dl>
                </>
            ) : (
                <p className="mt-4 flex flex-1 items-center justify-center rounded-md bg-slate-50 py-10 text-center text-sm text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                    No usage recorded in the last 7 days.
                </p>
            )}
        </div>
    );
};

export default DailyConsumption;
