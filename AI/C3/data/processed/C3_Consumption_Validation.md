# C3 historical consumption validation

Source: `data/c3/raw/DataSet.xlsx` (read only).
SHA-256: `86ba795d5342c4def9fe52ecae97ee2ac5801089c682710da78bcbb6c5db4c49`

## Workbook inventory

- Consumption_Data: 1,782 records. Columns: HouseholdID, Year, Month, ReadingDate, CurrentReading, Consumption, Zone, TankCapacityLitres.
- Household_Info: 99 records. Columns: HouseholdID, Address, Zone, TankCapacityLitres, DMA.

## Historical validation

- Households: 99. Actual consumption records: 1,782. Every household has 18 records.
- Overall date range: 2025-03-01 to 2026-09-01.
- 47 households (Zone A): March 2025–August 2026. 52 households (Zone B): April 2025–September 2026.
- No internal monthly gaps. The two groups have different coverage at the boundaries; no rows were added to align them.
- Missing values: 0 in every column on both worksheets.
- Duplicate household/date or household/month groups: 0. All 99 household IDs match unique household information records.
- Consumption range: 0–131 source units. Zero records: 69. Negative records: 0.
- Statistical review flags: 88 values above 49.5 (global Q1=12.0, Q3=27.0, 1.5 IQR rule). These are not established errors.
- Cumulative meter decreases: 17. Consumption/meter-delta disagreements: 30 of 1,683 adjacent comparisons. Flags may overlap.
- Year/month agrees with ReadingDate, and Zone/tank capacity agrees with Household_Info for all records.

## Export and cleaning

Upload `C3_Household_Consumption_Cleaned.csv` to Colab. It has one row per actual household reading, sorted by household and date.
Columns: HouseholdID, Date, Year, Month, CurrentReading, Consumption, Zone, TankCapacityLitres, DMA, SourceSheet, SourceRow.

`Date` is the original Excel ReadingDate converted to ISO YYYY-MM-DD. Consumption and CurrentReading values are unchanged. DMA is joined from Household_Info; SourceSheet/SourceRow trace each observation to the workbook. Text whitespace is trimmed. No consumption rows were added, removed, interpolated, aggregated, or fabricated.

Supporting files: `C3_Household_Info.csv` (actual workbook metadata), `C3_Consumption_Per_Household.csv` (all 99 counts and coverage), `C3_Consumption_Quality_Flags.csv` (row-level review flags), and `C3_Consumption_Validation.json` (machine-readable checks).

## Readiness and concerns

- Consumption and CurrentReading units are not specified; confirm with data owner before interpreting demand in litres.
- 18 monthly observations per household give limited seasonal history.
- Zeros and statistical outliers are retained unchanged, not assumed erroneous.
- Meter deltas cannot be checked for each household's first observation without an earlier reading.
- Household metadata has no effective dates; its historical validity is unverified.

Ready to upload for Colab inspection and feature preparation. Confirm units and review meter anomalies before treating the data as validated training targets. No model was trained or evaluated locally.

Forecasting review: existing forecasting files had no Master_Data.csv references, but expected a generic household_consumption.csv and assumed litres. They now use the actual export and Consumption in source units. The existing empty Master_Data.csv placeholder is not read or required. The raw workbook, topology mapping, frontend, and backend are unchanged.
