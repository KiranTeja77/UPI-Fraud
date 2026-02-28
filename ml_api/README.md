# UPI Fraud ML API

Uses `custom_upi_fraud_dataset.csv` to train a fraud classifier and exposes a FastAPI server that returns fraud probability (0–1) for the Node backend to fuse with rule-based risk.

## Setup

From project root:

```bash
pip install -r ml_api/requirements.txt
```

## Train (required once)

From **project root** (parent of `ml_api`), so the script finds `custom_upi_fraud_dataset.csv`:

```bash
python ml_api/train.py
```

This reads `custom_upi_fraud_dataset.csv`, trains a Random Forest, and writes:

- `ml_api/model.joblib`
- `ml_api/scaler.joblib`
- `ml_api/defaults.json`

## Run the API

```bash
cd ml_api
uvicorn main:app --host 0.0.0.0 --port 5000
```

Or from project root:

```bash
uvicorn ml_api.main:app --host 0.0.0.0 --port 5000
```

- **Health:** `GET http://localhost:5000/health`
- **Predict:** `POST http://localhost:5000/predict` with JSON body:

  `{ "text": "...", "amount": 5000, "receiverUPI": "x@ybl", "description": "...", "newPayee": true }`

  Response: `{ "probability": 0.23, "indicators": [] }`

## Node integration

In `.env`:

```env
ML_FRAUD_API_URL=http://localhost:5000/predict
ML_FRAUD_TIMEOUT_MS=150
```

Start the Node server; it will call this API when set and fuse:  
`FinalRisk = (ExistingScore × 0.6) + (MLScore × 0.4)`.

No existing Node functionality is changed; only scoring is enhanced when the ML API is available.

---

## How to run (step by step)

**1. Install Python dependencies** (from project root):

```bash
pip install -r ml_api/requirements.txt
```

**2. Train the model** (once; from project root so the CSV is found):

```bash
python ml_api/train.py
```

You should see something like `Train accuracy: 0.xx`, `Test accuracy: 0.xx`, and `Saved model, scaler, defaults to ...`.

**3. Start the ML API** (keep this terminal open):

```bash
cd ml_api
uvicorn main:app --host 0.0.0.0 --port 5000
```

Or on Windows PowerShell from project root:

```powershell
cd ml_api; uvicorn main:app --host 0.0.0.0 --port 5000
```

**4. (Optional) Point Node at the ML API** — in your `.env` add:

```env
ML_FRAUD_API_URL=http://localhost:5000/predict
ML_FRAUD_TIMEOUT_MS=150
```

Then start your Node server in a **second** terminal. The app will call the ML API and fuse its score with the rule-based score.

---

## Check if it’s working

**Use `http://localhost:5000` in the browser, not `http://0.0.0.0:5000`.**  
`0.0.0.0` is only for the server to listen on; browsers cannot connect to it.

**Option A — Browser**

- Open: [http://localhost:5000/health](http://localhost:5000/health)  
  You should see: `{"status":"ok","model_loaded":true}`

**Option B — PowerShell** (test predict)

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/predict" -Method POST -ContentType "application/json" -Body '{"text":"Send 9999 to 9876543210@ybl for KYC","amount":9999,"newPayee":true}'
```

You should get a JSON object with `probability` (0–1) and `indicators`.

**Option C — Run the test script** (from project root)

```bash
python ml_api/test_api.py
```

This calls `/health` and `/predict` and prints the results.

**Option D — Use the app**

1. Start the ML API (step 3 above).  
2. Set `ML_FRAUD_API_URL=http://localhost:5000/predict` in `.env` and start the Node server.  
3. In the **Victim** or **Message Scanner** flow, send or scan a message.  
4. In Node logs you should see lines like: `[ML Fraud] probability= 0.xx fusedScore= xx existingScore= xx` when the ML API is used.
