import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import axios from "axios";
import {
  Activity,
  Radio,
  Sliders,
  Play,
  Pause,
  SkipForward,
  AlertTriangle,
  ShieldCheck,
  Maximize2,
  Layers,
  Cpu,
  Wifi,
  WifiOff,
  Gauge,
  BarChart3,
  ListFilter,
  MapPin,
  TrendingDown,
} from "lucide-react";

// API Endpoint configuration
const API_BASE_URL = "http://127.0.0.1:8000";

// Tile layer URLs
const BASEMAP_TILES = {
  googleHybrid: {
    name: "Google Satellite",
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps Satellite",
  },
  googleRoad: {
    name: "Google Street",
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: "&copy; Google Maps Street",
  },
  dark: {
    name: "Dark Carto",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  },
};

// 24-hour Intermittent Water Supply (IWS) typical pressure curve (bar)
const IWS_DIURNAL_PRESSURE_CYCLE = [
  3.40, 3.40, 3.40, 3.40, 2.80, 1.80, 0.80, 0.00, 0.00, 0.00, 0.00, 0.40,
  1.20, 2.20, 3.20, 3.40, 3.40, 3.10, 2.00, 0.80, 0.00, 0.00, 1.50, 3.40,
];

// Helper: Map Controller to handle smooth re-centering
function MapRecenterControl({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

export default function App() {
  // Network data state
  const [junctions, setJunctions] = useState([]);
  const [isLoadingTopology, setIsLoadingTopology] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);

  // Active IoT Sensor Anchor (Default J_1)
  const [sensorAnchorId, setSensorAnchorId] = useState("J_1");
  const [anchorInputText, setAnchorInputText] = useState("J_1");

  // Transducer Pressure Telemetry (0.00 to 4.00 bar)
  const [pressureBar, setPressureBar] = useState(3.40);

  // 24-Hour Cycle Loop State
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [currentHour, setCurrentHour] = useState(0);

  // ST-GNN Risk Predictions State
  const [predictions, setPredictions] = useState({});
  const [latencyMs, setLatencyMs] = useState(0);
  const [summaryData, setSummaryData] = useState({
    meanRisk: 0.001,
    highRiskCount: 0,
    warningCount: 0,
    safeCount: 1561,
    advisory: "NORMAL SUPPLY — POSITIVE PRESSURE MAINTAINED",
    statusLevel: "SAFE",
  });

  // Engineering Depth Analytics States
  const [hydraulicCorrelation, setHydraulicCorrelation] = useState({
    inlet_pressure_bar: 3.40,
    inlet_head_m: 34.67,
    nominal_head_m: 34.67,
    avg_head_deficit_m: 0.00,
    head_deficit_percentage: 0.0,
    hydraulic_state: "POSITIVE HEAD GRADIENT — PRESSURIZED FLOW",
  });

  const [zoneSeverity, setZoneSeverity] = useState({
    safe: { count: 1561, percentage: 100.0, label: "Safe Zone (Positive Pressure)" },
    stagnation: { count: 0, percentage: 0.0, label: "Stagnation Zone" },
    critical: { count: 0, percentage: 0.0, label: "Critical Ingress Hazard Zone" },
  });

  const [topRiskJunctions, setTopRiskJunctions] = useState([]);

  // GIS Map State
  const [activeBasemap, setActiveBasemap] = useState("googleHybrid");
  const [mapCenter, setMapCenter] = useState([6.935, 79.984]);
  const [mapZoom, setMapZoom] = useState(14);

  // 1. Load 1,561 Node Network Topology from GeoJSON
  useEffect(() => {
    const loadTopology = async () => {
      try {
        const resp = await fetch("/data/processed/kaduwela_risk_hour_02.geojson");
        const data = await resp.json();

        const cosLat = Math.cos((6.935 * Math.PI) / 180.0);
        const parsedJunctions = data.features.map((feat) => {
          const coords = feat.geometry.coordinates;
          const x = coords[0];
          const y = coords[1];

          // Project Sri Lanka Grid 1999 (SLD99) to WGS84
          const lat = 6.935 + (y - 492508.05) / 110700.0;
          const lon = 79.984 + (x - 412057.37) / (110700.0 * cosLat);

          return {
            id: feat.properties.junction_id,
            lat,
            lon,
            elevation: feat.properties.elevation_m || 12.0,
          };
        });

        setJunctions(parsedJunctions);
        setIsLoadingTopology(false);
      } catch (err) {
        console.error("Error loading local GeoJSON topology:", err);
        setIsLoadingTopology(false);
      }
    };

    loadTopology();
  }, []);

  // 2. Client-side Hydraulic Fallback Simulation Engine
  const runHydraulicFallback = useCallback(
    (anchorId, pBar, nodeList) => {
      const pDeficit = Math.max(0.0, 3.40 - pBar);
      const baseRisk = Math.min(1.0, (pDeficit / 3.40) ** 1.3);

      const preds = {};
      let highCount = 0;
      let warnCount = 0;
      let safeCount = 0;

      // Find anchor coords
      const anchorNode = nodeList.find((n) => n.id === anchorId) || nodeList[0];
      const aLat = anchorNode ? anchorNode.lat : 6.935;
      const aLon = anchorNode ? anchorNode.lon : 79.984;

      nodeList.forEach((node) => {
        // Approximate distance decay in km
        const dKm =
          Math.sqrt((node.lat - aLat) ** 2 + (node.lon - aLon) ** 2) * 111.0;
        const distAttenuation = Math.max(0.2, 1.0 - dKm / 6.0);

        // Elevation effect (higher elevation suffers more depressurization)
        const elevFactor = 1.0 + (node.elevation - 12.0) * 0.015;

        const nodeRisk = Math.min(
          1.0,
          Math.max(0.0, baseRisk * distAttenuation * elevFactor)
        );
        preds[node.id] = parseFloat(nodeRisk.toFixed(4));

        if (nodeRisk > 0.70) highCount++;
        else if (nodeRisk >= 0.30) warnCount++;
        else safeCount++;
      });

      const totalNodes = nodeList.length || 1561;
      const meanR =
        totalNodes > 0
          ? Object.values(preds).reduce((a, b) => a + b, 0) / totalNodes
          : 0.0;

      let adv = "NORMAL SUPPLY — POSITIVE PRESSURE MAINTAINED";
      let statusLvl = "SAFE";
      if (meanR > 0.70 || highCount > 300) {
        adv = "CRITICAL: BOIL WATER NOTICE / HAZARD ISOLATION";
        statusLvl = "CRITICAL";
      } else if (meanR >= 0.30 || warnCount > 200) {
        adv = "DEPRESSURIZATION WARNING — STAGNATION RISK";
        statusLvl = "WARNING";
      }

      setPredictions(preds);
      setSummaryData({
        meanRisk: parseFloat(meanR.toFixed(4)),
        highRiskCount: highCount,
        warningCount: warnCount,
        safeCount: safeCount,
        advisory: adv,
        statusLevel: statusLvl,
      });

      // Compute hydraulic head correlation
      const inletHead = parseFloat((pBar * 10.1972).toFixed(2));
      const nomHead = 34.67;
      const avgDeficit = parseFloat(Math.max(0.0, nomHead - inletHead).toFixed(2));
      let hydState = "POSITIVE HEAD GRADIENT — PRESSURIZED FLOW";
      if (pBar < 1.5) {
        hydState = "NEGATIVE HEAD DEFICIT — BACK-SIPHONAGE HAZARD";
      } else if (pBar < 3.0) {
        hydState = "HYDRAULIC DEPRESSURIZATION — STAGNATION RISK";
      }

      setHydraulicCorrelation({
        inlet_pressure_bar: pBar,
        inlet_head_m: inletHead,
        nominal_head_m: nomHead,
        avg_head_deficit_m: avgDeficit,
        head_deficit_percentage: parseFloat(((avgDeficit / nomHead) * 100).toFixed(1)),
        hydraulic_state: hydState,
      });

      // Compute Zone Breakdown
      setZoneSeverity({
        safe: {
          count: safeCount,
          percentage: parseFloat(((safeCount / totalNodes) * 100).toFixed(1)),
          label: "Safe Zone (Positive Pressure)",
        },
        stagnation: {
          count: warnCount,
          percentage: parseFloat(((warnCount / totalNodes) * 100).toFixed(1)),
          label: "Stagnation Zone",
        },
        critical: {
          count: highCount,
          percentage: parseFloat(((highCount / totalNodes) * 100).toFixed(1)),
          label: "Critical Ingress Hazard Zone",
        },
      });

      // Compute Top 5 High-Risk Junctions
      const sorted = Object.entries(preds)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, r], idx) => {
          const match = nodeList.find((n) => n.id === id);
          return {
            rank: idx + 1,
            junction_id: id,
            elevation_m: match ? match.elevation : 12.0,
            risk_index: r,
            risk_percentage: parseFloat((r * 100).toFixed(1)),
          };
        });

      setTopRiskJunctions(sorted);
    },
    []
  );

  // 3. Asynchronous ST-GNN Risk Prediction Caller
  const fetchRiskPrediction = useCallback(
    async (anchorId, pBar) => {
      const t0 = performance.now();
      try {
        const response = await axios.post(
          `${API_BASE_URL}/predict_risk`,
          {
            sensor_junction_id: anchorId,
            sensor_pressure_bar: parseFloat(pBar),
          },
          { timeout: 1200 }
        );

        const data = response.data;
        const totalElapsed = performance.now() - t0;
        setLatencyMs(parseFloat(totalElapsed.toFixed(1)));
        setBackendOnline(true);

        setPredictions(data.predictions || {});
        setSummaryData({
          meanRisk: data.mean_network_risk,
          highRiskCount: data.high_risk_junctions_count,
          warningCount: data.warning_junctions_count,
          safeCount: data.safe_junctions_count,
          advisory: data.advisory,
          statusLevel:
            data.high_risk_junctions_count > 300
              ? "CRITICAL"
              : data.warning_junctions_count > 200
              ? "WARNING"
              : "SAFE",
        });

        if (data.hydraulic_correlation) {
          setHydraulicCorrelation(data.hydraulic_correlation);
        }

        if (data.zone_severity_breakdown) {
          setZoneSeverity({
            safe: data.zone_severity_breakdown.safe_zone,
            stagnation: data.zone_severity_breakdown.stagnation_zone,
            critical: data.zone_severity_breakdown.critical_zone,
          });
        }

        if (data.top_risk_junctions) {
          setTopRiskJunctions(data.top_risk_junctions);
        }
      } catch (err) {
        // Backend offline -> Seamless failover to client-side hydraulic simulation
        setBackendOnline(false);
        setLatencyMs(parseFloat((performance.now() - t0).toFixed(1)));
        if (junctions.length > 0) {
          runHydraulicFallback(anchorId, pBar, junctions);
        }
      }
    },
    [junctions, runHydraulicFallback]
  );

  // Debounced telemetry update when pressure or anchor changes
  const debounceTimerRef = useRef(null);
  useEffect(() => {
    if (junctions.length === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchRiskPrediction(sensorAnchorId, pressureBar);
    }, 40);

    return () => clearTimeout(debounceTimerRef.current);
  }, [sensorAnchorId, pressureBar, junctions, fetchRiskPrediction]);

  // 4. Automated 24-Hour Cycle Loop
  useEffect(() => {
    let interval = null;
    if (isCycleRunning) {
      interval = setInterval(() => {
        setCurrentHour((prev) => {
          const nextHour = (prev + 1) % 24;
          const nextPressure = IWS_DIURNAL_PRESSURE_CYCLE[nextHour];
          setPressureBar(nextPressure);
          return nextHour;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCycleRunning]);

  // Handle sensor anchor input change / submit
  const handleAnchorSubmit = (e) => {
    e.preventDefault();
    const cleanId = anchorInputText.trim().toUpperCase();
    const match = junctions.find((j) => j.id.toUpperCase() === cleanId);
    if (match) {
      setSensorAnchorId(match.id);
      setAnchorInputText(match.id);
    } else if (cleanId.startsWith("J_")) {
      setSensorAnchorId(cleanId);
    }
  };

  // Color helper based on risk index
  const getNodeColor = useCallback((risk) => {
    if (risk === undefined || risk === null) return "#22c55e";
    if (risk > 0.70) return "#ef4444"; // Red: Critical Hazard
    if (risk >= 0.30) return "#f59e0b"; // Amber: Stagnation Warning
    return "#22c55e"; // Green: Safe / Positive Pressure
  }, []);

  // Active anchor node object
  const activeAnchorNode = useMemo(
    () => junctions.find((j) => j.id === sensorAnchorId),
    [junctions, sensorAnchorId]
  );

  // Jump to specific junction from table
  const handleFocusJunction = (juncId) => {
    const target = junctions.find((j) => j.id === juncId);
    if (target) {
      setMapCenter([target.lat, target.lon]);
      setMapZoom(16);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* ============================================================== */}
      {/* LEFT SIDEBAR: SCADA TELEMETRY & ENGINEERING DEPTH ANALYTICS    */}
      {/* ============================================================== */}
      <aside className="w-[410px] shrink-0 border-r border-slate-800 bg-slate-900/95 flex flex-col justify-between overflow-y-auto p-4 z-20 shadow-2xl backdrop-blur-md">
        <div className="space-y-4">
          {/* Header Brand */}
          <div className="border-b border-slate-800/80 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Activity className="h-5 w-5 animate-pulse" />
                <h1 className="text-sm font-bold tracking-tight text-white uppercase">
                  HydroTwin <span className="text-cyan-400 text-[10px] font-mono ml-1 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800">ST-GNN</span>
                </h1>
              </div>

              {/* Backend Connectivity Status Badge */}
              <div
                className={`flex items-center space-x-1.5 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border ${
                  backendOnline
                    ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                    : "bg-amber-950/80 text-amber-400 border-amber-800"
                }`}
                title={backendOnline ? "Connected to FastAPI ST-GNN Server" : "Using Hydraulic Physics Heuristic Fallback"}
              >
                {backendOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                <span>{backendOnline ? "GNN LIVE" : "FALLBACK"}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              Kaduwela DMA 10_37_05 &bull; 1,561 Junction Digital Twin
            </p>
          </div>

          {/* Module 1: Dynamic Virtual IoT Sensor Placement */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-300">
                <Radio className="h-3.5 w-3.5 text-cyan-400" />
                <span>Virtual IoT Sensor Anchor</span>
              </div>
              <span className="text-[9px] bg-cyan-950/80 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800/60 font-mono">
                1,561 NODES
              </span>
            </div>

            <form onSubmit={handleAnchorSubmit} className="flex space-x-2">
              <input
                type="text"
                list="junction-ids-list"
                value={anchorInputText}
                onChange={(e) => setAnchorInputText(e.target.value)}
                placeholder="e.g. J_1, J_500, J_1200"
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 transition"
              />
              <datalist id="junction-ids-list">
                {junctions.slice(0, 80).map((j) => (
                  <option key={j.id} value={j.id} />
                ))}
              </datalist>
              <button
                type="submit"
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-xs transition"
              >
                Bind
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Active Sensor Anchor:</span>
              <span className="font-mono font-bold text-cyan-400 text-xs">
                {sensorAnchorId} {activeAnchorNode ? `(${activeAnchorNode.elevation}m)` : ""}
              </span>
            </div>
          </div>

          {/* Module 2: IoT Telemetry Input & Presets */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-1.5 font-semibold text-emerald-400">
                <Sliders className="h-3.5 w-3.5" />
                <span>Transducer Telemetry</span>
              </div>
              <span className="font-mono text-emerald-400 font-bold text-xs bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                {pressureBar.toFixed(2)} bar
              </span>
            </div>

            <input
              type="range"
              min="0.00"
              max="4.00"
              step="0.05"
              value={pressureBar}
              onChange={(e) => {
                setIsCycleRunning(false);
                setPressureBar(parseFloat(e.target.value));
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />

            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => {
                  setIsCycleRunning(false);
                  setPressureBar(3.40);
                }}
                className={`py-1 px-1.5 text-[10px] font-semibold rounded border transition ${
                  pressureBar === 3.40
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500"
                    : "bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800"
                }`}
              >
                Normal (3.4b)
              </button>
              <button
                onClick={() => {
                  setIsCycleRunning(false);
                  setPressureBar(0.80);
                }}
                className={`py-1 px-1.5 text-[10px] font-semibold rounded border transition ${
                  pressureBar === 0.80
                    ? "bg-amber-500/20 text-amber-300 border-amber-500"
                    : "bg-slate-900 border-slate-700/80 text-amber-400 hover:bg-slate-800"
                }`}
              >
                Low (0.8b)
              </button>
              <button
                onClick={() => {
                  setIsCycleRunning(false);
                  setPressureBar(0.00);
                }}
                className={`py-1 px-1.5 text-[10px] font-semibold rounded border transition ${
                  pressureBar === 0.00
                    ? "bg-rose-500/20 text-rose-300 border-rose-500"
                    : "bg-slate-900 border-slate-700/80 text-rose-400 hover:bg-slate-800"
                }`}
              >
                Cut-Off (0.0b)
              </button>
            </div>
          </div>

          {/* Module 3: 24-Hour IWS Simulation Controls */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200">24h IWS Cycle Simulation</span>
              <span className="font-mono text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50 text-[11px]">
                Hour {currentHour.toString().padStart(2, "0")}:00
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setIsCycleRunning(!isCycleRunning)}
                className={`col-span-2 py-1 px-2.5 rounded-lg flex items-center justify-center space-x-1.5 text-xs font-semibold transition ${
                  isCycleRunning
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30"
                }`}
              >
                {isCycleRunning ? (
                  <>
                    <Pause className="h-3 w-3" />
                    <span>Pause Cycle</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />
                    <span>Stream 24h Loop</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setIsCycleRunning(false);
                  setCurrentHour((prev) => {
                    const next = (prev + 1) % 24;
                    setPressureBar(IWS_DIURNAL_PRESSURE_CYCLE[next]);
                    return next;
                  });
                }}
                className="py-1 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg flex items-center justify-center text-xs transition"
                title="Step forward 1 hour"
              >
                <SkipForward className="h-3 w-3 mr-1" />
                <span>+1h</span>
              </button>
            </div>
          </div>

          {/* Module 4: Operational Safety Advisory SCADA Banner */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              summaryData.highRiskCount > 300 || summaryData.meanRisk > 0.70
                ? "bg-rose-950/50 border-rose-800 text-rose-200"
                : summaryData.warningCount > 200 || summaryData.meanRisk >= 0.30
                ? "bg-amber-950/50 border-amber-800 text-amber-200"
                : "bg-emerald-950/50 border-emerald-800 text-emerald-200"
            }`}
          >
            <div className="flex items-start space-x-2">
              {summaryData.highRiskCount > 300 || summaryData.meanRisk > 0.70 ? (
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h4 className="text-[11px] font-bold uppercase tracking-wider">
                  {summaryData.advisory}
                </h4>
                <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                  {summaryData.highRiskCount > 0
                    ? `${summaryData.highRiskCount} nodes in back-siphonage contamination hazard.`
                    : summaryData.warningCount > 0
                    ? `${summaryData.warningCount} nodes in depressurized stagnation.`
                    : "100% positive pressure across all 1,561 junctions."}
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================== */}
          {/* ENGINEERING DEPTH ANALYTICS 1: HYDRAULIC PRESSURE & DEFICIT */}
          {/* ========================================================== */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-slate-200 font-semibold text-xs">
                <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                <span>Hydraulic Head vs. Deficit Correlation</span>
              </div>
              <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60">
                EPANET/WNTR
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-0.5">
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block font-sans">Active Inlet Head</span>
                <span className="text-white font-bold text-xs">{hydraulicCorrelation.inlet_head_m} m</span>
                <span className="text-slate-500 text-[9px] block">({hydraulicCorrelation.inlet_pressure_bar} bar)</span>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[9px] text-slate-400 block font-sans">Avg Head Deficit (ΔH)</span>
                <span
                  className={`font-bold text-xs ${
                    hydraulicCorrelation.avg_head_deficit_m > 15
                      ? "text-rose-400"
                      : hydraulicCorrelation.avg_head_deficit_m > 5
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  {hydraulicCorrelation.avg_head_deficit_m} m
                </span>
                <span className="text-slate-500 text-[9px] block">
                  ({hydraulicCorrelation.head_deficit_percentage}% deficit)
                </span>
              </div>
            </div>

            {/* Deficit Visual Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                <span>Head Loss Factor</span>
                <span>{hydraulicCorrelation.head_deficit_percentage}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
                <div
                  className={`h-full transition-all duration-300 ${
                    hydraulicCorrelation.head_deficit_percentage > 50
                      ? "bg-rose-500"
                      : hydraulicCorrelation.head_deficit_percentage > 15
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, hydraulicCorrelation.head_deficit_percentage)}%` }}
                />
              </div>
            </div>

            <div className="text-[9px] font-mono text-slate-400 pt-0.5 flex items-center space-x-1">
              <TrendingDown className="h-3 w-3 text-cyan-400 shrink-0" />
              <span className="truncate">{hydraulicCorrelation.hydraulic_state}</span>
            </div>
          </div>

          {/* ========================================================== */}
          {/* ENGINEERING DEPTH ANALYTICS 2: DMA ZONE SEVERITY BREAKDOWN */}
          {/* ========================================================== */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-slate-200 font-semibold text-xs">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                <span>DMA Zone Severity Breakdown</span>
              </div>
              <span className="text-[9px] font-mono text-slate-400">
                1,561 Nodes
              </span>
            </div>

            {/* Multi-segment Horizontal Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex shadow-inner">
              <div
                className="bg-[#22c55e] h-full transition-all duration-300"
                style={{ width: `${zoneSeverity.safe.percentage}%` }}
                title={`Safe: ${zoneSeverity.safe.count} (${zoneSeverity.safe.percentage}%)`}
              />
              <div
                className="bg-[#f59e0b] h-full transition-all duration-300"
                style={{ width: `${zoneSeverity.stagnation.percentage}%` }}
                title={`Stagnation: ${zoneSeverity.stagnation.count} (${zoneSeverity.stagnation.percentage}%)`}
              />
              <div
                className="bg-[#ef4444] h-full transition-all duration-300"
                style={{ width: `${zoneSeverity.critical.percentage}%` }}
                title={`Critical: ${zoneSeverity.critical.count} (${zoneSeverity.critical.percentage}%)`}
              />
            </div>

            {/* 3 Zone Metric Badges */}
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
              <div className="bg-emerald-950/40 border border-emerald-900/60 p-1.5 rounded-lg text-center">
                <span className="text-emerald-400 block font-bold">{zoneSeverity.safe.percentage}%</span>
                <span className="text-slate-400 text-[8px] font-sans block truncate">Safe (R&lt;0.3)</span>
                <span className="text-slate-500 text-[8px]">{zoneSeverity.safe.count} nodes</span>
              </div>
              <div className="bg-amber-950/40 border border-amber-900/60 p-1.5 rounded-lg text-center">
                <span className="text-amber-400 block font-bold">{zoneSeverity.stagnation.percentage}%</span>
                <span className="text-slate-400 text-[8px] font-sans block truncate">Stagnation</span>
                <span className="text-slate-500 text-[8px]">{zoneSeverity.stagnation.count} nodes</span>
              </div>
              <div className="bg-rose-950/40 border border-rose-900/60 p-1.5 rounded-lg text-center">
                <span className="text-rose-400 block font-bold">{zoneSeverity.critical.percentage}%</span>
                <span className="text-slate-400 text-[8px] font-sans block truncate">Hazard (R&gt;0.7)</span>
                <span className="text-slate-500 text-[8px]">{zoneSeverity.critical.count} nodes</span>
              </div>
            </div>
          </div>

          {/* ========================================================== */}
          {/* ENGINEERING DEPTH ANALYTICS 3: TOP 5 HIGH-RISK JUNCTIONS  */}
          {/* ========================================================== */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-slate-200 font-semibold text-xs">
                <ListFilter className="h-3.5 w-3.5 text-rose-400" />
                <span>Top 5 High-Risk Junctions</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono">Click to Inspect</span>
            </div>

            {topRiskJunctions.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-slate-800">
                <table className="w-full text-left text-[10px] font-mono">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-1 px-1.5 font-medium">#</th>
                      <th className="py-1 px-2 font-medium">Node ID</th>
                      <th className="py-1 px-1.5 font-medium">Elev</th>
                      <th className="py-1 px-2 font-medium text-right">Risk %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {topRiskJunctions.map((node) => (
                      <tr
                        key={node.junction_id}
                        onClick={() => handleFocusJunction(node.junction_id)}
                        className="hover:bg-slate-800/60 cursor-pointer transition"
                        title={`Click to focus map on ${node.junction_id}`}
                      >
                        <td className="py-1 px-1.5 text-slate-500 font-bold">{node.rank}</td>
                        <td className="py-1 px-2 font-bold text-cyan-300 flex items-center space-x-1">
                          <MapPin className="h-2.5 w-2.5 text-slate-500" />
                          <span>{node.junction_id}</span>
                        </td>
                        <td className="py-1 px-1.5 text-slate-400">{node.elevation_m}m</td>
                        <td className="py-1 px-2 text-right">
                          <span
                            className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                              node.risk_index > 0.70
                                ? "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                                : node.risk_index >= 0.30
                                ? "bg-amber-950/80 text-amber-400 border border-amber-800/60"
                                : "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                            }`}
                          >
                            {node.risk_percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-2 text-[10px] text-slate-500 font-mono">
                Computing top risk nodes...
              </div>
            )}
          </div>
        </div>

        {/* Footer Hardware & Model Telemetry */}
        <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex justify-between items-center font-mono">
          <div className="flex items-center space-x-1">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            <span>Residual GraphSAGE</span>
          </div>
          <div className="flex items-center space-x-1">
            <span>Latency:</span>
            <span className="text-emerald-400 font-bold">{latencyMs} ms</span>
          </div>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* RIGHT GIS VIEWPORT: LEAFLET CANVAS MAP & FLOATING HUD         */}
      {/* ============================================================== */}
      <main className="flex-1 relative h-full w-full overflow-hidden bg-slate-950">
        {/* Top-Left: Basemap Switcher */}
        <div className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-2xl flex space-x-1">
          <div className="flex items-center px-2 py-1 text-xs text-slate-400 border-r border-slate-800 mr-1">
            <Layers className="h-3.5 w-3.5 mr-1 text-cyan-400" />
            <span className="font-medium text-[11px]">Basemap</span>
          </div>
          {Object.entries(BASEMAP_TILES).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setActiveBasemap(key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition font-medium ${
                activeBasemap === key
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-md"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {config.name}
            </button>
          ))}
          <button
            onClick={() => {
              setMapCenter([6.935, 79.984]);
              setMapZoom(14);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg transition ml-1"
            title="Re-center to Kaduwela DMA bounds"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Top-Right: Network Health Summary Card */}
        <div className="absolute top-4 right-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-6 text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
              DMA Risk Index
            </span>
            <span
              className={`text-sm font-bold ${
                summaryData.meanRisk > 0.70
                  ? "text-rose-400"
                  : summaryData.meanRisk >= 0.30
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {(summaryData.meanRisk * 100).toFixed(1)}%
            </span>
          </div>

          <div className="w-[1px] h-6 bg-slate-800" />

          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
              Sensor Anchor
            </span>
            <span className="text-cyan-400 font-bold text-sm">
              {sensorAnchorId}
            </span>
          </div>

          <div className="w-[1px] h-6 bg-slate-800" />

          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
              Hazard Nodes
            </span>
            <span
              className={`text-sm font-bold ${
                summaryData.highRiskCount > 0 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {summaryData.highRiskCount} / {junctions.length}
            </span>
          </div>
        </div>

        {/* Bottom-Right: Color Legend HUD */}
        <div className="absolute bottom-6 right-6 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3.5 py-2.5 rounded-xl shadow-xl text-[11px] font-sans space-y-1.5">
          <div className="font-semibold text-slate-200 text-xs pb-1 border-b border-slate-800">
            Contamination Hazard Risk
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 rounded-full bg-[#22c55e] inline-block" />
            <span className="text-slate-300">Safe: Positive Pressure (&lt; 0.30)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 rounded-full bg-[#f59e0b] inline-block" />
            <span className="text-slate-300">Warning: Stagnation (0.30 - 0.70)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="h-3 w-3 rounded-full bg-[#ef4444] inline-block" />
            <span className="text-slate-300">Critical: Back-Siphonage (&gt; 0.70)</span>
          </div>
        </div>

        {/* Leaflet Map with Canvas Renderer for 60fps smooth rendering */}
        {!isLoadingTopology && junctions.length > 0 ? (
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            preferCanvas={true}
            zoomControl={false}
            className="h-full w-full"
          >
            <TileLayer
              attribution={BASEMAP_TILES[activeBasemap].attribution}
              url={BASEMAP_TILES[activeBasemap].url}
              maxZoom={20}
            />

            <MapRecenterControl center={mapCenter} zoom={mapZoom} />

            {/* 1,561 Canvas Circle Markers */}
            {junctions.map((junc) => {
              const isAnchor = junc.id === sensorAnchorId;
              const risk = predictions[junc.id] !== undefined
                ? predictions[junc.id]
                : summaryData.meanRisk;
              const color = getNodeColor(risk);

              return (
                <CircleMarker
                  key={junc.id}
                  center={[junc.lat, junc.lon]}
                  radius={isAnchor ? 8 : 3.5}
                  pathOptions={{
                    color: isAnchor ? "#06b6d4" : color,
                    weight: isAnchor ? 3.5 : 0.8,
                    fillColor: isAnchor ? "#ffffff" : color,
                    fillOpacity: isAnchor ? 1.0 : 0.85,
                  }}
                  eventHandlers={{
                    click: () => {
                      setSensorAnchorId(junc.id);
                      setAnchorInputText(junc.id);
                    },
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[160px] text-slate-100 font-sans">
                      <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-700">
                        <strong className="text-sm font-bold text-white font-mono">
                          {junc.id}
                        </strong>
                        {isAnchor && (
                          <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/40 font-mono">
                            ACTIVE ANCHOR
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-300 space-y-1 my-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Elevation:</span>
                          <span className="font-mono">{junc.elevation} m</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Hazard Risk:</span>
                          <span
                            className="font-bold font-mono"
                            style={{ color }}
                          >
                            {(risk * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Status:</span>
                          <span
                            className="font-bold text-[10px]"
                            style={{ color }}
                          >
                            {risk > 0.70
                              ? "CRITICAL BACK-SIPHONAGE"
                              : risk >= 0.30
                              ? "STAGNATION WARNING"
                              : "SAFE SUPPLY"}
                          </span>
                        </div>
                      </div>

                      {!isAnchor && (
                        <button
                          onClick={() => {
                            setSensorAnchorId(junc.id);
                            setAnchorInputText(junc.id);
                          }}
                          className="w-full mt-1.5 py-1 px-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded text-[11px] font-bold transition shadow"
                        >
                          Bind Virtual IoT Anchor
                        </button>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-950 text-cyan-400 text-sm font-mono space-x-2">
            <Activity className="h-5 w-5 animate-spin" />
            <span>Loading Kaduwela Water Distribution Network Topology...</span>
          </div>
        )}
      </main>
    </div>
  );
}
