# Train the AquaFlow models in Google Colab — from scratch

Two separate notebooks, one per model. Each runs on its own with the repository's own scripts:

| Notebook | Model | Data | File it makes | Time (free Colab) |
|---|---|---|---|---|
| `AquaFlow_Train_Leak_Model.ipynb` | Leak / burst detector | 100 simulated households calibrated to real NWSDB usage, with injected leaks | `leak_detection/results_calibrated_100/leak_model.joblib` | 1–1.5 h |
| `AquaFlow_Train_Forecast.ipynb` | Daily usage forecast (+ the monthly NWSDB study it gets its seasonality from) | 100 calibrated households + 106 real NWSDB households' bills | `usage_forecast/results_calibrated_100/forecast_model.joblib` | ~10 min |

You don't need to upload anything: the notebooks download the code from GitHub, and the NWSDB data is
already in the repository. You can run them in either order, or in two browser tabs at the same time.

## 1. Open a notebook in Colab

1. Go to <https://colab.research.google.com> and sign in with your Google account.
2. **File → Open notebook → GitHub** tab.
3. Paste `https://github.com/ShewonGun/Research-Project`, press Enter, choose the branch
   `claude/vibrant-cori-jjo5gr` (or `main` after merging) and click the notebook in `edge-ai/colab/`.
   *(Alternative: download the `.ipynb` from GitHub and use **File → Upload notebook**.)*
4. **File → Save a copy in Drive**, so your runs and edits are kept.

Use the normal CPU runtime. A GPU doesn't help these models.

## 2. Check the settings (first code cell)

Both notebooks:

| Setting | Default | Change it when |
|---|---|---|
| `BRANCH` | `claude/vibrant-cori-jjo5gr` | after merging the PR → `"main"` |
| `N_HOUSEHOLDS` | `100` | lower (e.g. 30) for a quick trial run; results will be weaker |

Forecast notebook only:

| Setting | Default | Change it when |
|---|---|---|
| `TRAIN_MONTHLY` | `True` | `False` to skip the monthly NWSDB study |
| `DAILY_DATA` | `"repo"` | `"generate"` to regenerate the daily data with SIMDEUM too (+1–2 h, ~1.5 GB) |
| `RUN_COMPARISONS` | `True` | `False` to skip comparing with the current daily model |

## 3. Run it

1. **Runtime → Run all** (Ctrl+F9).
2. Allow Google Drive access when asked (choose your account, tick all boxes, *Continue*).
3. Leave the tab open until the last cell prints `Saved → …`.

### Leak model notebook

| Section | Time | What you should see |
|---|---|---|
| 2. Drive and code | 1 min | `Code: /content/Research-Project | commit …` |
| 3. Python environment | 2–3 min | `python 3.11 … numpy 1.26.4 | pandas 2.1.4 | scikit-learn 1.9.1 | joblib 1.6.0` |
| 5.1 Data | 30–50 min | `out_calibrated_100: 46/100 households, 18 min` … then `saved → …/out_calibrated_100.zip` |
| 5.2 Train | 20–40 min | cross-validation results, `Saved model, report and charts`, then the report and charts |
| Check | 1 min | `leak model OK: … alarms {…}` |
| Save | 1 min | `Saved → /content/drive/MyDrive/aquaflow/leak_model_<date-time>` |

**If Colab disconnects** (free sessions stop after inactivity): reconnect and **Run all** again. The
generated households are restored from `MyDrive/aquaflow/out_calibrated_100.zip`, so it goes straight to
training. To force fresh data, delete that zip from Drive first.

### Forecast notebook

| Section | Time | What you should see |
|---|---|---|
| 2–3. Code and environment | 3 min | as above |
| 5. Monthly NWSDB | 1 min | the monthly report (errors vs simple rules, seasonality by month) |
| 6.1 Data | seconds | `100 households, 2026-07-01 → 2026-09-09, median 238 L/day (loop scale)` |
| 6.2 Train | 3–5 min | metrics table (`gbm` vs `baseline_mean7` / `baseline_week`), 7-day totals, comparison table |
| Check | 1 min | `forecast model OK: …` |
| Save | 1 min | `Saved → /content/drive/MyDrive/aquaflow/forecast_model_<date-time>` |

## 4. Read the results

Expected results (from my run of the same steps):

* **Leak model:** in the cross-validation, all injected micro-leaks and about 90 % of bursts caught, about
  0.1 false alarms per day; the current backend rules miss most micro-leaks. Yours will be close, not identical
  (the households are generated afresh). Report: `leak_detection/results_calibrated_100/REPORT.md`.
* **Monthly NWSDB forecast:** gradient boosting 18.2 % error (WAPE) vs 20.3 % for the best simple rule.
* **Daily forecast:** model MAE 65.5 L/day vs 76.6 for the 7-day average; 7-day totals 24.9 % vs 29.5 %;
  80 % range covers 80 %. With `DAILY_DATA = "repo"` you get exactly these numbers.

## 5. Use the new models on your PC

1. In Drive open `MyDrive/aquaflow/`, right-click the newest `leak_model_<date-time>.zip` and/or
   `forecast_model_<date-time>.zip` → **Download**, and unzip.
2. Copy each model file to the same place in your project (rename the old one first, e.g. `leak_model_old.joblib`):
   * `leak_detection\results_calibrated_100\leak_model.joblib` → `Research-Project\edge-ai\leak_detection\results_calibrated_100\`
   * `usage_forecast\results_calibrated_100\forecast_model.joblib` → `Research-Project\edge-ai\usage_forecast\results_calibrated_100\`

   Copy the reports and charts too if you want the new numbers in your slides.
3. Make sure the service's Python has the same library versions (once, in `edge-ai\service` with the venv active):
   ```powershell
   pip install "numpy==1.26.4" "pandas==2.1.4" "scikit-learn==1.9.1" "joblib==1.6.0"
   ```
4. Start the service with the new models:
   ```powershell
   cd <your path>\Research-Project\edge-ai\service
   .\.venv\Scripts\Activate.ps1
   $env:LEAK_MODEL_PATH="..\leak_detection\results_calibrated_100\leak_model.joblib"
   $env:FORECAST_MODEL_PATH="..\usage_forecast\results_calibrated_100\forecast_model.joblib"
   $env:FORECAST_USE_CALENDAR="0"
   uvicorn app:app --port 8001
   ```
5. Check <http://localhost:8001/health>: both models should show `true`.

## Problems

| Message | Fix |
|---|---|
| `RuntimeError: generator failed …` | The last lines of that part's log are printed above it. Run all again; if it repeats, send me the output. |
| `uv: command not found` / install errors | Runtime → **Disconnect and delete runtime**, then Run all. |
| Drive asks again / `Mountpoint must not already contain files` | Runtime → Restart session, Run all. |
| `PCG64 BitGenerator` or `incompatible dtype` on your PC | Step 5.3: the PC's versions differ from Colab's. |
| Colab "You are not using a GPU" notice | Ignore it. |
