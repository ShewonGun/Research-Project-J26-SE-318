import { useEffect, useState } from "react";
import { FiActivity, FiCpu, FiDroplet, FiClock } from "react-icons/fi";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer } from "recharts";
import { apiFetch } from "../../lib/api.js";
import { useChartTheme } from "./chartTheme.js";

const duration = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const clock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

// Plain-language reasons, built from the facts the server computed around the alert.
const reasons = (type, f) => {
    const out = [];
    if (f.nonStopMinutesAtAlert >= 2) {
        out.push({
            Icon: FiClock,
            text:
                type === "burst"
                    ? `Water ran non-stop for ${duration(f.nonStopMinutesAtAlert)} (up to ${f.peakFlow.toFixed(1)} L/min), longer than any normal use.`
                    : `Water hadn't stopped for ${duration(f.nonStopMinutesAtAlert)} when the alert was raised. Taps, showers and toilets stop within minutes.`,
        });
    }
    if (type !== "burst" && f.minFlowLastHour != null && f.idleMinutesLastHour === 0) {
        out.push({ Icon: FiActivity, text: `In the hour before, the flow never dropped to zero (lowest ${f.minFlowLastHour.toFixed(2)} L/min).` });
    }
    if (f.litresSinceStart > 0) out.push({ Icon: FiDroplet, text: `About ${f.litresSinceStart.toFixed(0)} L flowed from the start of the alert.` });
    return out;
};

/* "Why was this alert raised?" — the flow around the alert (alert period shaded) and the reasons.
   Read-only; loads when opened (GET /api/alerts/:id/explain). */
const AlertExplanation = ({ alertId }) => {
    const t = useChartTheme();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        apiFetch(`/api/alerts/${alertId}/explain`)
            .then((d) => !cancelled && setData(d))
            .catch((e) => !cancelled && setError(e.message));
        return () => {
            cancelled = true;
        };
    }, [alertId]);

    const box = (body) => <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">{body}</div>;

    if (error) return box(<p className="text-xs text-slate-500">Couldn't load the explanation: {error}</p>);
    if (!data) return box(<p className="text-xs text-slate-400">Loading flow data…</p>);
    if (!data.facts) return box(<p className="text-xs text-slate-500">Flow data for this alert is no longer available.</p>);

    const burst = data.type === "burst";
    const shade = burst ? "#ef4444" : "#f59e0b";
    const start = new Date(data.window.start).getTime();
    const end = new Date(data.window.to).getTime();
    const f = data.facts;

    return box(
        <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Why this alert?</p>
                <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <FiCpu className="h-3 w-3" />
                    {data.source === "model" ? `AI model${f.confidence != null ? ` · ${f.confidence}% confident` : ""}` : "Rule: very high flow"}
                </span>
            </div>
            <ResponsiveContainer width="100%" height={120} className="mt-2">
                <AreaChart data={data.points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={clock}
                        tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} minTickGap={40} />
                    <YAxis width={28} domain={[0, (max) => Math.max(1, Math.ceil(max))]} allowDecimals={false} tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} />
                    <ReferenceArea x1={start} x2={Math.max(end, start + 60000)} fill={shade} fillOpacity={0.12} ifOverflow="extendDomain" />
                    <Tooltip labelFormatter={clock} formatter={(v) => [`${Number(v).toFixed(2)} L/min`, "Flow"]} {...t.tooltip} />
                    <Area type="stepAfter" dataKey="flow" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Flow per minute; the shaded part is the alert ({clock(start)} – {clock(end)}).
            </p>
            <ul className="mt-2 space-y-1.5">
                {reasons(data.type, f).map(({ Icon, text }) => (
                    <li key={text} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                        {text}
                    </li>
                ))}
            </ul>
        </>
    );
};

export default AlertExplanation;
