# HydroTwin Contamination Risk Prediction Service

Pillar 4 of the HydroTwin Digital Twin Platform: Spatial-Temporal Graph Neural Network (ST-GNN) virtual IoT telemetry inference engine for intermittent water supply (IWS) contamination hazard prediction in the **Kaduwela / Bomiriya DMA 10_37_05** distribution network.

---

## Service Architecture

```
services/Contamination_Service/
├── api/                             # FastAPI microservice
│   ├── __init__.py
│   └── main.py                      # REST endpoints (/predict_risk, /health, /network)
├── data/
│   ├── raw/
│   │   └── kaduwela_bomiriya_clean.inp    # EPANET hydraulic network model (1,561 junctions)
│   └── processed/
│       ├── kaduwela_iws_risk_dataset.npz  # Topology, features & IWS ground truth
│       ├── kaduwela_risk_hour_02.geojson  # Georeferenced network topology (SLD99/WGS84)
│       ├── kaduwela_risk_hour_10.geojson
│       └── kaduwela_risk_hour_22.geojson
├── frontend/                        # Interactive SCADA & GIS Digital Twin Dashboard
│   ├── public/
│   │   ├── data/processed/          # Served GeoJSON network topology
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── App.jsx                  # Main GIS dashboard, telemetry simulator & HUD
│   │   ├── index.css                # SCADA dark theme & Leaflet custom styling
│   │   └── main.jsx                 # React 19 entry point
│   ├── index.html                   # Explicit Leaflet CSS and Google Fonts
│   ├── package.json                 # Frontend dependencies (React, Leaflet, Tailwind)
│   ├── postcss.config.js
│   └── vite.config.js               # Dev server on port 5173 with API proxy
├── models/
│   └── kaduwela_graphsage_risk_model.pt  # Trained Residual GraphSAGE weights
├── notebooks/
│   └── GNN_Development.ipynb       # Research pipeline, benchmarks & validation
├── src/
│   ├── __init__.py
│   └── inference.py                 # Core PyTorch Geometric inference engine & LRU Dijkstra
├── tests/
│   └── test_api_and_inference.py    # Unit & latency test suite (< 10 ms round-trip)
├── .gitignore
├── README.md
└── requirements.txt                 # Python dependencies (PyTorch, PyG, WNTR, FastAPI)
```

---

## Quick Start Guide

### 1. Start the FastAPI Backend Microservice
From the repository root:
```bash
python -m uvicorn services.Contamination_Service.api.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at:
* Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### 2. Start the GIS SCADA Frontend Dashboard
In a separate terminal:
```bash
cd services/Contamination_Service/frontend
npm run dev
```
Open your browser at:
* Dashboard: [http://localhost:5173](http://localhost:5173)

### 3. Run the Verification Test Suite
```bash
python services/Contamination_Service/tests/test_api_and_inference.py
```

---

## API Endpoints

### `POST /predict_risk`
* **Request Payload**:
  ```json
  {
    "sensor_junction_id": "J_1",
    "sensor_pressure_bar": 3.40
  }
  ```
* **Response Payload**:
  * `mean_network_risk`: Mean risk across all 1,561 junctions $[0.0, 1.0]$.
  * `high_risk_junctions_count`: Count of junctions with $R > 0.70$.
  * `advisory`: `"NORMAL SUPPLY"` vs. `"BOIL WATER NOTICE / HAZARD ISOLATION"`.
  * `latency_ms`: Round-trip neural inference execution latency ($< 15\text{ ms}$).
  * `predictions`: Object mapping each junction ID (`J_1` through `J_1561`) to its predicted risk.
  * `alert_event`: Dispatched event payload targeting Member 1's household meter service when $R > 0.70$.
