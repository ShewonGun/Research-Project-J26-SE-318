import { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FiActivity } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { connectSocket } from "../../lib/socket.js";
import { useChartTheme } from "./chartTheme.js";

const MAX_SAMPLES = 60;

// Selectable time range. "live" streams the newest readings; the others show history from
// GET /api/readings/series, averaged into fixed bins (1 min / 5 min / 15 min / 1 h).
const RANGES = [
    { key: "live", label: "Live" },
    { key: "1h", label: "1h" },
    { key: "6h", label: "6h" },
    { key: "24h", label: "24h" },
    { key: "7d", label: "7d" },
];
const SERIES_REFRESH_MS = 60000;

const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const tickFor = (range) => (t) =>
    range === "7d" ? new Date(t).toLocaleDateString([], { weekday: "short" }) : clock(t);
const labelFor = (range) => (t) =>
    range === "7d"
        ? new Date(t).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Flow-rate area chart. Live mode seeds from recent readings, then a fresh sample is pushed over
// the socket (`reading:new`) as soon as the device reports it — a periodic re-fetch remains only
// as a safety net. The other ranges show stored history and refresh every minute.
// `bare` omits the outer card wrapper so it can be embedded inside another card.
const FlowChart = ({ deviceId, bare = false }) => {
    const t = useChartTheme();
    const [range, setRange] = useState("live");
    const [data, setData] = useState([]);
    const [series, setSeries] = useState(null); // { points, binMinutes } for the selected range
    const [seriesError, setSeriesError] = useState(null);
    const nextIndex = useRef(0);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/readings?device=${deviceId}&limit=${MAX_SAMPLES}`);
            const rows = (res.readings || [])
                .slice()
                .reverse()
                .map((r, i) => ({
                    i,
                    flow: Number(r.flowRate) || 0,
                    time: new Date(r.timestamp).toLocaleTimeString(),
                }));
            nextIndex.current = rows.length;
            setData(rows);
        } catch {
            /* keep last frame on transient errors */
        }
    }, [deviceId]);

    // Live mode: recent readings + socket push.
    useEffect(() => {
        if (range !== "live") return undefined;
        load();
        const socket = connectSocket();
        socket?.emit("device:join", deviceId);

        const onReading = (r) => {
            if (r.device !== deviceId) return;
            setData((prev) => {
                const point = {
                    i: nextIndex.current++,
                    flow: Number(r.flowRate) || 0,
                    time: new Date(r.timestamp).toLocaleTimeString(),
                };
                return [...prev, point].slice(-MAX_SAMPLES);
            });
        };
        socket?.on("reading:new", onReading);

        // Safety-net poll in case a socket event is ever missed/disconnected.
        const id = setInterval(load, 30000);
        return () => {
            socket?.emit("device:leave", deviceId);
            socket?.off("reading:new", onReading);
            clearInterval(id);
        };
    }, [deviceId, load, range]);

    // History ranges: fetch the binned series, refresh every minute.
    useEffect(() => {
        if (range === "live") return undefined;
        let cancelled = false;
        setSeries(null);
        setSeriesError(null);
        const fetchSeries = () =>
            apiFetch(`/api/readings/series?device=${deviceId}&range=${range}`)
                .then((r) => !cancelled && setSeries(r))
                .catch((e) => !cancelled && setSeriesError(e.message));
        fetchSeries();
        const id = setInterval(fetchSeries, SERIES_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [deviceId, range]);

    const live = range === "live";
    const current = data.length ? data[data.length - 1].flow : 0;
    const flowing = current > 0.1;
    const pts = series?.points || [];
    const hasHistory = pts.some((p) => p.n > 0);
    const totalLitres = pts.reduce((s, p) => s + p.litres, 0);
    const peak = pts.reduce((m, p) => Math.max(m, p.max), 0);

    const body = (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiActivity className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{live ? "Live flow" : "Flow history"}</span>
                </div>
                <div className="flex items-center gap-3">
                    {live ? (
                        <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${flowing ? "animate-pulse bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{current.toFixed(1)}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">L/min</span>
                        </div>
                    ) : (
                        hasHistory && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {totalLitres.toFixed(0)} L · peak {peak.toFixed(1)} L/min
                            </span>
                        )
                    )}
                    <div className="inline-flex gap-0.5 rounded-sm bg-slate-100 p-0.5 dark:bg-slate-800/80" role="tablist" aria-label="Chart range">
                        {RANGES.map((r) => (
                            <button
                                key={r.key}
                                type="button"
                                role="tab"
                                aria-selected={range === r.key}
                                onClick={() => setRange(r.key)}
                                className={`rounded-sm px-2 py-0.5 text-[11px] font-medium transition ${
                                    range === r.key
                                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {live ? (
                data.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={110} className="mt-3">
                        <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                            <defs>
                                <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="i" hide />
                            <YAxis hide domain={[0, "auto"]} />
                            <Tooltip
                                formatter={(v) => [`${Number(v).toFixed(1)} L/min`, "Flow"]}
                                labelFormatter={(_, p) => p?.[0]?.payload?.time || ""}
                                {...t.tooltip}
                            />
                            <Area type="monotone" dataKey="flow" stroke="#0ea5e9" strokeWidth={2} fill="url(#flowFill)" isAnimationActive={false} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="mt-6 mb-4 text-center text-xs text-slate-400 dark:text-slate-500">Waiting for live readings…</p>
                )
            ) : seriesError ? (
                <p className="mt-6 mb-4 text-center text-xs text-red-500">{seriesError}</p>
            ) : !series ? (
                <p className="mt-6 mb-4 text-center text-xs text-slate-400 dark:text-slate-500">Loading…</p>
            ) : !hasHistory ? (
                <p className="mt-6 mb-4 text-center text-xs text-slate-400 dark:text-slate-500">No readings in the last {range}.</p>
            ) : (
                <ResponsiveContainer width="100%" height={130} className="mt-3">
                    <AreaChart data={pts} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                        <defs>
                            <linearGradient id="flowFillHist" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="t"
                            type="number"
                            scale="time"
                            domain={["dataMin", "dataMax"]}
                            tickFormatter={tickFor(range)}
                            tick={{ fontSize: 10, fill: t.tick }}
                            tickLine={false}
                            axisLine={false}
                            tickCount={5}
                            minTickGap={24}
                        />
                        <YAxis hide domain={[0, "auto"]} />
                        <Tooltip
                            formatter={(v, name) => [name === "flow" ? `${Number(v).toFixed(2)} L/min (average)` : `${Number(v).toFixed(2)} L/min`, name === "flow" ? "Flow" : "Peak"]}
                            labelFormatter={labelFor(range)}
                            {...t.tooltip}
                        />
                        <Area type="monotone" dataKey="flow" stroke="#0ea5e9" strokeWidth={2} fill="url(#flowFillHist)" isAnimationActive={false} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            )}
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {live
                    ? `Most recent ${data.length} samples · updates live`
                    : series && `Average flow per ${series.binMinutes >= 60 ? `${series.binMinutes / 60} h` : `${series.binMinutes} min`} · gaps mean no readings · refreshes every minute`}
            </p>
        </>
    );

    if (bare) return <div className="mt-3">{body}</div>;

    return <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">{body}</div>;
};

export default FlowChart;
