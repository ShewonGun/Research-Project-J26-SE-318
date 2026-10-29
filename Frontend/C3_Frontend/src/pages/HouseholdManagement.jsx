import HouseholdTable from "../components/HouseholdTable";

export default function HouseholdManagement({
  households = [],
  onSelectHousehold,
}) {
  return (
    <div className="space-y-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Household Registry
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Mapped household records with model-estimated storage and prototype security assessment.
          </p>
        </div>
        <div className="text-right">
          <span className="inline-block rounded-xs bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {households.length} household records
          </span>
        </div>
      </div>

      {/* ── Household Table ────────────────────────────────────────── */}
      <HouseholdTable
        households={households}
        onSelectHousehold={onSelectHousehold}
      />
    </div>
  );
}
