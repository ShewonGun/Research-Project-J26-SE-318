"""
Unit and Integration Test Suite for Contamination Service ST-GNN & FastAPI.
Tests model inference accuracy, response latency (< 100 ms), and API endpoints.
"""

import os
import sys
import time

current_dir = os.path.dirname(os.path.abspath(__file__))
service_dir = os.path.abspath(os.path.join(current_dir, ".."))
if service_dir not in sys.path:
    sys.path.insert(0, service_dir)

import asyncio
from src.inference import ContaminationRiskPredictor, get_predictor
from api.main import (
    app,
    health_check,
    get_all_junctions,
    predict_contamination_risk,
    RiskPredictionRequest,
)


def test_predictor_initialization():
    print("--- Test 1: Predictor Initialization ---")
    predictor = get_predictor()
    assert predictor.num_nodes == 1561, f"Expected 1561 nodes, got {predictor.num_nodes}"
    assert len(predictor.junction_names) == 1561
    assert "J_1" in predictor.name_to_idx
    print("[PASS] Predictor loaded 1,561 junctions successfully.")


def test_normal_pumping_preset():
    print("\n--- Test 2: Normal Pumping Preset (3.4 bar) ---")
    predictor = get_predictor()
    res = predictor.predict(sensor_junction_id="J_1", sensor_pressure_bar=3.40)
    assert res["status"] == "success"
    assert res["mean_network_risk"] < 0.10, f"Expected safe mean risk, got {res['mean_network_risk']}"
    assert res["high_risk_junctions_count"] == 0, f"Expected 0 high risk nodes, got {res['high_risk_junctions_count']}"
    assert "NORMAL" in res["advisory"]
    assert res["alert_event"]["emit_event"] is False
    print(f"[PASS] Normal Pumping: Mean Risk = {res['mean_network_risk']}, High Risk Nodes = {res['high_risk_junctions_count']}")


def test_supply_cutoff_preset():
    print("\n--- Test 3: Supply Cut-Off Preset (0.0 bar) ---")
    predictor = get_predictor()
    res = predictor.predict(sensor_junction_id="J_1", sensor_pressure_bar=0.00)
    assert res["status"] == "success"
    assert res["mean_network_risk"] > 0.70, f"Expected high mean risk, got {res['mean_network_risk']}"
    assert res["high_risk_junctions_count"] > 1000, f"Expected >1000 high risk nodes, got {res['high_risk_junctions_count']}"
    assert "CRITICAL" in res["advisory"]
    assert res["alert_event"]["emit_event"] is True
    assert res["alert_event"]["action"] == "ISOLATE_DOWNSTREAM_VALVES"
    assert res["alert_event"]["target"] == "Member_1_Household_Meter_Service"
    print(f"[PASS] Supply Cut-Off: Mean Risk = {res['mean_network_risk']}, High Risk Nodes = {res['high_risk_junctions_count']}, Member 1 Alert Emitted = {res['alert_event']['emit_event']}")


def test_fastapi_endpoints():
    print("\n--- Test 4: FastAPI Endpoints ---")

    # 1. Health endpoint
    health_data = health_check()
    assert health_data["status"] == "healthy"
    assert health_data["total_junctions"] == 1561
    print("[PASS] GET /health verified.")

    # 2. Junctions endpoint
    junc_data = get_all_junctions()
    assert len(junc_data) == 1561
    assert "lat" in junc_data[0] and "lon" in junc_data[0]
    print(f"[PASS] GET /network/junctions returned {len(junc_data)} nodes.")

    # 3. Predict endpoint (3.4 bar)
    t0 = time.perf_counter()
    req = RiskPredictionRequest(sensor_junction_id="J_7", sensor_pressure_bar=3.40)
    pred_data = asyncio.run(predict_contamination_risk(req))
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert pred_data["sensor_junction_id"] == "J_7"
    assert len(pred_data["predictions"]) == 1561
    assert elapsed_ms < 100.0, f"API took {elapsed_ms:.2f} ms (expected < 100 ms)"
    print(f"[PASS] POST /predict_risk execution latency: {elapsed_ms:.2f} ms (Internal model: {pred_data['latency_ms']} ms).")


if __name__ == "__main__":
    test_predictor_initialization()
    test_normal_pumping_preset()
    test_supply_cutoff_preset()
    test_fastapi_endpoints()
    print("\n" + "=" * 60)
    print("ALL PHASE 1 BACKEND & INFERENCE TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

