# Project test guide — Chats, transactions, everything

Use this to verify **chats** (Scammer ↔ Victim), **Pay** (transaction validation), **Message Scanner**, **QR Scanner**, and **blacklist**. All inputs are copy-paste ready.

---

## Before you start

1. **Backend:** `npm run dev` (port 3000)  
2. **Frontend:** `cd client && npm run dev` (port 5173)  
3. **MongoDB:** running and `MONGODB_URI` set in `.env`  
4. **Optional ML:** `cd ml_api && uvicorn main:app --host 0.0.0.0 --port 5000` and `ML_FRAUD_API_URL=http://localhost:5000/predict` in `.env`

**Quick API check:** Open http://localhost:3000/health → should return `{"status":"healthy",...}`.  
Open http://localhost:5173 → UPI Fraud Shield app.

---

## 1. Message Scanner

**Where:** App → **Message Scanner** tab.

**What it does:** Pastes a message, runs rule-based + AI extraction and risk. No chat; one-off scan.

| Test | Paste this in the box | Click Scan | Expected |
|------|------------------------|------------|----------|
| Scam | `Dear Customer, your SBI account will be blocked. Complete KYC by sending Rs 9,999 to 9876543210@ybl. Call 8765432109. — SBI Bank` | Scan | High/CRITICAL risk, UPI and amount extracted |
| Safe | `Hi, sending Rs 500 for dinner. My UPI: amit@oksbi` | Scan | Low risk, UPI extracted |

---

## 2. Pay (transaction validation)

**Where:** App → **Pay** tab.

**What it does:** Validates **receiver UPI + amount + description** (rules + scam detection on description + optional ML). Blacklists high-risk UPI for next time.

Use **PAY_VALIDATION_TEST_CASES.md** for full list. Short set:

| Test | Receiver UPI ID | Amount | Description / note | New payee | Expected |
|------|------------------|--------|--------------------|-----------|----------|
| Safe | `friend@oksbi` | 500 | Dinner share | No | Low, "Transaction appears safe" |
| High risk | `9876543210@ybl` | 9999 | KYC update urgent send immediately | Yes | High, "Do not pay", block |
| Blacklist | *(same UPI as high-risk after one run)* | any | any | any | "This UPI is in our blacklist. Do not send money..." |

**Flow:** Enter fields → **Check before Pay** → read risk score and message. Run a high-risk case once, then use the same UPI again to see the blacklist message.

---

## 3. Active Defense Chat (Scammer ↔ Victim)

**Where:** App → **Active Defense Chat** tab → **Open Scammer (new tab)** and **Open Victim (new tab)** (same session).

**What it does:** Scammer sends messages; backend scores each message. If **risk ≥ 70** → honeypot replies and victim is blocked from replying. If **risk < 70** → victim can chat with scammer; messages go both ways.

### 3a) Safe chat (victim can reply)

| Who | Input |
|-----|--------|
| **Scammer tab** | Type: `hi` → Send |
| **Victim tab** | Should see "Other user: hi", risk banner low. Type: `hello how can I help` → Send |
| **Scammer tab** | Should see "Victim: hello how can I help" (after a short poll) |

### 3b) Risky message (honeypot replies, victim blocked)

| Who | Input |
|-----|--------|
| **Scammer tab** | Type: `Dear Customer, your SBI account will be blocked. Send Rs 9,999 to 9876543210@ybl for KYC. Call 8765432109.` → Send |
| **Victim tab** | Sees the scammer message, risk HIGH, "Scam Activity Detected / directed to honeypot", reply box disabled |
| **Scammer tab** | Sees a **Reply:** from the bot (honeypot), not from the victim |

### 3c) Session / polling

- Both tabs poll every ~2s. Use **Start New Session** in the main app to get a new session ID so old messages don’t mix in.

**Quick checklist**

- [ ] Safe message → victim can reply, scammer sees victim’s reply  
- [ ] Risky message (≥70) → honeypot reply on scammer side, victim reply blocked and "directed to honeypot"  
- [ ] Risk banner on victim side shows current risk (low/medium/high)

---

## 4. QR Scanner

**Where:** App → **QR Scanner** tab.

**What it does:** Upload a UPI QR image → decode and analyze risk (e.g. payment intent, amount).

| Test | Action | Expected |
|------|--------|----------|
| Upload | Choose file (image with UPI QR, e.g. PNG/JPEG of a `upi://pay?...` QR) → Scan | Extracted UPI/amount, risk score and level |

No sample image in repo; use any UPI payment QR screenshot or test image.

---

## 5. Regional Alerts & Safety Tips

**Where:** **Regional Alerts** tab, **Safety Tips** tab.

**What to do:** Select a language and (for alerts) a scan result → generate alert. Open Safety Tips and browse categories. No specific inputs; just confirm the UI loads and requests succeed (no console errors).

---

## 6. API inputs (for Postman/curl)

Use **x-api-key** header from `.env` (e.g. `API_KEY`).

**Health**

```http
GET http://localhost:3000/health
```

**Message scan**

```http
POST http://localhost:3000/api/upi/scan
Content-Type: application/json
x-api-key: YOUR_API_KEY

{"message": "Send Rs 9999 to 9876543210@ybl for KYC update urgent"}
```

**Validate transaction (Pay)**

```http
POST http://localhost:3000/api/upi/validate-transaction
Content-Type: application/json
x-api-key: YOUR_API_KEY

{"receiverUPI": "9876543210@ybl", "amount": 9999, "description": "KYC urgent", "newPayee": true}
```

**Chat — scammer sends**

```http
POST http://localhost:3000/api/chat/send
Content-Type: application/json
x-api-key: YOUR_API_KEY

{"sessionId": "test-session-001", "scammerId": "s1", "victimId": "v1", "text": "hi"}
```

**Chat — get session (victim/scammer poll)**

```http
GET http://localhost:3000/api/chat/session/test-session-001
x-api-key: YOUR_API_KEY
```

**Chat — victim reply (when risk < 70)**

```http
POST http://localhost:3000/api/chat/victim-reply
Content-Type: application/json
x-api-key: YOUR_API_KEY

{"sessionId": "test-session-001", "text": "hello back"}
```

---

## Quick sanity checklist

- [ ] Backend `/health` returns healthy  
- [ ] Frontend loads at http://localhost:5173  
- [ ] Message Scanner: scam message → high risk; safe message → low risk  
- [ ] Pay: safe UPI → low; scam-like description + UPI → high + block; same UPI again → blacklist message  
- [ ] Chat: safe message → victim can reply, scammer sees it; risky message → honeypot reply, victim blocked  
- [ ] QR: upload image → scan → result (or error if not a valid UPI QR)

If any step fails, check browser console and backend logs; ensure MongoDB is up and `.env` has `API_KEY`, `MONGODB_URI`, and optionally `GEMINI_API_KEY` and `ML_FRAUD_API_URL`.
