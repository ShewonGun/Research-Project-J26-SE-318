import { FiAlertTriangle } from "react-icons/fi";

const badges = {
  Normal: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  Warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  Critical: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
};

export default function ZoneHouseholdAssessment({ zone }) {
  const attention = zone.Critical == null || zone.Warning == null
    ? null : Number(zone.Critical) + Number(zone.Warning);

  return (
    <div className="space-y-1.5 text-xs">
      <div aria-label="Household assessments" className="flex flex-wrap justify-center gap-1.5">
        {Object.entries(badges).map(([status, style]) => (
          <span key={status} className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold ${style}`}>
            {status}: {zone[status] ?? "Not available"}
          </span>
        ))}
      </div>
      <p className={`flex items-center justify-center gap-1 text-[11px] ${attention > 0 ? "text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
        {attention > 0 && <FiAlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />}
        {attention == null ? "Household attention count unavailable"
          : attention === 0 ? "No households currently flagged for attention"
          : `${attention} ${attention === 1 ? "household needs" : "households need"} attention`}
      </p>
    </div>
  );
}
