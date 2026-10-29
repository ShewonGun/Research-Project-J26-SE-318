import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FiTrendingUp, FiDroplet, FiCalendar, FiCpu } from "react-icons/fi";
import { getChartTheme } from "../utils/chartTheme";
import { formatValue } from "../utils/c3Format";
import DemandForecastCard from "../components/DemandForecastCard";

const StatCard = ({ label, value, sub, icon: Icon, tone }) => {
  const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400",
  };
  return (
    <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone] || tones.sky}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
};


export default function DemandForecast({ households = [], history = [], isDarkMode = false }) {
  const [selectedZone, setSelectedZone] = useState("All");
  const [selectedHousehold, setSelectedHousehold] = useState("All");
  const [activeTab, setActiveTab] = useState("forecast");
  const theme = getChartTheme(isDarkMode);
  const zones = [...new Set(households.map((h) => h.Zone))];
  const zoneHouseholds = households.filter((h) => selectedZone === "All" || h.Zone === selectedZone);
  const selected = zoneHouseholds.filter((h) => selectedHousehold === "All" || h.HouseholdID === selectedHousehold);
  const historical = (() => {
    const ids = new Set(selected.map((h) => h.HouseholdID));
    const grouped = new Map();
    for (const row of history) {
      if (!ids.has(row.HouseholdID) || row.Consumption == null) continue;
      const current = grouped.get(row.Date) || { Date: row.Date, Consumption: 0, Records: 0 };
      current.Consumption += row.Consumption;
      current.Records += 1;
      grouped.set(row.Date, current);
    }
    return [...grouped.values()].sort((a, b) => a.Date.localeCompare(b.Date));
  })();
  const dailyTotal = selected.length && selected.every((h) => h.PredictedDailyDemand_L != null)
    ? selected.reduce((sum, h) => sum + h.PredictedDailyDemand_L, 0) : null;
  const dates = [...new Set(selected.map((h) => h.ForecastDate).filter(Boolean))].sort();
  return (
    <div className="space-y-6">
      <DemandForecastCard households={selected} />
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <label className="text-xs text-slate-500">Zone
          <select aria-label="Forecast zone" value={selectedZone} onChange={(e) => { setSelectedZone(e.target.value); setSelectedHousehold("All"); }} className="ml-2 rounded-xs border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <option value="All">All Zones</option>{zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Household
          <select aria-label="Forecast household" value={selectedHousehold} onChange={(e) => setSelectedHousehold(e.target.value)} className="ml-2 rounded-xs border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <option value="All">All Households</option>{zoneHouseholds.map((h) => <option key={h.HouseholdID}>{h.HouseholdID}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Forecast records" value={selected.length || "Not available"} sub="Actual exported predictions" icon={FiCpu} tone="sky" />
        <StatCard label="Predicted daily demand" value={formatValue(dailyTotal, 2, " L/day")} sub="Selected records; forecast dates below" icon={FiDroplet} tone="sky" />
        <StatCard label="Forecast dates" value={dates.join(" / ") || "Not available"} sub="Household-specific forecast periods" icon={FiCalendar} tone="amber" />
        <StatCard label="Historical periods" value={historical.length || "Not available"} sub="Only observed monthly records" icon={FiTrendingUp} tone="emerald" />
      </div>
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {[['forecast', 'Operational Demand Forecast'], ['historical', 'Actual Historical Consumption']].map(([id, title]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`border-b-2 px-4 py-2 text-xs font-semibold ${activeTab === id ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500'}`}>{title}</button>)}
      </div>
      <section className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{activeTab === "forecast" ? "Enhanced XGBoost household forecasts" : "Actual monthly consumption — source units"}</h3>
        <p className="mt-1 text-xs text-slate-500">{activeTab === "forecast" ? "Exported forecast values in source units; converted daily demand is provided separately by the storage-estimation output." : "Historical source units remain unspecified. Period totals include available observed records only; coverage differs at the boundaries. No values are filled."}</p>
        {(activeTab === "forecast" ? selected : historical).length ? <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activeTab === "forecast" ? selected : historical}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis dataKey={activeTab === "forecast" ? "HouseholdID" : "Date"} tick={{ fontSize: 10, fill: theme.tick }} />
              <YAxis tick={{ fontSize: 10, fill: theme.tick }} />
              <Tooltip {...theme.tooltip} />
              <Bar dataKey={activeTab === "forecast" ? "EnhancedXGBoostForecast" : "Consumption"} name={activeTab === "forecast" ? "Enhanced XGBoost (source units)" : "Actual consumption (source units)"} fill="#38bdf8" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <p role="status" className="py-12 text-center text-sm text-slate-500">Not available</p>}
      </section>
      <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Forecast record details</h3>
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead><tr className="border-b border-slate-200 dark:border-slate-700">{['Household','Zone','Forecast Date','Enhanced XGBoost (source units)','3-month MA (source units)','Predicted Demand (L/day)'].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{selected.map((h) => <tr key={h.HouseholdID} className="border-b border-slate-100 dark:border-slate-800"><td className="p-2">{h.HouseholdID}</td><td className="p-2">{h.Zone}</td><td className="p-2">{h.ForecastDate || "Not available"}</td><td className="p-2">{formatValue(h.EnhancedXGBoostForecast)}</td><td className="p-2">{formatValue(h.MA3Forecast)}</td><td className="p-2">{formatValue(h.PredictedDailyDemand_L)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">Research comparison: the 3-month moving average achieved the best average MAE in walk-forward testing. Enhanced XGBoost achieved the lowest overall RMSE and is the selected operational ML candidate. The current outputs have different forecast dates across zones; they are not a synchronized live observation.</p>
    </div>
  );
}
