# How We Classify Risk — What Happens on the Inside

You give: **UPI ID**, **amount**, **cause/description**, and **first-time payee**. Rules are clear, but **how do we know if a UPI is a scammer?** And **what is the ML actually doing inside?** This doc answers that.

---

## 1. We don’t “know” the UPI in the ML model

The ML model **never sees the UPI ID**.  
Its input is **only 9 numbers** (same as the training CSV columns):

| What we have from user | What the model gets |
|------------------------|---------------------|
| UPI ID                 | **Not used by ML**  |
| Amount                 | → `transactionAmount`, `amountDeviation` |
| Cause/description      | → **rule-based** `messageRiskScore` (keywords + patterns) |
| First-time payee       | → `newPayee` (0 or 1) |
| (nothing)              | `avgUserAmount`, `transactionsLast2Min`, `hour`, `deviceChanged`, `ipChanged` → **defaults** from training |

So the model does **not** classify “is this UPI a scammer?”.  
It classifies: **“Does this transaction (amount + description + new payee + time, etc.) look like the fraud examples we saw in the dataset?”**

---

## 2. So how do we know if a UPI is a scammer?

In two ways — and only one of them uses ML.

### A) Blacklist (we already “know” this UPI)

- When **any** check (rules + description + ML) gives **risk ≥ 70**, we **add that UPI to the blacklist**.
- Next time someone enters **the same UPI**, we **don’t even call the model**. We just see “this UPI is in the blacklist” → **block, “do not pay”.**
- So “is this UPI a scammer?” = **“Is it on the blacklist?”** → yes = we’ve already flagged it from a previous high-risk transaction.

### B) This transaction’s pattern (rules + description + ML)

- For a **new UPI** (not on blacklist), we only have: **this one transaction**: amount, description, new payee.
- **Rules:** amount checks, new payee, etc.
- **Description:** scam detection on “cause” (keywords, urgency, UPI-like text) → score.
- **ML:** “Do these 9 numbers look like fraud in the training data?” → probability.

We **fuse** rule score + description score + ML score. If the **combined** score is high enough, we say “this transaction is risky” and **then** add the UPI to the blacklist. So we don’t “know” the UPI is a scammer from a database of scammer UPIs; we **infer** from “this transaction looks bad” and then **remember** the UPI for next time.

**Summary:**  
- **Blacklist** = “we’ve seen this UPI in a high-risk situation before.”  
- **Rules + ML** = “this **transaction** (amount + cause + new payee) looks risky.”  
ML does not get UPI; it only helps score the **transaction**. The “scammer UPI” knowledge is built by **adding high-risk UPIs to the blacklist** after we flag a transaction.

---

## 3. Why the dataset is only for training (and why we still need it)

- The **dataset** has many rows of **past transactions** with a **fraud label** (0/1).  
- We use it **only in training** to teach the model: “when these 9 numbers look **like this**, it was fraud; when they look **like that**, it was safe.”  
- After training, we save **model + scaler + defaults**. At runtime we **don’t** load the dataset; we only use the **saved model** and build the **same 9 numbers** from the current request (amount, description → messageRiskScore, newPayee, defaults).

So:
- **Dataset** = used once to **train** the model (so it learns what “fraud-like” vs “safe-like” **patterns** are).
- **Runtime** = we only need **this one transaction’s** 9 features; the model already encoded “what fraud looks like” in its weights.

We **do** need the dataset to **train**; we **don’t** need it for each validation — the trained model is enough.

---

## 4. What the model does on the inside (classification)

- **Model:** Random Forest (100 trees, max depth 12).  
- **Input:** One row of 9 features (same order as the CSV), scaled with the saved `StandardScaler`.  
- **Output:** Probability of class 1 (fraud), 0–1.

**What the Random Forest is effectively doing:**  
It learned from the dataset that certain **combinations** of the 9 numbers are more common in fraud than in safe transactions. For example (conceptually):

- High `messageRiskScore` (scammy description) **and** `newPayee = 1` **and** high `amountDeviation` → tends to be fraud in the dataset → high probability.
- Low `messageRiskScore`, `newPayee = 0`, normal amount → tends to be safe → low probability.

So **inside**, we’re not “looking up” the UPI. We’re **pattern-matching** the **current transaction’s 9 numbers** against what the model learned from the **training dataset**. The more the current transaction “looks like” the fraud rows in that dataset, the higher the fraud probability.

**What we actually send to the model from the Pay form:**

- **Amount** → `transactionAmount`, and with default `avgUserAmount` → `amountDeviation`.
- **Cause/description** → turned into `messageRiskScore` by a **fixed rule** in `ml_api/features.py` (keywords like “urgent”, “otp”, “refund”, UPI-like patterns, etc.).
- **First-time payee** → `newPayee` 0 or 1.
- **Time** → current `hour`.
- **Rest** (avg user amount, transactions in last 2 min, device/IP change) → **defaults**, because we don’t have that data in the Pay form.

So the “inside” classification is: **same 9 features as training → scale → Random Forest → P(fraud)**. No UPI, no list of scammer IDs — only transaction-level pattern matching.

---

## 5. End-to-end in one picture

```
User enters: UPI, amount, cause, first-time payee?
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Is this UPI on the blacklist?                              │
│    → Yes: return "Do not pay, blacklisted" (no ML).           │
│    → No: continue.                                            │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Rules: amount, new payee, etc. → rule score.               │
│ 3. Description: scam detection on cause → description score.  │
│ 4. ML: amount + cause (→ messageRiskScore) + newPayee +       │
│        defaults → 9 features → model → P(fraud).              │
│    Fuse: final = 0.6 × (rule/description) + 0.4 × ML.         │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. If final risk ≥ 70 → add this UPI to blacklist.            │
│    Next time someone enters this UPI → we “know” it (step 1). │
└──────────────────────────────────────────────────────────────┘
```

So: **rules** and **description** are straightforward. **“How do we know if the UPI is a scammer?”** = blacklist (from past high-risk validations) + “this transaction looks bad” (rules + ML on amount/cause/new payee). **What we do on the inside** = build 9 numbers from UPI/amount/cause/new payee (UPI only used for blacklist and description text, not as an ML feature), then one Random Forest prediction that says how much this **transaction** looks like fraud from the training data.
