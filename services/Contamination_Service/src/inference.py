"""
ST-GNN Contamination Risk Inference Engine for Kaduwela / Bomiriya DMA 10_37_05.
Uses trained Residual GraphSAGE neural network to infer spatial-temporal
contamination hazard risks across 1,561 unmonitored pipe junctions.
"""

import os
from functools import lru_cache
from typing import Any, Dict, List, Optional
import networkx as nx
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv


class GraphSAGE_Residual(nn.Module):
    """
    Two-layer GraphSAGE architecture with Residual Skip Connection.
    Input: [N, 5] (Physical pressure, sensor mask, topological distance, delta P, nominal pressure)
    Output: [N, 1] (Contamination Hazard Risk bounded in [0, 1] via Sigmoid)
    """

    def __init__(self, in_channels: int = 5, hidden_dim: int = 64, out_channels: int = 1, dropout: float = 0.1):
        super(GraphSAGE_Residual, self).__init__()
        self.conv1 = SAGEConv(in_channels, hidden_dim)
        self.conv2 = SAGEConv(hidden_dim, hidden_dim)
        self.fc = nn.Linear(hidden_dim, out_channels)
        self.dropout = dropout

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        h1 = self.conv1(x, edge_index)
        h1 = F.relu(h1)
        h2 = self.conv2(h1, edge_index)
        h2 = F.relu(h2) + h1
        out = self.fc(h2)
        return torch.sigmoid(out)


class ContaminationRiskPredictor:
    """
    Inference orchestrator for virtual IoT sensor binding and
    real-time contamination hazard risk prediction.
    """

    def __init__(self, model_path: Optional[str] = None, dataset_path: Optional[str] = None):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

        if model_path is None:
            model_path = os.path.join(base_dir, "models", "kaduwela_graphsage_risk_model.pt")
        if dataset_path is None:
            dataset_path = os.path.join(base_dir, "data", "processed", "kaduwela_iws_risk_dataset.npz")

        self.model_path = model_path
        self.dataset_path = dataset_path

        # Device allocation
        self.device = torch.device("cpu")  # Sub-2ms on CPU; prevents GPU transfer overhead

        # Load dataset & topology
        print(f"[ST-GNN] Loading dataset and network topology from: {dataset_path}")
        dataset = np.load(dataset_path)
        self.junction_names: List[str] = [str(name) for name in dataset["junction_names"]]
        self.num_nodes: int = len(self.junction_names)
        self.name_to_idx: Dict[str, int] = {name: i for i, name in enumerate(self.junction_names)}
        self.idx_to_name: Dict[int, str] = {i: name for i, name in enumerate(self.junction_names)}

        edge_index_np = dataset["edge_index"]
        edge_attr_np = dataset["edge_attr"]
        self.edge_index = torch.tensor(edge_index_np, dtype=torch.long, device=self.device)

        # Build NetworkX topological pipe distance graph
        self.topo_graph = nx.Graph()
        for i in range(edge_index_np.shape[1]):
            u = int(edge_index_np[0, i])
            v = int(edge_index_np[1, i])
            length = float(edge_attr_np[i, 0])
            self.topo_graph.add_edge(u, v, weight=length)

        # Baseline nominal steady-state pressure (P_MAX = 40.0m head ≈ 3.92 bar)
        p_raw = dataset["X_pressures"]
        p_clip = np.clip(p_raw[:, 0, :], 0.0, 40.0)
        self.nominal_p: np.ndarray = (p_clip / 40.0).mean(axis=0).astype(np.float32)

        # Load Neural Network Model
        print(f"[ST-GNN] Loading GraphSAGE weights from: {model_path}")
        self.model = GraphSAGE_Residual(in_channels=5, hidden_dim=64, out_channels=1)
        checkpoint = torch.load(model_path, map_location=self.device)
        state_dict = checkpoint["model_state_dict"] if "model_state_dict" in checkpoint else checkpoint
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()

        # Load elevation metadata from GeoJSON
        geojson_path = os.path.join(base_dir, "data", "processed", "kaduwela_risk_hour_02.geojson")
        self.elevations: Dict[str, float] = {}
        if os.path.exists(geojson_path):
            try:
                import json
                with open(geojson_path, "r", encoding="utf-8") as f:
                    gj_data = json.load(f)
                    for feat in gj_data.get("features", []):
                        j_id = feat.get("properties", {}).get("junction_id")
                        elev = feat.get("properties", {}).get("elevation_m", 12.0)
                        if j_id:
                            self.elevations[j_id] = float(elev)
            except Exception as e:
                print(f"[ST-GNN] Warning loading elevations: {e}")

        print(f"[ST-GNN] Initialized successfully: {self.num_nodes} nodes, {edge_index_np.shape[1]} directed edges.")

    @lru_cache(maxsize=2048)
    def _compute_dijkstra_norm(self, anchor_idx: int) -> tuple:
        """
        Calculates normalized topological distance from anchor node to all nodes.
        Cached in memory so repeated requests for an anchor take 0.0ms.
        """
        try:
            dists = nx.single_source_dijkstra_path_length(self.topo_graph, source=anchor_idx, weight="weight")
        except Exception:
            dists = {}

        dist_vec = np.array([dists.get(i, 5000.0) for i in range(self.num_nodes)], dtype=np.float32)
        max_dist = dist_vec.max()
        if max_dist > 0:
            dist_norm = dist_vec / max_dist
        else:
            dist_norm = dist_vec

        return tuple(dist_norm.tolist())

    def predict(self, sensor_junction_id: str, sensor_pressure_bar: float) -> Dict[str, Any]:
        """
        Executes real-time inference given virtual sensor anchor and transducer pressure.

        Parameters:
            sensor_junction_id: e.g. "J_1", "J_500", "J_1200"
            sensor_pressure_bar: float in [0.00, 4.00] bar

        Returns:
            Dictionary with prediction risk per junction, mean risk, hazard counts,
            hydraulic pressure vs. risk correlation, zone severity breakdown,
            top 5 high-risk junctions, safety advisory, and Member 1 alert event.
        """
        # Fallback to J_1 if ID not found
        if sensor_junction_id not in self.name_to_idx:
            anchor_idx = 0
            sensor_junction_id = self.junction_names[0]
        else:
            anchor_idx = self.name_to_idx[sensor_junction_id]

        sensor_pressure_bar = float(np.clip(sensor_pressure_bar, 0.0, 4.0))

        # Convert pressure from bar to normalized head (1 bar ≈ 10.1972 m head; normalized by 40m)
        p_norm = float(np.clip((sensor_pressure_bar * 10.1972) / 40.0, 0.0, 1.0))
        anchor_nominal = float(self.nominal_p[anchor_idx])
        delta_p = float(max(0.0, anchor_nominal - p_norm))

        # Fetch cached topological distance vector
        dist_norm = np.array(self._compute_dijkstra_norm(anchor_idx), dtype=np.float32)

        # Assemble 5-channel feature tensor
        # [0: Local Input P, 1: Sensor Mask, 2: Topological Dist, 3: Delta P Anchor, 4: Nominal Baseline]
        feats = np.zeros((self.num_nodes, 5), dtype=np.float32)
        feats[:, 0] = self.nominal_p
        feats[anchor_idx, 0] = p_norm
        feats[anchor_idx, 1] = 1.0  # sensor mask
        feats[:, 2] = dist_norm
        feats[:, 3] = delta_p
        feats[:, 4] = self.nominal_p

        x_tensor = torch.tensor(feats, dtype=torch.float32, device=self.device)

        # Forward pass
        with torch.no_grad():
            out = self.model(x_tensor, self.edge_index)
            risk_scores = out.cpu().numpy().flatten()

        # Compute summary metrics
        mean_risk = float(np.mean(risk_scores))
        high_risk_mask = risk_scores > 0.70
        amber_risk_mask = (risk_scores >= 0.30) & (risk_scores <= 0.70)
        safe_risk_mask = risk_scores < 0.30

        high_risk_count = int(np.sum(high_risk_mask))
        warning_count = int(np.sum(amber_risk_mask))
        safe_count = int(np.sum(safe_risk_mask))

        # 1. Hydraulic Pressure vs. Risk Correlation Summary
        inlet_head_m = round(sensor_pressure_bar * 10.1972, 2)
        nominal_head_m = 34.67  # 3.40 bar nominal operating head
        avg_head_deficit_m = round(max(0.0, nominal_head_m - inlet_head_m), 2)

        if sensor_pressure_bar >= 3.0:
            hydraulic_state = "POSITIVE HEAD GRADIENT — PRESSURIZED FLOW"
        elif sensor_pressure_bar >= 1.5:
            hydraulic_state = "HYDRAULIC DEPRESSURIZATION — STAGNATION RISK"
        else:
            hydraulic_state = "NEGATIVE HEAD DEFICIT — BACK-SIPHONAGE HAZARD"

        hydraulic_correlation = {
            "inlet_pressure_bar": round(sensor_pressure_bar, 2),
            "inlet_head_m": inlet_head_m,
            "nominal_head_m": nominal_head_m,
            "avg_head_deficit_m": avg_head_deficit_m,
            "head_deficit_percentage": round((avg_head_deficit_m / nominal_head_m) * 100.0, 1),
            "hydraulic_state": hydraulic_state,
        }

        # 2. DMA Zone Severity Breakdown
        total_nodes = self.num_nodes
        safe_pct = round((safe_count / total_nodes) * 100.0, 1)
        warning_pct = round((warning_count / total_nodes) * 100.0, 1)
        critical_pct = round((high_risk_count / total_nodes) * 100.0, 1)

        zone_severity_breakdown = {
            "safe_zone": {
                "count": safe_count,
                "percentage": safe_pct,
                "threshold": "R < 0.30",
                "label": "Safe Zone (Positive Pressure)",
            },
            "stagnation_zone": {
                "count": warning_count,
                "percentage": warning_pct,
                "threshold": "0.30 <= R <= 0.70",
                "label": "Stagnation Zone",
            },
            "critical_zone": {
                "count": high_risk_count,
                "percentage": critical_pct,
                "threshold": "R > 0.70",
                "label": "Critical Ingress Hazard Zone",
            },
        }

        # 3. Top 5 High-Risk Junctions Table
        top_5_indices = np.argsort(risk_scores)[::-1][:5]
        top_risk_junctions = [
            {
                "rank": rank + 1,
                "junction_id": self.junction_names[idx],
                "elevation_m": self.elevations.get(self.junction_names[idx], 12.0),
                "risk_index": round(float(risk_scores[idx]), 4),
                "risk_percentage": round(float(risk_scores[idx]) * 100.0, 1),
            }
            for rank, idx in enumerate(top_5_indices)
        ]

        # Safety advisory determination
        if mean_risk < 0.30 and high_risk_count == 0:
            advisory = "NORMAL SUPPLY — POSITIVE PRESSURE MAINTAINED"
            status_level = "SAFE"
        elif mean_risk <= 0.70 and high_risk_count < 300:
            advisory = "DEPRESSURIZATION WARNING — STAGNATION RISK"
            status_level = "WARNING"
        else:
            advisory = "CRITICAL: BOIL WATER NOTICE / HAZARD ISOLATION"
            status_level = "CRITICAL"

        # Member 1 Interoperability Alert Event Generation (when R > 0.70)
        high_risk_junction_ids = [
            self.junction_names[i] for i in np.where(high_risk_mask)[0]
        ]
        
        emit_member1_alert = high_risk_count > 0 or mean_risk > 0.70
        alert_event = {
            "emit_event": emit_member1_alert,
            "target": "Member_1_Household_Meter_Service",
            "action": "ISOLATE_DOWNSTREAM_VALVES" if emit_member1_alert else "NORMAL_MONITORING",
            "status_level": status_level,
            "trigger_pressure_bar": round(sensor_pressure_bar, 2),
            "sensor_anchor_id": sensor_junction_id,
            "affected_junctions_count": high_risk_count,
            "sample_affected_junctions": high_risk_junction_ids[:15],
            "isolation_protocol": "AUTOMATED_CONSUMER_VALVE_CLOSURE",
            "timestamp": None  # Filled by API controller
        }

        # Build dictionary of predictions keyed by junction ID (rounded to 3 decimal places)
        predictions = {
            name: round(float(risk_scores[i]), 4)
            for i, name in enumerate(self.junction_names)
        }

        return {
            "status": "success",
            "sensor_junction_id": sensor_junction_id,
            "sensor_pressure_bar": round(sensor_pressure_bar, 2),
            "mean_network_risk": round(mean_risk, 4),
            "high_risk_junctions_count": high_risk_count,
            "warning_junctions_count": warning_count,
            "safe_junctions_count": safe_count,
            "hydraulic_correlation": hydraulic_correlation,
            "zone_severity_breakdown": zone_severity_breakdown,
            "top_risk_junctions": top_risk_junctions,
            "advisory": advisory,
            "predictions": predictions,
            "alert_event": alert_event,
        }


# Global singleton instance for high-throughput reuse
_predictor_instance: Optional[ContaminationRiskPredictor] = None


def get_predictor() -> ContaminationRiskPredictor:
    """Returns singleton instance of ContaminationRiskPredictor."""
    global _predictor_instance
    if _predictor_instance is None:
        _predictor_instance = ContaminationRiskPredictor()
    return _predictor_instance
