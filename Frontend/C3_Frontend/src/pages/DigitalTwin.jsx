import { useState, useEffect, useMemo } from "react";
import {
  FiDroplet,
  FiAlertTriangle,
  FiCheckCircle,
  FiAlertOctagon,
  FiMapPin,
  FiHome,
  FiActivity,
  FiCalendar,
  FiBell,
  FiSend,
  FiXCircle,
} from "react-icons/fi";

import ZoneDetailModal from "../components/ZoneDetailModal";
import HouseholdDetailModal from "../components/HouseholdDetailModal";
import DigitalTwinAlertModal from "../components/DigitalTwinAlertModal";
import DemandForecastCard from "../components/DemandForecastCard";
import { formatValue, statusRisk, storageRisk } from "../utils/c3Format";
import ZoneHouseholdAssessment from "../components/ZoneHouseholdAssessment";


// ─── Risk colour tokens ───────────────────────────────────────────────────────
const R = {
  Pending: {
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
    nodeBg: "bg-slate-50 dark:bg-slate-800/50",
    iconCls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
  Low: {
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
    bar: "bg-emerald-500",
    hex: "#10b981",
    wave: "#10b981",
    waveLt: "#34d399",
    dot: "bg-emerald-500",
    nodeBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    iconCls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    Icon: FiCheckCircle,
  },
  Medium: {
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
    bar: "bg-amber-500",
    hex: "#f59e0b",
    wave: "#f59e0b",
    waveLt: "#fbbf24",
    dot: "bg-amber-500",
    nodeBg: "bg-amber-50/50 dark:bg-amber-950/20",
    iconCls: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    Icon: FiAlertTriangle,
  },
  High: {
    badge: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
    bar: "bg-red-500",
    hex: "#ef4444",
    wave: "#ef4444",
    waveLt: "#f87171",
    dot: "bg-red-500",
    nodeBg: "bg-red-50/50 dark:bg-red-950/20",
    iconCls: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    Icon: FiAlertOctagon,
  },
};

// ─── Water Tank SVG Component ─────────────────────────────────────────────────
const WaterTank = ({ percentage, risk, label, width = 100, height = 150 }) => {
  if (percentage == null) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-slate-300 p-4 text-slate-500 dark:border-slate-700 dark:text-slate-400" style={{ width: width + 12, minHeight: height }}>
        <FiDroplet className="h-8 w-8" />
        <span className="text-xs">Not calculated</span>
      </div>
    );
  }
  const s = R[risk] || R.Low;
  const uid = `wt-${label?.replace(/\s+/g, "")}-${percentage}`;

  const fillH = Math.max(0, Math.min(1, percentage / 100)) * height;
  const waterY = height - fillH;
  const capH = 14;
  const capW = width * 0.65;
  const waveAmp = 5;
  const waveW = width * 3;

  const buildWave = (yBase, amp, w) => {
    const pts = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const y = yBase + Math.sin((i / steps) * Math.PI * 2) * amp;
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    pts.push(`L${w},${height + 4} L0,${height + 4} Z`);
    return pts.join(" ");
  };

  const textColor = fillH > height * 0.45 ? "white" : "#1e293b";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: width + 12 }}>
        <svg
          width={width + 12}
          height={height + capH + 6}
          viewBox={`-6 -${capH} ${width + 12} ${height + capH + 6}`}
          overflow="visible"
        >
          <defs>
            <clipPath id={`clip-${uid}`}>
              <rect x={0} y={0} width={width} height={height} rx={6} ry={6} />
            </clipPath>
            <linearGradient id={`shine-${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0.0" />
              <stop offset="30%" stopColor="white" stopOpacity="0.12" />
              <stop offset="60%" stopColor="white" stopOpacity="0.04" />
              <stop offset="100%" stopColor="white" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id={`waterfade-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.waveLt} stopOpacity="0.9" />
              <stop offset="100%" stopColor={s.wave} stopOpacity="1.0" />
            </linearGradient>
          </defs>

          <rect x={(width - capW) / 2} y={-capH + 4} width={capW} height={capH} rx={3} fill="#94a3b8" />
          <rect x={width / 2 - 6} y={-capH - 2} width={12} height={10} rx={2} fill="#64748b" />

          <rect x={0} y={0} width={width} height={height} rx={6} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={2} />

          {[25, 50, 75].map((mark) => {
            const my = height - (mark / 100) * height;
            return (
              <g key={mark}>
                <line x1={width - 10} y1={my} x2={width - 2} y2={my} stroke="#94a3b8" strokeWidth={1} />
                <text x={width - 13} y={my + 3} fontSize={7} fill="#94a3b8" textAnchor="end">{mark}%</text>
              </g>
            );
          })}

          <g clipPath={`url(#clip-${uid})`}>
            {fillH > 0 && <rect x={0} y={waterY + waveAmp} width={width} height={fillH} fill={`url(#waterfade-${uid})`} />}
            {fillH > 0 && (
              <path d={buildWave(waterY, waveAmp, waveW)} fill={s.waveLt} opacity={0.75}>
                <animateTransform attributeName="transform" type="translate" values={`0,0;${-width},0;${-width * 2},0`} dur="4s" repeatCount="indefinite" />
              </path>
            )}
            {fillH > 0 && (
              <path d={buildWave(waterY + 2, waveAmp * 0.7, waveW)} fill={s.wave} opacity={0.6}>
                <animateTransform attributeName="transform" type="translate" values={`${-width},0;0,0;${-width},0`} dur="3.2s" repeatCount="indefinite" />
              </path>
            )}
          </g>

          <rect x={0} y={0} width={width} height={height} rx={6} fill={`url(#shine-${uid})`} />
          <rect x={0} y={0} width={width} height={height} rx={6} fill="none" stroke="#64748b" strokeWidth={2} />

          <text x={width / 2} y={height / 2 + 6} textAnchor="middle" fontSize={20} fontWeight={700} fill={textColor}>
            {percentage}%
          </text>
          <text x={width / 2} y={height / 2 + 20} textAnchor="middle" fontSize={9} fill={textColor} opacity={0.7}>
            storage
          </text>
          <rect x={width / 2 - 8} y={height} width={16} height={6} fill="#94a3b8" />
        </svg>
      </div>

      {label && (
        <div className="text-center">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{label}</p>
        </div>
      )}
    </div>
  );
};

// ─── Mini Tank Component ──────────────────────────────────────────────────────
const MiniTank = ({ percentage, risk }) => {
  if (percentage == null) {
    return <span aria-label="Storage not calculated" className="flex h-14 w-10 items-center justify-center rounded-sm border border-dashed border-slate-300 text-slate-400 dark:border-slate-700">?</span>;
  }
  const s = R[risk] || R.Low;
  const w = 36, h = 52;
  const uid = `mini-${risk}-${percentage}`;
  const fillH = Math.max(0, Math.min(1, percentage / 100)) * h;
  const waterY = h - fillH;
  const waveW = w * 3;

  const buildWave = (yBase, amp, tw) => {
    const pts = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * tw;
      const y = yBase + Math.sin((i / steps) * Math.PI * 2) * amp;
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    pts.push(`L${tw},${h + 4} L0,${h + 4} Z`);
    return pts.join(" ");
  };

  return (
    <svg width={w + 4} height={h + 6} viewBox={`-2 0 ${w + 4} ${h + 6}`} overflow="visible">
      <defs>
        <clipPath id={`clip-${uid}`}>
          <rect x={0} y={0} width={w} height={h} rx={3} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={w} height={h} rx={3} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={1.5} />
      <g clipPath={`url(#clip-${uid})`}>
        {fillH > 0 && <rect x={0} y={waterY + 3} width={w} height={fillH} fill={s.hex} opacity={0.85} />}
        {fillH > 0 && (
          <path d={buildWave(waterY, 3, waveW)} fill={s.waveLt} opacity={0.7}>
            <animateTransform attributeName="transform" type="translate" values={`0,0;${-w},0;${-w * 2},0`} dur="3.5s" repeatCount="indefinite" />
          </path>
        )}
      </g>
      <rect x={0} y={0} width={w} height={h} rx={3} fill="none" stroke="#64748b" strokeWidth={1.5} />
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill={fillH > h * 0.45 ? "white" : "#1e293b"}>
        {percentage}%
      </text>
    </svg>
  );
};

// ─── Network Nodes & Arrow ────────────────────────────────────────────────────
const NetNode = ({ label, sublabel, icon: Icon, tone = "sky" }) => {
  const cls = {
    sky: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-400",
    slate: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300",
  }[tone];
  return (
    <div className={`flex items-center gap-2 rounded-sm border px-3.5 py-2 ${cls}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-xs font-semibold leading-tight">{label}</p>
        {sublabel && <p className="text-[10px] opacity-70 leading-tight">{sublabel}</p>}
      </div>
    </div>
  );
};

const Arrow = () => (
  <div className="flex flex-col items-center py-0.5">
    <div className="w-px h-4 bg-slate-300 dark:bg-slate-700" />
    <div className="h-0 w-0 border-x-[4px] border-x-transparent border-t-[6px] border-t-slate-300 dark:border-t-slate-700" />
  </div>
);

// ─── Reusable Stat Card ───────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, tone }) => {
  const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  };
  return (
    <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone] || tones.sky}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
};

// ─── Household Pill Chip (Truthful Status: No fake values) ────────────────────
const HouseholdPill = ({ h, calculated, onClick }) => {
  const hasResult = calculated && calculated.securityStatus;
  const risk = hasResult
    ? calculated.securityStatus === "Critical"
      ? "High"
      : calculated.securityStatus === "Warning"
      ? "Medium"
      : "Low"
    : null;

  const styleCls = risk
    ? `${R[risk].badge} ${R[risk].border}`
    : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

  return (
    <button
      type="button"
      onClick={() => onClick(h)}
      title={`${h.HouseholdID} (${h.EPANET_Node}, ${h.TankCapacityLitres}L)`}
      className={`inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[10px] font-medium transition hover:opacity-85 ${styleCls}`}
    >
      {risk && <span className={`h-1.5 w-1.5 rounded-full ${R[risk].dot}`} />}
      {h.HouseholdID}
    </button>
  );
};

// ─── Zone Card with MiniTank and Household Grid ──────────────────────────────
const ZoneCard = ({ zone, households, calculatedMap, onZone, onHousehold }) => {
  const [showAll, setShowAll] = useState(false);
  const displayHouseholds = showAll ? households : households.slice(0, 18);

  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xs dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => onZone(zone)}
        className="flex items-center justify-between gap-2 bg-slate-50 p-3 text-left transition hover:opacity-90 dark:bg-slate-800/50"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <FiMapPin className="h-3.5 w-3.5" />
          </span>
          <div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">{zone.name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-1.5">(DMA {zone.dma})</span>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <div className="shrink-0">
          <MiniTank percentage={zone.storagePercentage} risk={zone.storageRisk} />
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Connected</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{households.length} records</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Avg Estimated Storage</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatValue(zone.AverageStoragePercent, 2, "%")}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <ZoneHouseholdAssessment zone={zone} />
      </div>

      <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
            Households ({households.length})
          </p>
          {households.length > 18 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-[10px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
            >
              {showAll ? "Show Less" : `View All (${households.length})`}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
          {[...new Set(displayHouseholds.map((h) => h.EPANET_Node))].map((node) => (
            <div key={node || "unmapped"} className="w-full rounded-sm border border-slate-100 p-2 dark:border-slate-800">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">Representative node: {node || "Not available"} · {households.filter((h) => h.EPANET_Node === node).length} mapped records</p>
              <div className="flex flex-wrap gap-1">{displayHouseholds.filter((h) => h.EPANET_Node === node).map((h) => (
                <HouseholdPill key={h.HouseholdID} h={h} calculated={calculatedMap[h.HouseholdID]} onClick={onHousehold} />
              ))}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Relative Time Helper ─────────────────────────────────────────────────────
const relativeTime = (dateStr) => {
  if (!dateStr) return "";
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Suppress the old seeded demo alert, including persisted copies. Preserve
// operator-created alerts; no automatic telemetry alerts are integrated yet.
const isLegacyDemoAlert = (alert) => alert.id === "DTA-001"
  && alert.title === "Zone B Storage Caution"
  && alert.message === "Zone B storage dropped below 50% threshold.";

// ─── Main Digital Twin Page Component ─────────────────────────────────────────
export default function DigitalTwin({
  households = [],
  twin,
  onSelectHousehold,
}) {
  const [selZone, setSelZone] = useState(null);
  const [selHousehold, setSelHousehold] = useState(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  // Digital Twin Alerts State
  const [alerts, setAlerts] = useState(() => {
    try {
      const saved = localStorage.getItem("c3_dt_alerts");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((alert) => alert && !isLegacyDemoAlert(alert)) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("c3_dt_alerts", JSON.stringify(alerts));
    } catch {
      // Local persistence is optional when browser storage is unavailable.
    }
  }, [alerts]);

  const handleDispatchAlert = (newAlert) => {
    setAlerts((prev) => [newAlert, ...prev]);
  };

  const handleAcknowledgeAlert = (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "acknowledged" } : a)));
  };

  const handleResolveAlert = (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "resolved" } : a)));
  };

  const handleDeleteAlert = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const calculatedMap = useMemo(() => Object.fromEntries(households.map((h) => [h.HouseholdID, {
    securityStatus: h.SecurityStatus, storagePercent: h.EndOfDayStoragePercent,
  }])), [households]);
  const zones = useMemo(() => (twin?.zones || []).map((z) => {
    const members = households.filter((h) => h.Zone === z.Zone);
    const total = (field) => members.every((h) => h[field] != null)
      ? members.reduce((sum, h) => sum + h[field], 0) : null;
    return { ...z, id: z.Zone, name: z.Zone, dma: z.DMA, households: z.HouseholdCount,
      storagePercentage: z.AverageStoragePercent, storageRisk: storageRisk(z.AverageStoragePercent),
      currentStorageL: total("EndOfDayEstimatedStorage_L"), tankCapacity: total("TankCapacityLitres"),
      priority: twin.zonePriority?.find((p) => p.Zone === z.Zone)?.PriorityRank,
    };
  }), [twin, households]);
  const priorityZones = (twin?.zonePriority || []).map((ranked) => zones.find((z) => z.Zone === ranked.Zone)).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* ── Monthly Supply Cycle Stepper ──────────────────────────── */}
      <div className="rounded-sm border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-sky-500 text-white">
              <FiCalendar className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                PP1 forecast dates: <span className="text-slate-500 dark:text-slate-400">{twin?.summary?.ForecastDates?.join(" / ") || "Not available"}</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Historical data → Enhanced XGBoost → estimated storage → security assessment → zone aggregation → priority ranking
              </p>
            </div>
          </div>

          <span className="text-xs text-slate-400">Exported analytical snapshot</span>
        </div>

      </div>

      {/* ── Summary Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Mapped Households" value={twin?.summary.MappedHouseholds ?? "Not available"} sub="PP1 household records" icon={FiHome} tone="sky" />
        <StatCard label="Normal" value={twin?.summary.Normal ?? "Not available"} sub="Prototype security assessment" icon={FiCheckCircle} tone="emerald" />
        <StatCard label="Warning" value={twin?.summary.Warning ?? "Not available"} sub="Requires attention" icon={FiAlertTriangle} tone="amber" />
        <StatCard label="Critical" value={twin?.summary.Critical ?? "Not available"} sub="Highest household priority" icon={FiAlertOctagon} tone="red" />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">PP1 prototype — storage values are model-estimated Digital Twin states. Household inflow is represented using a model-derived proxy because direct tank inflow measurements and household-level intermittent supply schedules were unavailable.</p>
      <DemandForecastCard households={households} />

      {/* ── Zone Water Storage Tanks ───────────────────────────────── */}
      <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Zone Estimated Household Storage
          </p>
          <span className="text-xs text-slate-400">
            Average storage colour; household assessments shown separately
          </span>
        </div>

        <div className="flex flex-wrap justify-around gap-8 py-3">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelZone(z)}
              className="flex flex-col items-center gap-2 rounded-sm p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
              title={`Click to view ${z.name} details`}
            >
              <WaterTank
                percentage={z.storagePercentage}
                risk={z.storageRisk}
                label={z.Zone}
                width={100}
                height={160}
              />
              <div className="text-center mt-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{z.name}</p>
                <p className="mt-1 text-[11px] font-medium text-sky-700 dark:text-sky-400">
                  Average estimated storage: {formatValue(z.AverageStoragePercent, 2, "%")}
                </p>
                <ZoneHouseholdAssessment zone={z} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Network Diagram ────────────────────────────────────────── */}
      <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Representative EPANET Mapping
          </p>
          <span className="text-xs text-slate-400">
            {twin?.summary.MappedHouseholds ?? "Not available"} household records mapped to {twin?.summary.RepresentativeNodes ?? "Not available"} representative EPANET nodes
          </span>
        </div>

        <div className="flex flex-col items-center">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Schematic mapping view. Household markers are visualization markers rather than precise GIS coordinates. No hydraulic pressures are used to determine security.</p>
          <NetNode label="C3 household mapping" sublabel="Read-only network context" icon={FiDroplet} tone="sky" />
          <Arrow />
          <NetNode label="Distribution Trunk" sublabel="Zone / DMA grouping (schematic)" icon={FiActivity} tone="slate" />
          <Arrow />
          <div className="mt-2 w-full grid grid-cols-1 gap-4 lg:grid-cols-2">
            {zones.map((z) => (
              <ZoneCard
                key={z.id}
                zone={z}
                households={households.filter((h) => h.Zone === z.Zone)}
                calculatedMap={calculatedMap}
                onZone={setSelZone}
                onHousehold={(h) => {
                  if (onSelectHousehold) onSelectHousehold(h);
                  else setSelHousehold(h);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Zone Priority & Digital Twin Alerts ─────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Priority Ranking */}
        <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Zone Priority Ranking
            </p>
            <span className="text-[10px] text-slate-400">CSV-derived priorities</span>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Critical household count first, then Warning/attention count; lower average estimated storage breaks ties.</p>
            {priorityZones.map((z) => {
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setSelZone(z)}
                  className="flex items-center gap-3 rounded-sm border border-slate-100 p-3 text-left transition hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{z.name} (DMA {z.dma})</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      #{z.priority} · Critical: {z.Critical} · Warning: {z.Warning} · Attention: {formatValue(z.AttentionPercent, 2, "%")} · Average estimated storage: {formatValue(z.AverageStoragePercent, 2, "%")}
                    </p>
                  </div>
                  <ZoneHouseholdAssessment zone={z} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Household Priority Ranking</h3>
          <p className="mt-1 text-xs text-slate-500">Critical → Warning → Normal; lower estimated storage percentage first within each status.</p>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {(twin?.householdPriority || []).map((h) => <button key={h.HouseholdID} type="button" onClick={() => onSelectHousehold ? onSelectHousehold(h) : setSelHousehold(h)} className="flex w-full items-center justify-between gap-2 rounded-sm border border-slate-100 p-2 text-left text-xs dark:border-slate-800">
              <span>#{h.PriorityRank} {h.HouseholdID} · {h.Zone}</span>
              <span className={(R[statusRisk(h.SecurityStatus)] || R.Pending).badge + " rounded-sm px-2 py-1"}>{h.SecurityStatus} · {formatValue(h.EndOfDayStoragePercent, 2, "%")}</span>
            </button>)}
          </div>
        </div>
        {/* Alerts & Dispatcher */}
        <div className="rounded-sm border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                <FiBell className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Local Operator Notes ({alerts.filter((a) => a.status === "active").length})
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAlertModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-xs bg-sky-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-sky-500 shadow-2xs transition"
            >
              <FiSend className="h-3 w-3" /> Add Note
            </button>
          </div>

          <div className="mt-3 space-y-2.5 max-h-52 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No operator notes. Automatic telemetry alerts are not integrated.</p>
            ) : (
              alerts.map((a) => {
                const isCritical = a.severity === "critical";
                const isWarning = a.severity === "warning";
                const borderCls = isCritical
                  ? "border-red-200 bg-red-50/40 dark:border-red-950/60 dark:bg-red-950/20"
                  : isWarning
                  ? "border-amber-200 bg-amber-50/40 dark:border-amber-950/60 dark:bg-amber-950/20"
                  : "border-sky-200 bg-sky-50/40 dark:border-sky-950/60 dark:bg-sky-950/20";

                const chipCls = isCritical
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : isWarning
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";

                return (
                  <div
                    key={a.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xs border p-2.5 text-xs transition ${borderCls}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${chipCls}`}>
                          {a.severity}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {a.title}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          &bull; {a.targetId} &bull; {relativeTime(a.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                        {a.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {a.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleAcknowledgeAlert(a.id)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
                        >
                          Ack
                        </button>
                      )}
                      {a.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => handleResolveAlert(a.id)}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteAlert(a.id)}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Delete Alert"
                      >
                        <FiXCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      <ZoneDetailModal open={!!selZone} zone={selZone} onClose={() => setSelZone(null)} />
      <HouseholdDetailModal
        open={!!selHousehold}
        household={selHousehold}
        onClose={() => setSelHousehold(null)}
      />
      <DigitalTwinAlertModal
        open={alertModalOpen}
        onClose={() => setAlertModalOpen(false)}
        onDispatch={handleDispatchAlert}
      />
    </div>
  );
}
