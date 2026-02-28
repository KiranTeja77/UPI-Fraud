# Pay (Validate Transaction) — Test Cases

Use the **Pay** tab: enter the inputs below and click **Check before Pay**. Expected behavior is based on rule-based + ML (if ML API is running).

---

## 1. **Safe — known person, small amount**

| Field | Value |
|-------|--------|
| Receiver UPI ID | `friend@oksbi` |
| Amount (₹) | `500` |
| Description / note | `Dinner share` |
| First time paying this UPI | ☐ unchecked |

**Expected:** Low risk, "Transaction appears safe", `shouldBlock: false`, risk score typically &lt; 40.

---

## 2. **Suspicious — scam-like UPI + high amount**

| Field | Value |
|-------|--------|
| Receiver UPI ID | `9876543210@ybl` |
| Amount (₹) | `9999` |
| Description / note | `KYC update urgent send immediately` |
| First time paying this UPI | ☑ checked |

**Expected:** High risk, "Do not pay", `shouldBlock: true`, risk score ≥ 70. Indicators may include suspicious keywords, new payee, round amount.

---

## 3. **Phishing-style description**

| Field | Value |
|-------|--------|
| Receiver UPI ID | `support@paytm` |
| Amount (₹) | `5000` |
| Description / note | `Your account will be blocked. Complete KYC by paying now. Call 8765432109.` |
| First time paying this UPI | ☑ checked |

**Expected:** Medium to high risk. Keywords like "blocked", "KYC", "urgent" push score up; may be blocked (≥ 70) or caution (40–69).

---

## 4. **New payee, large round amount**

| Field | Value |
|-------|--------|
| Receiver UPI ID | `newmerchant@ybl` |
| Amount (₹) | `50000` |
| Description / note | `Product order #12345` |
| First time paying this UPI | ☑ checked |

**Expected:** Elevated risk (round amount, new payee, high amount). Score often in medium range; may or may not block depending on rules + ML.

---

## 5. **Minimal — UPI only (no amount/description)**

| Field | Value |
|-------|--------|
| Receiver UPI ID | `someone@okaxis` |
| Amount (₹) | *(leave empty or 0)* |
| Description / note | *(leave empty)* |
| First time paying this UPI | ☐ unchecked |

**Expected:** Request succeeds. Score usually low (no risky keywords, no high amount). Response includes `riskScore`, `message`, `triggeredIndicators`.

---

## 6. **Empty UPI (validation error)**

| Field | Value |
|-------|--------|
| Receiver UPI ID | *(leave empty)* |
| Amount (₹) | `100` |
| Description / note | any |
| First time paying this UPI | ☐ |

**Expected:** "Check before Pay" should be disabled (button disabled when UPI is empty). If API is called with empty `receiverUPI`, backend returns 400 "Missing required field: receiverUPI".

---

## 7. **Lottery / reward scam wording**

| Field | Value |
|-------|--------|
| Receiver UPI ID | `claim@paytm` |
| Amount (₹) | `10000` |
| Description / note | `Processing fee to claim lottery prize of Rs 25 lakh. Send immediately.` |
| First time paying this UPI | ☑ checked |

**Expected:** High risk, block. Keywords like "lottery", "prize", "claim" trigger rules (and possibly ML).

---

## Quick checklist

- [ ] Safe case (1): low score, safe message, no block.
- [ ] Scam-like (2): high score, "Do not pay", block.
- [ ] Phishing text (3): medium/high score, block or caution.
- [ ] New payee + large (4): elevated score.
- [ ] Minimal (5): valid response, low score.
- [ ] Empty UPI (6): button disabled or API 400.
- [ ] Lottery wording (7): high score, block.

**Note:** Exact scores depend on rule weights and whether the ML API is running and trained; the above are typical outcomes.
