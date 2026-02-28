"""
Train fraud classifier on custom_upi_fraud_dataset.csv.
Saves model.joblib, scaler.joblib, and defaults.json for the FastAPI server.
Run from project root: python ml_api/train.py
"""
import json
import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# CSV path: same directory as this repo root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CSV_PATH = os.path.join(PROJECT_ROOT, "custom_upi_fraud_dataset.csv")
OUT_DIR = SCRIPT_DIR

FEATURE_COLUMNS = [
    "transactionAmount",
    "avgUserAmount",
    "amountDeviation",
    "transactionsLast2Min",
    "hour",
    "deviceChanged",
    "ipChanged",
    "newPayee",
    "messageRiskScore",
]
TARGET = "fraudLabel"


def main():
    if not os.path.isfile(CSV_PATH):
        print(f"CSV not found: {CSV_PATH}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    if TARGET not in df.columns:
        print(f"Target column '{TARGET}' not in CSV", file=sys.stderr)
        sys.exit(1)

    for c in FEATURE_COLUMNS:
        if c not in df.columns:
            print(f"Missing column: {c}", file=sys.stderr)
            sys.exit(1)

    X = df[FEATURE_COLUMNS].astype(float)
    y = df[TARGET].astype(int)

    # Fill NaN with column median
    X = X.fillna(X.median())

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train_scaled, y_train)

    train_acc = model.score(X_train_scaled, y_train)
    test_acc = model.score(X_test_scaled, y_test)
    print(f"Train accuracy: {train_acc:.4f}")
    print(f"Test accuracy:  {test_acc:.4f}")

    # Defaults for inference (when we don't have user/session state)
    defaults = {
        "avg_transaction_amount": float(X["transactionAmount"].median()),
        "mean_message_risk_score": float(X["messageRiskScore"].mean()),
        "transactions_last_2_min": 1.0,
    }

    joblib.dump(model, os.path.join(OUT_DIR, "model.joblib"))
    joblib.dump(scaler, os.path.join(OUT_DIR, "scaler.joblib"))
    with open(os.path.join(OUT_DIR, "defaults.json"), "w") as f:
        json.dump(defaults, f, indent=2)

    print(f"Saved model, scaler, defaults to {OUT_DIR}")


if __name__ == "__main__":
    main()
