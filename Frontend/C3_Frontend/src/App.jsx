import { useState, useEffect } from "react";
import DashboardLayout from "./components/layout/DashboardLayout";
import DigitalTwin from "./pages/DigitalTwin";
import DemandForecast from "./pages/DemandForecast";
import HouseholdManagement from "./pages/HouseholdManagement";
import HouseholdDetailModal from "./components/HouseholdDetailModal";
import { getDigitalTwin } from "./services/api";

export default function App() {
  const [activePage, setActivePage] = useState("digital-twin");
  const [twin, setTwin] = useState(null);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const households = twin?.households || [];
  const [loading, setLoading] = useState(true);
  const [apiConnected, setApiConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [selectedHousehold, setSelectedHousehold] = useState(null);

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      return localStorage.getItem("c3_theme") === "dark";
    } catch {
      return false;
    }
  });

  // Apply dark mode class to root HTML element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const loadData = () => {
    setLoading(true);
    setRefreshVersion((v) => v + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    getDigitalTwin({ signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setTwin(data);
      setError("");
      setApiConnected(true);
      setLastUpdated(new Date().toLocaleTimeString());
    }).catch((err) => {
      if (controller.signal.aborted) return;
      setError(err.message);
      setTwin(null);
      setSelectedHousehold(null);
      setApiConnected(false);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => {
    try { localStorage.setItem("c3_theme", isDarkMode ? "dark" : "light"); }
    catch { /* Theme persistence is optional. */ }
  }, [isDarkMode]);

  return (
    <DashboardLayout
      activePage={activePage}
      onNavigate={setActivePage}
      apiConnected={apiConnected}
      householdCount={households.length}
      lastUpdated={lastUpdated}
      onRefresh={loadData}
      loading={loading}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
    >
      {error && <div role="alert" className="mb-4 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">C3 data unavailable: {error}. Use Refresh to retry.</div>}
      {twin?.warnings?.map((warning) => <p key={warning} role="status" className="mb-2 text-xs text-amber-700 dark:text-amber-400">Optional historical data unavailable: {warning}</p>)}
      {loading && <p role="status" className="mb-4 text-sm text-slate-500">Loading C3 analytical outputs…</p>}
      {/* ── Page Views ── */}
      {activePage === "digital-twin" && (
        <DigitalTwin
          households={households}
          twin={twin}
          onSelectHousehold={(h) => setSelectedHousehold(h)}
        />
      )}

      {activePage === "demand-forecast" && (
        <DemandForecast
          households={households}
          history={twin?.history || []}
          isDarkMode={isDarkMode}
        />
      )}

      {activePage === "households" && (
        <HouseholdManagement
          households={households}
          onSelectHousehold={(h) => setSelectedHousehold(h)}
        />
      )}

      {/* Global Household Detail Modal */}
      {selectedHousehold && (
        <HouseholdDetailModal
          household={selectedHousehold}
          onClose={() => setSelectedHousehold(null)}
        />
      )}
    </DashboardLayout>
  );
}
