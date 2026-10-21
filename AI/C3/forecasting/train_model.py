"""
C3 Water Security Digital Twin - Household Water Demand Forecasting
Model Training Module for Google Colab Execution

NOTE: To be executed in Google Colab, NOT locally.
"""

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from xgboost import XGBRegressor
from sklearn.ensemble import RandomForestRegressor


class NaivePersistenceBaseline:
    """
    Baseline 1: Persistence model (y_hat_t = y_{t-1}).
    Predicts that next period consumption equals previous period consumption.
    """
    def fit(self, X, y):
        return self

    def predict(self, X):
        return X["lag_1"].values


class MovingAverageBaseline:
    """
    Baseline 2: 3-period moving average baseline.
    Predicts the mean of the last 3 observed periods.
    """
    def fit(self, X, y):
        return self

    def predict(self, X):
        return X["rolling_mean_3"].values


def get_feature_columns():
    """
    Standard list of feature columns used for ML regression models.
    """
    return [
        "lag_1",
        "lag_2",
        "lag_3",
        "rolling_mean_3",
        "rolling_std_3",
        "Month",
        "Quarter",
        "TankCapacityLitres",
    ]


def train_gradient_boosting(X_train, y_train):
    """
    Train an XGBoost regressor with parameters tuned for water demand forecasting.
    """
    model = XGBRegressor(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )
    model.fit(X_train, y_train)
    return model


def train_lightgbm(X_train, y_train):
    """
    Train a LightGBM regressor.
    """
    model = LGBMRegressor(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=4,
        random_state=42,
    )
    model.fit(X_train, y_train)
    return model


def save_trained_model(model, output_path="demand_forecast_model.pkl"):
    """
    Serialize the trained model artifact for backend / twin integration.
    """
    joblib.dump(model, output_path)
    print(f"Model saved successfully to {output_path}")
