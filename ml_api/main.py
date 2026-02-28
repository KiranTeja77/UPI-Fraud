"""
FastAPI server for UPI fraud probability (0-1).
Contract: POST /predict with { text?, amount?, receiverUPI?, description?, newPayee? }
Response: { probability: number, indicators?: string[] }
"""
import json
import os
from contextlib import asynccontextmanager

import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field

from features import build_features

# Must match train.py FEATURE_COLUMNS so scaler/model get named features (avoids sklearn warning)
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

DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(DIR, "model.joblib")
SCALER_PATH = os.path.join(DIR, "scaler.joblib")
DEFAULTS_PATH = os.path.join(DIR, "defaults.json")

model = None
scaler = None
defaults = {"avg_transaction_amount": 2000.0, "mean_message_risk_score": 5.0, "transactions_last_2_min": 1.0}


def load_artifacts():
    global model, scaler, defaults
    if os.path.isfile(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
    if os.path.isfile(SCALER_PATH):
        scaler = joblib.load(SCALER_PATH)
    if os.path.isfile(DEFAULTS_PATH):
        with open(DEFAULTS_PATH) as f:
            defaults = json.load(f)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_artifacts()
    print("\n  ML API: use http://localhost:5000/health (not 0.0.0.0) in browser.\n")
    yield
    # shutdown if needed


app = FastAPI(title="UPI Fraud ML API", lifespan=lifespan)


class PredictRequest(BaseModel):
    text: str = Field(default="", description="Raw message text")
    amount: float | None = Field(default=None, description="Transaction amount")
    receiverUPI: str | None = Field(default=None)
    description: str | None = Field(default=None)
    newPayee: bool = Field(default=False, description="First-time payee")


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/predict")
def predict(body: PredictRequest):
    """Returns fraud probability in [0, 1] and optional indicators."""
    if model is None or scaler is None:
        return {"probability": 0.0, "indicators": ["ML model not loaded; run train.py first."]}

    request = {
        "text": body.text or "",
        "amount": body.amount,
        "receiverUPI": body.receiverUPI,
        "description": body.description or body.text,
        "newPayee": body.newPayee,
    }
    features = build_features(request, defaults)
    # Use DataFrame with same column names as training so scaler/model don't warn about feature names
    X = pd.DataFrame([features], columns=FEATURE_COLUMNS)
    X_scaled = scaler.transform(X)
    proba = model.predict_proba(X_scaled)[0]
    # fraudLabel 1 = fraud, so index 1 is P(fraud)
    fraud_prob = float(proba[1]) if proba.shape[0] > 1 else 0.0

    indicators = []
    if fraud_prob >= 0.7:
        indicators.append("High ML fraud probability")
    elif fraud_prob >= 0.4:
        indicators.append("Moderate ML fraud risk")

    return {"probability": fraud_prob, "indicators": indicators}


if __name__ == "__main__":
    import uvicorn
    load_artifacts()
    uvicorn.run(app, host="0.0.0.0", port=5000)
