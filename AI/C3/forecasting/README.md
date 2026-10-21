# C3 forecasting data preparation

The source is `AI/C3/data/raw/DataSet.xlsx`, worksheets `Consumption_Data` and
`Household_Info`. No separate master CSV is required.

The existing validation reports were preserved during data relocation and retain
their original `data/c3/` source-path text. The current location is
`AI/C3/data/`; no datasets or analytical outputs were regenerated.

From the repository root, run only this data preparation command locally:

```sh
python AI/C3/forecasting/prepare_actual_data.py
```

It reads the workbook without modifying it and writes actual historical records,
workbook household metadata, per-household counts, row-level quality flags, and
validation reports under `AI/C3/data/processed/`. It never trains a model. All
consumption values, including zeros and statistical outliers, are retained.

Upload `AI/C3/data/processed/C3_Household_Consumption_Cleaned.csv` to the Colab
notebook. It includes the household Zone, DMA and TankCapacityLitres needed by
the feature workflow, so no topology metadata merge is required. The separate
`C3_Household_Info.csv` is an optional metadata export from the actual workbook.
The previous `C3_Household_Cleaned.csv` and node mapping are not historical
consumption sources and are not modified by this preparation command.

The target is `Consumption`, measured in unspecified workbook source units.
Do not relabel it as litres or apply a conversion until the source units are
confirmed. `CurrentReading` is retained for auditing, not used as a forecasting
feature. SourceSheet and SourceRow provide observation provenance.

Read `AI/C3/data/processed/C3_Consumption_Validation.md` before training. Review
meter decreases, meter-delta disagreements, zeros, statistical outliers, and
the limited 18-month history per household. Resolve questionable values with
the data owner rather than inferring replacements. No missing periods are filled.

Training and evaluation belong in Google Colab only. The notebook's model fit
and export examples remain commented out. Its chronological split and shifted
lags describe rolling one-month-ahead evaluation using available past actuals,
not a fixed-origin forecast for the whole test horizon. Decide that evaluation
protocol separately before training. Rolling statistics stay within households.
