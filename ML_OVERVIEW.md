# How the ML Works — Dataset, Training, and Where It’s Used

This doc explains where the dataset is used, how the model is trained, and where ML runs in the app (only in **Pay** / transaction validation).

---

## 1. Where is the dataset used?

The dataset is used **only once**: during **training** the fraud model.

| Item | Path | Used in |
|------|------|--------|
| **Dataset** | `custom_upi_fraud_dataset.csv` (project root) | **Training only** — `ml_api/train.py` reads it to train the model. It is **not** read at runtime. |

**Dataset columns (same as CSV):**

| Column | Meaning | Used when |
|--------|--------|-----------|
| `transactionAmount` | Amount of the transaction | Training: from CSV. Inference: from user input (amount). |
| `avgUserAmount` | User’s typical transaction amount | Training: from CSV. Inference: **not available** → we use a **default** from training (median amount in CSV). |
| `amountDeviation` | transactionAmount / avgUserAmount | Training: from CSV. Inference: computed as amount / default_avg. |
| `transactionsLast2Min` | Number of txns in last 2 minutes | Training: from CSV. Inference: **not available** → we use a **default** (e.g. 1). |
| `hour` | Hour of day (0–23) | Training: from CSV. Inference: **current hour** (UTC). |
| `deviceChanged` | Device change flag | Training: from CSV. Inference: **not available** → we use **0**. |
| `ipChanged` | IP change flag | Training: from CSV. Inference: **not available** → we use **0**. |
| `newPayee` | First-time payee (0/1) | Training: from CSV. Inference: from user checkbox **“First time paying this UPI”**. |
| `messageRiskScore` | Risk score from message content (0–20) | Training: from CSV. Inference: **computed** from description/text by a small **rule-based** function (keywords + patterns) in `ml_api/features.py`. |
| `fraudLabel` | 0 = safe, 1 = fraud | **Training only** — target for the classifier. Not used at inference. |

So: **dataset = training only**. At runtime we never load the CSV; we only use the **trained model** plus **feature building** that mimics the same columns (with defaults where we don’t have real user/session data).

---

## 2. Training pipeline (where the dataset is actually used)

**Script:** `ml_api/train.py`  
**Run once:** `python ml_api/train.py` (from project root, so it finds `custom_upi_fraud_dataset.csv`).

**Steps:**

1. **Read CSV**  
   `custom_upi_fraud_dataset.csv` → pandas DataFrame.

2. **Features and target**  
   - Features: columns `FEATURE_COLUMNS` (all columns above except `fraudLabel`).  
   - Target: `fraudLabel` (0 = safe, 1 = fraud).

3. **Split**  
   80% train / 20% test, stratified by `fraudLabel`.

4. **Scale**  
   `StandardScaler` fit on train features, transform train and test.

5. **Train**  
   `RandomForestClassifier(n_estimators=100, max_depth=12)` fit on scaled train features and `fraudLabel`.

6. **Save**  
   - `ml_api/model.joblib` — trained Random Forest.  
   - `ml_api/scaler.joblib` — fitted StandardScaler (same feature order/names).  
   - `ml_api/defaults.json` — numbers used at inference for missing fields:
     - `avg_transaction_amount`: median of `transactionAmount` in CSV.
     - `mean_message_risk_score`: mean of `messageRiskScore` in CSV.
     - `transactions_last_2_min`: 1.0.

So the **dataset is used only here**: to fit the scaler and the model and to compute the defaults. After that, only the saved artifacts are used.

---

## 3. Inference pipeline (no dataset, only model + features)

**Service:** Python FastAPI app in `ml_api/main.py` (runs as a separate process, e.g. `uvicorn main:app --host 0.0.0.0 --port 5000`).

**Endpoint:** `POST /predict`  
**Input (JSON):** `text`, `amount`, `receiverUPI`, `description`, `newPayee` (same as Pay form).

**Steps:**

1. **Load artifacts** (at server start)  
   - `model.joblib`  
   - `scaler.joblib`  
   - `defaults.json`

2. **Build feature vector** (`ml_api/features.py` → `build_features(request, defaults)`)  
   One row in the **same order** as the CSV features (no dataset read):

   - `transactionAmount` ← request `amount` (or 0).
   - `avgUserAmount` ← `defaults["avg_transaction_amount"]` (from training).
   - `amountDeviation` ← transactionAmount / avgUserAmount.
   - `transactionsLast2Min` ← `defaults["transactions_last_2_min"]` (e.g. 1).
   - `hour` ← current UTC hour.
   - `deviceChanged` ← 0.
   - `ipChanged` ← 0.
   - `newPayee` ← 0 or 1 from request.
   - `messageRiskScore` ← from **description/text**:
     - If there is text: small **rule-based** score 0–20 using `MESSAGE_RISK_KEYWORDS` and UPI-like patterns in `features.py`.
     - If no text: `defaults["mean_message_risk_score"]`.

3. **Scale and predict**  
   - Build a **DataFrame** with the same column names as in training.  
   - `scaler.transform(DataFrame)` → scaled features.  
   - `model.predict_proba(scaled features)[0]` → probability of class 1 (fraud).  
   - Return `probability` (0–1) and optional `indicators`.

So at inference: **no dataset**; only **model + scaler + defaults** and **feature building** that matches the training columns.

---

## 4. Where is ML used in the app? (only one place: Pay)

ML is **not** used in:

- **Message Scanner** — rule-based + existing AI only; no call to the ML API.
- **Active Defense Chat** (scammer ↔ victim) — rule-based + scam detection only; no ML fusion.
- **QR Scanner** — no ML.
- **Honeypot / other APIs** — no ML.

ML **is** used in **exactly one flow**:

| Flow | When | What happens |
|------|------|--------------|
| **Pay (Validate before Pay)** | User fills **Receiver UPI**, **Amount**, **Description**, **New payee** and clicks **Check before Pay** | Backend runs **rule-based + scam detection on description**, then **optionally** calls the ML API and **fuses** that score with the rule score. |

**Backend (high level):**

1. **Pay** tab → `POST /api/upi/validate-transaction` with `receiverUPI`, `amount`, `description`, `newPayee`.
2. **Blacklist check** — if UPI is blacklisted → return “blacklisted, do not pay” (no ML).
3. **Rule + scam** — build transaction, run `analyzeTransaction`, run `detectScam` on description (+ UPI + amount), merge to a **rule score** (0–100).
4. **ML (optional)** — if `ML_FRAUD_API_URL` is set, Node calls `POST http://localhost:5000/predict` with the same payload; Python returns `probability` (0–1).
5. **Fusion** — `FinalRisk = (RuleScore × 0.6) + (MLScore × 0.4)` with `MLScore = probability × 100`. If ML is down or not configured, only the rule score is used.
6. **Response** — risk score, level, “Do not pay” / “Caution” / “Safe”, indicators; if score ≥ 70, UPI is added to blacklist.

So: **dataset** is used only in **training**; **ML model** is used only in **Pay** (validate-transaction), and only when the ML API is running and configured.

---

## 5. End-to-end summary

| Stage | Where | Dataset used? | Output |
|-------|--------|----------------|--------|
| **Training** | `ml_api/train.py` | **Yes** — `custom_upi_fraud_dataset.csv` | `model.joblib`, `scaler.joblib`, `defaults.json` |
| **Serving** | `ml_api/main.py` (FastAPI) | **No** | Loads model/scaler/defaults; exposes `POST /predict` |
| **Feature building** | `ml_api/features.py` | **No** | Builds one row of features from request + defaults (same columns as CSV) |
| **App usage** | Node `POST /api/upi/validate-transaction` | **No** | Calls ML API if configured, fuses with rule score, returns risk for **Pay** only |

**In short:**  
- **Dataset** = used only in **training** to train the model and compute defaults.  
- **Model** = used only at **inference** in the **Pay** flow; no dataset is read at runtime.
