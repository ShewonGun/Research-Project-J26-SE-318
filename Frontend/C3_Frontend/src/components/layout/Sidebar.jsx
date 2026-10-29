import {
  FiActivity,
  FiTrendingUp,
  FiLayers,
  FiDroplet,
  FiChevronLeft,
  FiChevronRight,
  FiSun,
  FiMoon,
} from "react-icons/fi";

const NAV_ITEMS = [
  {
    id: "digital-twin",
    label: "Digital Twin",
    icon: FiActivity,
  },
  {
    id: "demand-forecast",
    label: "Demand Forecast",
    icon: FiTrendingUp,
  },
  {
    id: "households",
    label: "Household Registry",
    icon: FiLayers,
  },
];

export default function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  onToggleCollapse,
  isDarkMode,
  onToggleDarkMode,
  apiConnected,
  householdCount = 0,
}) {
  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? "w-18" : "w-60"
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-800">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-sky-500 text-white shadow-xs">
            <FiDroplet className="h-4 w-4" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white truncate">
                C3 Water Twin
              </h2>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                DMA Security Monitor
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded-xs p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <FiChevronRight className="h-4 w-4" /> : <FiChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`group flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-xs transition ${
                  isActive
                    ? "bg-sky-50 text-sky-700 shadow-2xs dark:bg-sky-950/60 dark:text-sky-300 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200 font-medium"
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition ${
                    isActive
                      ? "text-sky-600 dark:text-sky-400"
                      : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
                  }`}
                />
                {!collapsed && (
                  <span className="truncate flex-1">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Status & Theme */}
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xs bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    apiConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  {apiConnected ? "API Connected" : "API Offline"}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {householdCount} household records
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="flex w-full items-center justify-between rounded-xs border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-2">
                {isDarkMode ? <FiSun className="h-3.5 w-3.5 text-amber-400" /> : <FiMoon className="h-3.5 w-3.5 text-slate-500" />}
                {isDarkMode ? "Light Mode" : "Dark Mode"}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                apiConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
              title={apiConnected ? "API Connected" : "API Offline"}
            />
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              title="Toggle theme"
            >
              {isDarkMode ? <FiSun className="h-4 w-4 text-amber-400" /> : <FiMoon className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
