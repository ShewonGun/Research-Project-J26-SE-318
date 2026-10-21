import { useState, useEffect, useCallback } from "react";
import { FiTrendingUp, FiDroplet, FiClock, FiCpu, FiInfo } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { browserTimeZone } from "../../lib/dayKey.js";
import { useToast } from "../../Context/ToastContext.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import StatTile from "../../Components/SharedComponents/StatTile.jsx";
import SearchInput from "../../Components/SharedComponents/SearchInput.jsx";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (d) => new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const URGENT_DAYS = 3;

// How soon the supply will need attention: prepaid → days until the balance runs out;
// postpaid has no deadline here, so it sorts after prepaid devices.
const urgency = (d) => (d.available && d.runOut ? d.runOut.daysLeft : Infinity);

const Outlook = ({ d }) => {
    if (!d.available) return <span className="text-xs text-slate-400">—</span>;
    if (d.billingMode === "postpaid") {
        return d.bill ? (
            <div>
                <p className="font-medium text-slate-900 dark:text-white">{money(d.bill.amount.mid)}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    {money(d.bill.amount.low)} – {money(d.bill.amount.high)} · {Math.ceil(d.bill.daysLeftInCycle)} d left in cycle
                </p>
            </div>
        ) : (
            <span className="text-xs text-slate-400">No open cycle</span>
        );
    }
    if (!d.runOut) return <span className="text-xs text-slate-400">No active plan</span>;
    const tone = d.runOut.daysLeft <= 1 ? "text-red-600 dark:text-red-400" : d.runOut.daysLeft <= URGENT_DAYS ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white";
    return (
        <div>
            <p className={`font-medium ${tone}`}>{d.runOut.daysLeft.toFixed(1)} days left</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
                {d.runOut.balanceLitres.toFixed(0)} L · around {dateText(d.runOut.date)}
                {d.runOut.limitedBy === "expiry" ? " (plan expires)" : ""}
            </p>
        </div>
    );
};

const UsageForecast = () => {
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/forecast/network?tz=${encodeURIComponent(browserTimeZone())}`);
            setRows(res.devices || []);
            setError(null);
        } catch (e) {
            setError(e.message);
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const id = setInterval(load, 5 * 60 * 1000);
        return () => clearInterval(id);
    }, [load]);

    if (loading) return <WaterLoader center />;

    const q = search.trim().toLowerCase();
    const shown = rows
        .filter((d) => !q || [d.name, d.deviceId, d.owner?.name, d.owner?.email].some((v) => v?.toLowerCase().includes(q)))
        .sort((a, b) => urgency(a) - urgency(b));
    const forecasted = rows.filter((d) => d.available);
    const next7 = forecasted.reduce((s, d) => s + d.next7Litres, 0);
    const urgent = forecasted.filter((d) => d.runOut && d.runOut.daysLeft <= URGENT_DAYS).length;

    return (
        <div>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Usage Forecast</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Expected water use over the next 7 days per connection, and when prepaid balances run out.
                    </p>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="Connections forecasted" value={`${forecasted.length} / ${rows.length}`} icon={FiCpu} tone="sky" />
                <StatTile label="Expected next 7 days" value={`${next7.toFixed(0)} L`} icon={FiDroplet} tone="violet" />
                <StatTile label={`Balance runs out within ${URGENT_DAYS} days`} value={urgent} icon={FiClock} tone={urgent ? "red" : "emerald"} />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <FiInfo className="h-3.5 w-3.5" /> Sorted by how soon a prepaid balance runs out. Refreshes every 5 minutes.
                </p>
                <SearchInput value={search} onChange={setSearch} placeholder="Search by connection, ID, or owner…" className="w-full sm:w-64" />
            </div>

            {error ? (
                <p className="mt-6 rounded-lg border border-dashed border-red-300 py-10 text-center text-sm text-red-500 dark:border-red-900">{error}</p>
            ) : shown.length === 0 ? (
                <p className="mt-6 rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">No connections found.</p>
            ) : (
                <div className="mt-4 overflow-x-auto rounded-sm border border-slate-200 dark:border-slate-800">
                    <table className="w-full min-w-220 text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                <th className="px-4 py-2.5 font-medium">Connection</th>
                                <th className="px-4 py-2.5 font-medium">Plan</th>
                                <th className="px-4 py-2.5 font-medium">Today so far</th>
                                <th className="px-4 py-2.5 font-medium">Next 7 days</th>
                                <th className="px-4 py-2.5 font-medium">Outlook</th>
                                <th className="px-4 py-2.5 font-medium">Basis</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((d) => (
                                <tr key={d._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900 dark:text-white">{d.name || "—"}</p>
                                        <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{d.deviceId}</p>
                                        {d.owner && <p className="text-xs text-slate-400 dark:text-slate-500">{d.owner.name}</p>}
                                    </td>
                                    <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{d.billingMode}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.available ? `${d.usedToday.toFixed(0)} L` : "—"}</td>
                                    <td className="px-4 py-3">
                                        {d.available ? (
                                            <>
                                                <p className="font-medium text-slate-900 dark:text-white">{d.next7Litres.toFixed(0)} L</p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">≈ {d.avgPerDay.toFixed(0)} L/day</p>
                                            </>
                                        ) : (
                                            <span className="text-xs text-slate-400">{d.message}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Outlook d={d} />
                                    </td>
                                    <td className="px-4 py-3">
                                        {d.available && (
                                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                <FiTrendingUp className="h-3 w-3" />
                                                {d.method === "model" ? "AI model" : "Average"} · {d.daysUsed} days
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default UsageForecast;
