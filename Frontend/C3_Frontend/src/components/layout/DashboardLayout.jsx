import { useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

export default function DashboardLayout({
  activePage,
  onNavigate,
  apiConnected,
  householdCount,
  lastUpdated,
  onRefresh,
  loading,
  isDarkMode,
  onToggleDarkMode,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* Sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
        apiConnected={apiConnected}
        householdCount={householdCount}
      />

      {/* Main Content Area */}
      <div
        className={`flex min-h-screen flex-col transition-all duration-300 ${
          collapsed ? "pl-18" : "pl-64"
        }`}
      >
        <Navbar
          activePage={activePage}
          apiConnected={apiConnected}
          householdCount={householdCount}
          lastUpdated={lastUpdated}
          onRefresh={onRefresh}
          loading={loading}
          isDarkMode={isDarkMode}
          onToggleDarkMode={onToggleDarkMode}
          onToggleSidebar={() => setCollapsed(!collapsed)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
