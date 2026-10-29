import { FiTrendingUp, FiCpu, FiExternalLink } from "react-icons/fi";
import { formatValue } from "../utils/c3Format";

export default function DemandForecastCard({ households = [], onNavigateToForecast }) {
  const available = households.filter((h) => h.EnhancedXGBoostForecast != null);
  const total = households.length && households.every((h) => h.PredictedDailyDemand_L != null)
    ? households.reduce((sum, h) => sum + h.PredictedDailyDemand_L, 0) : null;
  return <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
      <div className="flex items-center gap-2"><FiTrendingUp className="h-5 w-5 text-sky-500" /><div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Household Demand Forecasting</h3><p className="text-[11px] text-slate-500">Selected operational ML candidate: Enhanced XGBoost</p></div></div>
      <span className="rounded-xs bg-sky-50 px-2 py-1 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">{available.length ? `${available.length} exported forecasts` : "Not available"}</span>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs text-slate-600 dark:text-slate-300">
      <p><FiCpu className="mr-1 inline h-4 w-4 text-sky-500" />Predicted daily demand: <strong>{formatValue(total, 2, " L/day")}</strong></p>
      <p>Forecast dates: {[...new Set(households.map((h) => h.ForecastDate).filter(Boolean))].sort().join(" / ") || "Not available"}</p>
    </div>
    {onNavigateToForecast && <button type="button" onClick={onNavigateToForecast} className="mt-3 flex items-center gap-1 text-xs text-sky-600">View Demand Forecast Details <FiExternalLink /></button>}
  </div>;
}
