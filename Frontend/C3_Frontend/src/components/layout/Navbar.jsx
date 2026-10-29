import {
  FiMenu,
  FiDatabase,
  FiClock,
  FiRefreshCw,
  FiSun,
  FiMoon,
} from "react-icons/fi";

const PAGE_TITLES = {
  "digital-twin": {
    title: "Digital Twin Overview",
    subtitle: "PP1 estimated household states and representative network mapping",
  },
  "demand-forecast": {
    title: "Demand Forecast",
    subtitle: "Consumption trends & predictive demand",
  },
  households: {
    title: "Household Digital Twin States",
    subtitle: "Mapped household records and model-estimated storage",
  },
};

export default function Navbar({
  activePage,
  apiConnected,
  householdCount,
  lastUpdated,
  onRefresh,
  loading,
  isDarkMode,
  onToggleDarkMode,
  onToggleSidebar,
}) {
  const pageMeta = PAGE_TITLES[activePage] || PAGE_TITLES["digital-twin"];

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 sm:px-6 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-xs p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 md:hidden"
        >
          <FiMenu className="h-5 w-5" />
        </button>

        <div>
          <h1 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">
            {pageMeta.title}
          </h1>
          <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
            {pageMeta.subtitle}
          </p>
        </div>
      </div>

      {/* Right Toolbar */}
      <div className="flex items-center gap-2.5">
        {/* Backend Connected Pill */}
        <div className="flex items-center gap-2 rounded-xs border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800">
          <span
            className={`h-2 w-2 rounded-full ${
              apiConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="hidden text-xs font-medium text-slate-700 dark:text-slate-300 sm:inline">
            {apiConnected ? "Connected" : "Offline"}
          </span>
        </div>

        {/* API-backed household count */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-xs border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800">
          <FiDatabase className="h-3.5 w-3.5 text-sky-500" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {householdCount} Households
          </span>
        </div>

        {/* Timestamp */}
        {lastUpdated && (
          <div className="hidden lg:flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <FiClock className="h-3.5 w-3.5" />
            <span>{lastUpdated}</span>
          </div>
        )}

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh dataset from backend"
          className="rounded-xs border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={onToggleDarkMode}
          title="Toggle light/dark theme"
          className="rounded-xs border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {isDarkMode ? <FiSun className="h-3.5 w-3.5 text-amber-400" /> : <FiMoon className="h-3.5 w-3.5 text-slate-600" />}
        </button>
      </div>
    </header>
  );
}
