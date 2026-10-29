import { useState, useMemo } from "react";
import { formatValue } from "../utils/c3Format";
import { FiSearch, FiChevronLeft, FiChevronRight, FiFilter, FiCheckCircle, FiAlertTriangle, FiAlertOctagon } from "react-icons/fi";

export default function HouseholdTable({
  households = [],
  onSelectHousehold,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [zoneFilter, setZoneFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const filteredHouseholds = useMemo(() => {
    return households.filter((h) => {
      const matchesSearch =
        h.HouseholdID.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.EPANET_Node && h.EPANET_Node.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesZone =
        zoneFilter === "ALL" || h.Zone === zoneFilter;

      return matchesSearch && matchesZone;
    });
  }, [households, searchTerm, zoneFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredHouseholds.length / pageSize));

  // Reset page when filter changes
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleZoneChange = (e) => {
    setZoneFilter(e.target.value);
    setCurrentPage(1);
  };

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHouseholds.slice(start, start + pageSize);
  }, [filteredHouseholds, currentPage, pageSize]);

  const renderSecurityStatus = (status) => {
    if (!status) return <span className="text-slate-400 dark:text-slate-500">—</span>;

    switch (status) {
      case "Normal":
        return (
          <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <FiCheckCircle className="h-3 w-3" /> Normal
          </span>
        );
      case "Warning":
        return (
          <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <FiAlertTriangle className="h-3 w-3" /> Warning
          </span>
        );
      case "Critical":
        return (
          <span className="inline-flex items-center gap-1 rounded-sm bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-400">
            <FiAlertOctagon className="h-3 w-3" /> Critical
          </span>
        );
      default:
        return <span className="text-slate-400 dark:text-slate-500">—</span>;
    }
  };

  return (
    <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Household Digital Twin States
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Mapped household records and exported model-estimated PP1 states
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <FiSearch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search Household ID / Node..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="rounded-xs border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-hidden focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Zone filter */}
          <div className="flex items-center gap-1.5">
            <FiFilter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={zoneFilter}
              onChange={handleZoneChange}
              className="rounded-xs border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-hidden focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">All Zones ({households.length})</option>
              <option value="Zone A">Zone A (10_37_05)</option>
              <option value="Zone B">Zone B (10_37_06)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <th className="px-3.5 py-2.5">Household ID</th>
              <th className="px-3.5 py-2.5">Zone</th>
              <th className="px-3.5 py-2.5">DMA</th>
              <th className="px-3.5 py-2.5">EPANET Node</th>
              <th className="px-3.5 py-2.5">Tank Capacity (L)</th>
              <th className="px-3.5 py-2.5">Predicted Demand (L/day)</th>
              <th className="px-3.5 py-2.5">Estimated Storage (L)</th>
              <th className="px-3.5 py-2.5">Estimated Storage %</th>
              <th className="px-3.5 py-2.5">Security Status</th>
              <th className="px-3.5 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="10" className="py-6 text-center text-xs text-slate-400">
                  No matching households found.
                </td>
              </tr>
            ) : (
              paginatedData.map((h) => {
                const storagePct = formatValue(h.EndOfDayStoragePercent, 2, "%");
                const secStatus = h.SecurityStatus || null;

                return (
                  <tr
                    key={h.HouseholdID}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">
                      {h.HouseholdID}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="rounded-xs bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {h.Zone}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {h.DMA}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-sky-700 dark:text-sky-400">
                      {h.EPANET_Node}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      {formatValue(h.TankCapacityLitres, 0)}
                    </td>
                    <td className="px-3.5 py-2.5">{formatValue(h.PredictedDailyDemand_L)}</td>
                    <td className="px-3.5 py-2.5">{formatValue(h.EndOfDayEstimatedStorage_L)}</td>
                    <td className="px-3.5 py-2.5 font-medium">
                      {storagePct}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {renderSecurityStatus(secStatus)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectHousehold(h)}
                        className="rounded-xs text-sky-600 hover:text-sky-700 hover:underline dark:text-sky-400 text-xs font-medium"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p>
          Showing{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {filteredHouseholds.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </span>{" "}
          to{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {Math.min(currentPage * pageSize, filteredHouseholds.length)}
          </span>{" "}
          of{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {filteredHouseholds.length}
          </span>{" "}
          households
        </p>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="flex items-center gap-1 rounded-xs border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FiChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="px-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 rounded-xs border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Next <FiChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
