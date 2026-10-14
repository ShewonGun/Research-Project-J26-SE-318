# HydroTwin

HydroTwin is an integrated, IoT- and AI-driven municipal water management
platform and digital twin designed to address the operational and public
health challenges of aging, intermittent water-supply networks in Sri Lanka.
The platform is being piloted for the National Water Supply and Drainage Board
in the Kaduwela service area.

Rather than requiring a multi-million-dollar physical infrastructure overhaul,
HydroTwin combines hydraulic simulation and physics-based modelling
(EPANET/WNTR), modern machine learning, and lightweight IoT edge telemetry
to create a unified decision-support system for water utilities.

## Platform pillars

HydroTwin brings together four complementary components that share real-time
data and form a complete operational loop:

### 1. Water Demand and Consumption Forecasting

Machine-learning models forecast domestic and commercial consumption patterns
across distribution zones. These forecasts help utilities optimize reservoir
pumping schedules and balance diurnal pressure demands.

### 2. Leak and Burst Localization

The platform monitors high-frequency hydraulic transients and acoustic
indicators across distribution mains. This enables rapid detection,
localization, and assessment of structural pipe ruptures before they cause
catastrophic damage.

### 3. Non-Revenue Water (NRW) and Billing Fraud Auditing

Dynamic water-balance audits compare bulk zone inflows with customer billing
records. The system distinguishes physical leakage from unauthorized
consumption, including meter tampering and water theft.

### 4. Water Quality and Contamination-Risk Prediction

HydroTwin couples transient line depressurization with back-siphonage fluid
physics. A spatio-temporal graph neural network (ST-GNN) provides virtual
sensing by inferring downstream chemical decay and contamination spread across
thousands of unmonitored pipes from sparse physical pressure sensors.

The resulting predictions generate prescriptive valve-isolation instructions
and localized boil-water notices.

## Integrated operational loop

The platform's components work together through shared real-time data:

- When demand forecasting predicts high morning consumption, the water-quality
  model adjusts its flow-velocity assumptions.
- When burst detection identifies a pipe rupture, the water-quality model
  immediately evaluates the resulting back-siphonage contamination risk.
- When operators flush a compromised pipe segment, the flushed water volume is
  passed to the NRW and billing-audit component so legitimate maintenance
  losses are not incorrectly flagged as water theft.

## User experiences

HydroTwin supports two complementary user personas:

- **Admin Control Center:** A workspace for utility engineers with interactive
  GIS street maps, real-time telemetry, hydraulic insights, and automated
  valve-closure playbooks.
- **Consumer WaterSafe Portal:** A citizen-facing portal that provides
  ward-specific safety advisories and repair countdowns without creating
  unnecessary city-wide panic.

## Repository services

The current repository is organized around the platform's core services:

- [`services/Digital_Twin_Service`](services/Digital_Twin_Service) —
  hydraulic simulation and digital-twin capabilities.
- [`services/Monitor_and_Leak_Service`](services/Monitor_and_Leak_Service) —
  telemetry monitoring, leak detection, and burst localization.
- [`services/Fraud_Detection_Service`](services/Fraud_Detection_Service) —
  NRW analysis and billing-fraud auditing.
- [`services/Contamination_Service`](services/Contamination_Service) —
  water-quality and contamination-risk prediction.

## Goals

HydroTwin aims to help water utilities:

- improve network visibility using low-cost edge telemetry;
- reduce physical leakage and non-revenue water;
- respond to bursts and contamination risks more quickly;
- make pumping, pressure, flushing, and valve-isolation decisions using
  physics-informed AI; and
- provide clear, localized public-health communication to consumers.
