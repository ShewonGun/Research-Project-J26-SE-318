# C3 Digital Twin Service

This is the official backend location for the C3 Water Security Digital Twin.
Run backend development from this directory. The previous backend folder has
been archived outside the repository in `C3_backups/`.

```powershell
cd services/Digital_Twin_Service
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

The default port is 5000, configurable through the process `PORT` environment
variable. Run only one backend on the chosen port.

- `GET /api/c3/twin`: returns one coherent PP1 dashboard payload containing
  joined household states, status counts, zone summaries, household/zone
  priorities, representative node mapping, and available historical records.
- `GET /api/c3/households`: returns the same joined household state list in
  the existing registry response format.
- `POST /api/c3/households/calculate-security`: existing prototype calculation
  from explicitly supplied inputs; it is not measured telemetry or a trained
  classifier. Its thresholds remain provisional research assumptions.

The frontend is in `Frontend/C3_Frontend/`. Forecasting scripts and the Colab
notebook are in `AI/C3/forecasting/`. A trained security classifier is not
implemented. C3 datasets and node mappings remain under
`AI/C3/data/`, including `AI/C3/data/network/`. Existing frontend API URLs and
household routes are unchanged.

The PP1 mapping is read from `AI/C3/data/network/C3_Household_Node_Mapping_PP1.csv`.
Forecasts, storage estimates, security assessments and zone summaries are read
from their existing CSVs in `AI/C3/data/outputs/`. Historical records are optional
and come from `AI/C3/data/processed/C3_Household_Consumption_Cleaned.csv`.
The service reads these inputs without modifying or regenerating them. It does
not load the hourly trajectory into the main dashboard or run model training.

Joins require unique household IDs and matching per-household forecast dates.
Mapping attributes and overlapping outputs are checked for disagreements.
Missing required files, duplicate IDs or inconsistent snapshots cause an
explicit error rather than a fallback to fabricated results. Missing optional
history returns a warning; unavailable optional household fields remain null.

Household priorities sort Critical, Warning, Normal, then lower estimated
storage percentage, with HouseholdID as a deterministic final tie-breaker.
Zone priorities sort by Critical count, Warning count, attention count, then
lower average estimated storage percentage and zone name.

The zone summary has no date column, so counts and available storage averages
are checked against household states. Forecast dates are shown per zone;
current exports cover different months and are not simultaneous live readings.

Network visualization is a schematic of representative node assignments, not
household GIS or hydraulic simulation. EPANET files/settings are not read as
security inputs or modified. No database is required. Model training remains
a separate Google Colab activity.

Run backend verification with `node --test tests/pp1.test.js`.
