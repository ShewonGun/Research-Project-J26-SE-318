"""
FastAPI Microservice for ST-GNN Water Quality and Contamination Risk Prediction.
Serves Kaduwela / Bomiriya DMA 10_37_05 Digital Twin Virtual IoT Telemetry.
"""

import datetime
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure src package is importable
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, ".."))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from src.inference import get_predictor, ContaminationRiskPredictor

# Initialize FastAPI application
app = FastAPI(
    title="HydroTwin Contamination Prediction Service",
    description="Spatial-Temporal Graph Neural Network (ST-GNN) microservice predicting contamination hazard risk for Kaduwela / Bomiriya DMA.",
    version="1.0.0",
)

# Enable CORS for local frontend GIS dashboard communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global caches for junction metadata
_cached_junctions: Optional[List[Dict[str, Any]]] = None


class RiskPredictionRequest(BaseModel):
    sensor_junction_id: str = Field(
        default="J_1",
        description="Active physical or virtual IoT pressure sensor anchor node ID (e.g. 'J_1', 'J_500')",
    )
    sensor_pressure_bar: float = Field(
        default=3.40,
        ge=0.0,
        le=4.0,
        description="Simulated or real-time IoT transducer pressure reading in bar [0.00, 4.00]",
    )


class AlertEventPayload(BaseModel):
    emit_event: bool
    target: str
    action: str
    status_level: str
    trigger_pressure_bar: float
    sensor_anchor_id: str
    affected_junctions_count: int
    sample_affected_junctions: List[str]
    isolation_protocol: str
    timestamp: Optional[str] = None


class HydraulicCorrelation(BaseModel):
    inlet_pressure_bar: float
    inlet_head_m: float
    nominal_head_m: float
    avg_head_deficit_m: float
    head_deficit_percentage: float
    hydraulic_state: str


class ZoneMetric(BaseModel):
    count: int
    percentage: float
    threshold: str
    label: str


class ZoneSeverityBreakdown(BaseModel):
    safe_zone: ZoneMetric
    stagnation_zone: ZoneMetric
    critical_zone: ZoneMetric


class TopRiskJunction(BaseModel):
    rank: int
    junction_id: str
    elevation_m: float
    risk_index: float
    risk_percentage: float


class RiskPredictionResponse(BaseModel):
    status: str
    sensor_junction_id: str
    sensor_pressure_bar: float
    mean_network_risk: float
    high_risk_junctions_count: int
    warning_junctions_count: int
    safe_junctions_count: int
    hydraulic_correlation: HydraulicCorrelation
    zone_severity_breakdown: ZoneSeverityBreakdown
    top_risk_junctions: List[TopRiskJunction]
    advisory: str
    latency_ms: float
    predictions: Dict[str, float]
    alert_event: Optional[AlertEventPayload] = None



@app.on_event("startup")
async def startup_event():
    """Pre-warms the ST-GNN inference engine upon server startup."""
    print("[FastAPI] Warming up ContaminationRiskPredictor singleton...")
    predictor = get_predictor()
    _ = predictor.predict("J_1", 3.40)
    print("[FastAPI] Inference engine warmed up and ready for requests.")


@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint displaying model status and node count."""
    predictor = get_predictor()
    return {
        "status": "healthy",
        "service": "Contamination_Service",
        "dma": "Kaduwela_Bomiriya_10_37_05",
        "total_junctions": predictor.num_nodes,
        "model_architecture": "Residual GraphSAGE (5 in-channels, 64 hidden, Sigmoid out)",
        "device": str(predictor.device),
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }


@app.get("/network/metadata", tags=["Network"])
def get_network_metadata():
    """Returns DMA geographic bounds, total junctions, and reference coordinate details."""
    return {
        "dma_id": "Kaduwela_Bomiriya_10_37_05",
        "location": "Kaduwela - Bomiriya, Western Province, Sri Lanka",
        "center_coordinates": {"lat": 6.9350, "lon": 79.9840},
        "default_zoom": 14,
        "total_junctions": 1561,
        "nominal_supply_pressure_bar": 3.40,
        "cut_off_pressure_bar": 0.00,
        "coordinate_crs": "EPSG:5235 (Sri Lanka Grid 1999) projected to WGS84",
    }


@app.get("/network/junctions", tags=["Network"])
def get_all_junctions():
    """Returns list of all 1,561 junctions with IDs, elevations, and WGS84 coordinates."""
    global _cached_junctions
    if _cached_junctions is not None:
        return _cached_junctions

    geojson_path = os.path.join(
        parent_dir, "data", "processed", "kaduwela_risk_hour_02.geojson"
    )

    if not os.path.exists(geojson_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network GeoJSON topology file not found.",
        )

    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    junctions = []
    cos_lat = 0.992683  # cos(radians(6.935))

    for feat in data.get("features", []):
        props = feat.get("properties", {})
        coords = feat.get("geometry", {}).get("coordinates", [412057.37, 492508.05])
        x, y = coords[0], coords[1]

        # WGS84 coordinate projection from SLD99 grid
        lat = 6.935 + (y - 492508.05) / 110700.0
        lon = 79.984 + (x - 412057.37) / (110700.0 * cos_lat)

        junctions.append({
            "id": props.get("junction_id"),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "elevation_m": props.get("elevation_m", 12.0),
        })

    _cached_junctions = junctions
    return _cached_junctions


@app.post("/predict_risk", response_model=RiskPredictionResponse, tags=["Inference"])
async def predict_contamination_risk(payload: RiskPredictionRequest):
    """
    Consumes IoT sensor anchor and transducer pressure telemetry, computes
    spatial-temporal GraphSAGE risk predictions across all 1,561 pipe junctions,
    and returns nodal risk scores with Member 1 alert dispatch payloads.
    """
    t0 = time.perf_counter()
    predictor = get_predictor()

    try:
        result = predictor.predict(
            sensor_junction_id=payload.sensor_junction_id,
            sensor_pressure_bar=payload.sensor_pressure_bar,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference computation error: {str(e)}",
        )

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    result["latency_ms"] = latency_ms

    # Set real UTC ISO timestamp on alert event
    if "alert_event" in result and isinstance(result["alert_event"], dict):
        result["alert_event"]["timestamp"] = datetime.datetime.utcnow().isoformat() + "Z"

    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
