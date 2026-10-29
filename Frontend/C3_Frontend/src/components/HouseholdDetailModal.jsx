import { formatValue } from "../utils/c3Format";
import { FiX, FiHome, FiMapPin, FiActivity, FiDatabase, FiShield, FiAlertTriangle, FiCheckCircle, FiAlertOctagon } from "react-icons/fi";

export default function HouseholdDetailModal({ household, onClose }) {
  if (!household) return null;

  const estimatedStorage = formatValue(household.EndOfDayEstimatedStorage_L, 2, " L");
  const storagePercent = formatValue(household.EndOfDayStoragePercent, 2, "%");
  const securityStatus = household.SecurityStatus || "Not available";

  const getStatusBadge = (status) => {
    switch (status) {
      case "Normal":
        return (
          <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <FiCheckCircle className="h-3.5 w-3.5" /> Normal
          </span>
        );
      case "Warning":
        return (
          <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <FiAlertTriangle className="h-3.5 w-3.5" /> Warning
          </span>
        );
      case "Critical":
        return (
          <span className="inline-flex items-center gap-1 rounded-sm bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-800">
            <FiAlertOctagon className="h-3.5 w-3.5" /> Critical
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Not available
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Household ${household.HouseholdID} details`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
              <FiHome className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Household {household.HouseholdID}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                PP1 model-estimated state and household mapping
              </p>
            </div>
          </div>
          <button
            aria-label="Close household details"
            type="button"
            onClick={onClose}
            className="rounded-xs p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Core Attributes */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-sm border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <FiMapPin className="h-3 w-3 text-sky-500" /> Zone &amp; DMA
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {household.Zone} &bull; {household.DMA}
            </p>
          </div>

          <div className="rounded-sm border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <FiActivity className="h-3 w-3 text-sky-500" /> Representative EPANET Node
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono">
              {household.EPANET_Node}
            </p>
          </div>

          <div className="col-span-2 rounded-sm border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-800/40">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <FiDatabase className="h-3 w-3 text-sky-500" /> Tank Capacity
            </p>
            <p className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
              {formatValue(household.TankCapacityLitres, 0, " L")}
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Address: {household.Address || "Not available"}</p>
          </div>
        </div>

        {/* Security & Storage Status */}
        <div className="mt-4 rounded-sm border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-700/60">
            <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <FiShield className="h-3.5 w-3.5 text-sky-500" /> Security Status
            </p>
            {getStatusBadge(securityStatus)}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Estimated Storage</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {estimatedStorage}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Estimated Storage %</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {storagePercent}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div><p className="text-slate-400">Forecast Date</p><p>{household.ForecastDate || "Not available"}</p></div>
          <div><p className="text-slate-400">Predicted Demand</p><p>{formatValue(household.PredictedDailyDemand_L, 2, " L/day")}</p></div>
          <div><p className="text-slate-400">Enhanced XGBoost (source units)</p><p>{formatValue(household.EnhancedXGBoostForecast)}</p></div>
          <div><p className="text-slate-400">Model-derived Inflow Proxy</p><p>{formatValue(household.HistoricalDailyInflowProxy_L, 2, " L/day")}</p></div>
          <div className="col-span-2"><p className="text-slate-400">Inflow Proxy Source</p><p>{household.InflowProxySource || "Not available"}</p></div>
          <p className="col-span-2 text-[11px] text-slate-500">Prototype thresholds: Normal &gt;40%; Warning &gt;20% and ≤40%; Critical ≤20%. Estimated states are not tank sensor measurements.</p>
        </div>
        {/* Close Button */}
        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xs bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
