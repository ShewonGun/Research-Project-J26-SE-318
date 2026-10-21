"""
C3 Water Security Digital Twin - Household Water Demand Forecasting
Evaluation & Benchmarking Module for Google Colab Execution
"""

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def calculate_metrics(y_true, y_pred, model_name="Model"):
    """
    Calculate MAE, RMSE, MAPE, and R2 evaluation metrics.
    """
    y_true = np.array(y_true)
    y_pred = np.array(y_pred)

    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    # Avoid zero division in MAPE
    mask = y_true != 0
    mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100 if np.any(mask) else np.nan
    r2 = r2_score(y_true, y_pred)

    return {
        "Model": model_name,
        "MAE (source units)": round(float(mae), 2),
        "RMSE (source units)": round(float(rmse), 2),
        "MAPE (%)": round(float(mape), 2),
        "R2 Score": round(float(r2), 4),
    }


def compare_models(eval_results_list):
    """
    Produce a formatted markdown / pandas comparison table of baseline vs ML models.
    """
    df = pd.DataFrame(eval_results_list)
    return df
