import { FiX, FiMapPin, FiActivity } from "react-icons/fi";
import { formatValue } from "../utils/c3Format";
import ZoneHouseholdAssessment from "./ZoneHouseholdAssessment";

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
    <span className="text-xs font-medium text-slate-900 dark:text-white text-right">{value}</span>
  </div>
);

export default function ZoneDetailModal({ open, zone, onClose }) {
  if (!open || !zone) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${zone.name} details`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-sm border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <FiActivity className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{zone.name}</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <FiMapPin className="h-3 w-3 text-sky-500" /> DMA {zone.dma || "Unavailable"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xs p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Zone Specs */}
        <div className="mt-4">
          <ZoneHouseholdAssessment zone={zone} />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Average storage does not describe every household's water availability.</p>
        </div>
        <div className="mt-4">
          <Row label="Zone Identifier" value={zone.name} />
          <Row label="District Metered Area (DMA)" value={zone.dma ? `DMA ${zone.dma}` : "Unavailable"} />
          <Row label="Connected Households" value={`${zone.households ?? zone.householdCount ?? 0} Households`} />
          <Row
            label="Average Estimated Storage"
            value={formatValue(zone.AverageStoragePercent, 2, "%")}
          />
          <Row
            label="Combined Estimated Household Storage"
            value={formatValue(zone.currentStorageL, 2, " L")}
          />
          <Row
            label="Combined Household Tank Capacity"
            value={formatValue(zone.tankCapacity, 0, " L")}
          />
          <Row
            label="Forecast Dates"
            value={zone.ForecastDates?.join(", ") || "Not available"}
          />
          <Row
            label="Priority Rank"
            value={zone.priority ? `#${zone.priority}` : "Not calculated"}
          />
          <Row label="Normal / Warning / Critical" value={`${zone.Normal ?? "Not available"} / ${zone.Warning ?? "Not available"} / ${zone.Critical ?? "Not available"}`} />
          <Row label="Households Requiring Attention" value={formatValue(zone.AttentionPercent, 2, "%")} />
        </div>

        {/* Footer */}
        <div className="mt-5 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xs bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
