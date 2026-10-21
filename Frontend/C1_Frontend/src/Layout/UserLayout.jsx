import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  FiLogOut,
  FiHome,
  FiBarChart2,
  FiPackage,
  FiFileText,
  FiUser,
  FiMenu,
  FiAlertTriangle,
} from "react-icons/fi";
import ThemeToggle from "../Components/SharedComponents/ThemeToggle.jsx";
import ConfirmationBox from "../Components/SharedComponents/ConfirmationBox.jsx";
import Logo from "../Components/SharedComponents/Logo.jsx";
import { PageFade } from "../Components/SharedComponents/Motion.jsx";
import { MyWaterProvider, useMyWater } from "../Context/MyWaterContext.jsx";
import { disconnectSocket } from "../lib/socket.js";

// Nav is mode-aware: prepaid households manage Plans, postpaid ones see Billing.
const navFor = (mode) => ({
  home: { to: "/app", label: "Home", end: true, icon: FiHome },
  usage: { to: "/app/usage", label: "My Usage", icon: FiBarChart2 },
  plans:
    mode === "postpaid"
      ? { to: "/app/billing", label: "Billing", icon: FiFileText }
      : { to: "/app/plans", label: "Plans", icon: FiPackage },
  alerts: { to: "/app/alerts", label: "Alerts", icon: FiAlertTriangle },
  account: { to: "/app/account", label: "Account", icon: FiUser },
});

const initials = (name) => (name?.trim()?.[0] || "U").toUpperCase();

const Brand = () => (
  <div className="flex items-center gap-2">
    <Logo className="h-7 w-7" />
    <span className="text-lg font-semibold text-slate-900 dark:text-white">
      AquaFlow
    </span>
  </div>
);

const Shell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, alerts } = useMyWater();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = navFor(mode);
  const activeAlerts = (alerts || []).filter(
    (a) => a.status === "active",
  ).length;
  // Primary tabs stay in the bar; My Usage + Account live in the right-corner menu.
  const primary = [nav.home, nav.plans];

  // Close the menu on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    disconnectSocket();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const tabClass = ({ isActive }) =>
    `rounded-md px-3.5 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
    }`;

  const menuItemClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400"
        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top navbar */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          {/* Left: brand */}
          <div className="flex flex-1 items-center">
            <Brand />
          </div>

          {/* Center: primary tabs (desktop) */}
          <nav className="hidden items-center gap-1 md:flex">
            {primary.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={tabClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            <ThemeToggle />

            {/* Right-corner menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                className="relative flex h-9 items-center gap-2 rounded-md border border-slate-200 pl-1.5 pr-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-[11px] font-semibold text-white">
                  {initials(user?.name)}
                </span>
                <FiMenu className="h-4 w-4" />
                {activeAlerts > 0 && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              {menuOpen && (
                <>
                  {/* Click-away backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                  />

                  <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    {/* User card */}
                    <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 dark:border-slate-800">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-sm font-semibold text-white">
                        {initials(user?.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {user?.name || "Account"}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {user?.email}
                        </p>
                      </div>
                    </div>

                    {/* Menu links */}
                    <nav className="p-1.5">
                      {/* Primary tabs — only shown here on mobile (they're in the bar on desktop) */}
                      <div className="md:hidden">
                        <NavLink to={nav.home.to} end className={menuItemClass}>
                          <nav.home.icon className="h-4 w-4" />
                          {nav.home.label}
                        </NavLink>
                        <NavLink to={nav.plans.to} className={menuItemClass}>
                          <nav.plans.icon className="h-4 w-4" />
                          {nav.plans.label}
                        </NavLink>
                      </div>

                      <NavLink to={nav.usage.to} className={menuItemClass}>
                        <nav.usage.icon className="h-4 w-4" />
                        {nav.usage.label}
                      </NavLink>
                      <NavLink to={nav.alerts.to} className={menuItemClass}>
                        <nav.alerts.icon className="h-4 w-4" />
                        <span className="flex-1">{nav.alerts.label}</span>
                        {activeAlerts > 0 && (
                          <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                            {activeAlerts}
                          </span>
                        )}
                      </NavLink>
                      <NavLink to={nav.account.to} className={menuItemClass}>
                        <nav.account.icon className="h-4 w-4" />
                        {nav.account.label}
                      </NavLink>
                    </nav>

                    {/* Log out */}
                    <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmLogout(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <FiLogOut className="h-4 w-4" />
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-20 sm:px-6">
        <PageFade>
          <Outlet />
        </PageFade>
      </main>

      <ConfirmationBox
        open={confirmLogout}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmText="Log out"
        tone="danger"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
};

const UserLayout = () => (
  <MyWaterProvider>
    <Shell />
  </MyWaterProvider>
);

export default UserLayout;
