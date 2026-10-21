"""
C3 Water Security Digital Twin - Household Water Demand Forecasting
Data Preprocessing & Feature Engineering Module for Google Colab
"""

import pandas as pd


def load_datasets(household_meta_path, consumption_data_path):
    """
    Load cleaned household metadata and historical consumption records.
    """
    df_households = pd.read_csv(household_meta_path)
    df_consumption = pd.read_csv(consumption_data_path)
    return df_households, df_consumption


def clean_consumption_data(df_consumption):
    """
    Validate actual DataSet.xlsx exports without silently removing records.
    Consumption remains in the workbook's unspecified source units.
    """
    df = df_consumption.copy()
    required = ["HouseholdID", "Date", "Consumption"]
    if not set(required).issubset(df.columns):
        raise ValueError(f"Expected columns: {required}")
    if df[required].isna().any().any():
        raise ValueError("Missing household, date, or consumption")
    df["Date"] = pd.to_datetime(df["Date"], errors="raise")
    df["Consumption"] = pd.to_numeric(df["Consumption"], errors="raise")
    if df.duplicated(["HouseholdID", "Date"]).any():
        raise ValueError("Duplicate household/date records require review")
    if (df["Consumption"] < 0).any():
        raise ValueError("Negative consumption requires review")
    df = df.sort_values(by=["HouseholdID", "Date"]).reset_index(drop=True)

    return df


def engineer_temporal_features(df):
    """
    Engineer time-series lag and rolling window features for ML demand forecasting.
    Features:
      - lag_1: previous cycle consumption (source units)
      - lag_2: 2 cycles ago consumption (source units)
      - lag_3: 3 cycles ago consumption (source units)
      - rolling_mean_3: 3-cycle moving average
      - rolling_std_3: 3-cycle standard deviation
      - month, quarter
    """
    df = clean_consumption_data(df)
    df["Month"] = df["Date"].dt.month
    df["Quarter"] = df["Date"].dt.quarter

    # Group by household to compute lags without cross-household leakage
    grouped = df.groupby("HouseholdID")["Consumption"]

    df["lag_1"] = grouped.shift(1)
    df["lag_2"] = grouped.shift(2)
    df["lag_3"] = grouped.shift(3)

    # Rolling statistics over past periods (shifted to avoid lookahead bias)
    df["rolling_mean_3"] = grouped.transform(lambda s: s.shift(1).rolling(window=3).mean())
    df["rolling_std_3"] = grouped.transform(lambda s: s.shift(1).rolling(window=3).std())

    return df


def time_based_train_test_split(df, split_ratio=0.8):
    """
    Perform a strict chronological train/test split to prevent temporal data leakage.
    DO NOT use random shuffle split for time series forecasting.
    """
    dates = df["Date"].drop_duplicates().sort_values().values
    split_idx = int(len(dates) * split_ratio)
    split_date = dates[split_idx]

    train_df = df[df["Date"] < split_date].dropna().copy()
    test_df = df[df["Date"] >= split_date].dropna().copy()

    return train_df, test_df, split_date
