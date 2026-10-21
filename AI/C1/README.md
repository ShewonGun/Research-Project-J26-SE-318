# AquaFlow edge-AI

Machine-learning side of AquaFlow: leak / burst detection and water-usage forecasting. Everything here
is trained and validated on **simulated** data calibrated on the physical loop (pump ≈ 3.5 L/min); see
each folder's notes for what that does and doesn't prove.

```
edge-ai/
├── data/                     data generation and export (outputs are git-ignored)
│   ├── loop_household/       one loop-calibrated household: generate_dataset.py  (+ out/, out_seeds/)
│   ├── simdeum/              30 varied households from pySIMDEUM: generate_simdeum_households.py
│   │                         (+ out/ for leak training, out_forecast/ for usage forecasting)
│   └── real/                 export_readings.cjs — pulls REAL readings from MongoDB (CSVs git-ignored)
├── leak_detection/           leak & burst detector
│   ├── leakdetect.py         features, models, alarms, metrics (shared code)
│   ├── train_leak_model.py   cross-validated training + report  → results/, leak_model.joblib
│   ├── evaluate_heldout_seeds.py            test on unseen loop-calibrated datasets
│   ├── evaluate_real_with_injected_leaks.py leaks injected into real readings (needs continuous data)
│   └── AquaFlow_Leak_Model.ipynb            same pipeline, step by step (Google Colab)
├── usage_forecast/           7-day usage forecast (feeds prepaid run-out date + postpaid bill estimate)
│   ├── train_forecast.py     baselines vs gradient boosting      → results/, results_patterned/
│   ├── make_patterned_daily.py  adds ASSUMED weekly/absence patterns → data/patterned_daily.csv
│   └── data/                 patterned daily totals + log of injected patterns
└── service/                  FastAPI service the backend calls: /score (leaks), /forecast (usage)
```

## Typical workflow (run from the folder shown)

| Step | Command |
|---|---|
| Generate leak-training households | `cd data/simdeum && python generate_simdeum_households.py` |
| Train + evaluate the leak model | `cd leak_detection && python train_leak_model.py --fa-budget 0.05 --final-features no_baseline` |
| Generate normal-use households for forecasting | `cd data/simdeum && python generate_simdeum_households.py --start 2026-07-01 --end 2026-09-09 --micro-leaks 0 --bursts 0 --seed 7 --out out_forecast` |
| Build the patterned dataset, train the forecast | `cd usage_forecast && python make_patterned_daily.py && python train_forecast.py --daily-csv data/patterned_daily.csv` |
| Add weather + holidays (needs internet) | `cd usage_forecast && python make_patterned_daily.py --with-weather && python train_forecast.py --daily-csv data/patterned_weather_daily.csv --calendar` |
| Run the service for the backend | `cd service && python -m uvicorn app:app --port 8001` |

Model files (`*.joblib`) are not in git; the steps above recreate them. pySIMDEUM needs `pandas<2.2`
and `numpy<2` (see `data/simdeum/requirements.txt`).
