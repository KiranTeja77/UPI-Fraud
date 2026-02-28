"""
Feature engineering for UPI fraud model.
Maps API request (text, amount, newPayee, ...) to the feature vector used by the CSV-trained model.
"""
import re
from typing import Any

# Keywords that often appear in scam messages (used to derive messageRiskScore when no rule engine)
MESSAGE_RISK_KEYWORDS = [
    "urgent", "immediately", "otp", "kyc", "verify", "blocked", "suspended",
    "lottery", "prize", "winner", "claim", "refund", "cashback", "reward",
    "fine", "penalty", "police", "arrest", "court", "legal", "bank", "rbi",
    "account", "link", "click", "pay", "send", "rs ", "₹", "money", "transfer",
]


def message_risk_score_from_text(text: str) -> float:
    """Simple rule-based message risk score 0-20 from raw text."""
    if not text or not isinstance(text, str):
        return 0.0
    t = text.lower().strip()
    score = 0.0
    for kw in MESSAGE_RISK_KEYWORDS:
        if kw in t:
            score += 1.5
    # UPI-like pattern
    if re.search(r"\d{10}@(paytm|ybl|okaxis|axl|upi)", t) or re.search(r"[\d\s]{10,}", t):
        score += 3.0
    return min(20.0, score)


def build_features(
    request: dict[str, Any],
    defaults: dict[str, float],
) -> list[float]:
    """
    Build feature vector in CSV column order:
    transactionAmount, avgUserAmount, amountDeviation, transactionsLast2Min,
    hour, deviceChanged, ipChanged, newPayee, messageRiskScore
    """
    amount = request.get("amount")
    if amount is None or amount == "":
        amount = 0.0
    try:
        transaction_amount = float(amount)
    except (TypeError, ValueError):
        transaction_amount = 0.0
    transaction_amount = max(0.0, transaction_amount)

    avg_user = defaults.get("avg_transaction_amount", 2000.0)
    amount_deviation = (transaction_amount / avg_user) if avg_user > 0 else 1.0

    new_payee = request.get("newPayee", False)
    new_payee_int = 1 if new_payee else 0

    text = request.get("text") or request.get("description") or ""
    msg_score = message_risk_score_from_text(text)
    # Blend with default if we have no text
    default_msg = defaults.get("mean_message_risk_score", 5.0)
    message_risk_score = msg_score if (text and len(text.strip()) > 2) else default_msg

    from datetime import datetime
    hour = datetime.utcnow().hour

    return [
        transaction_amount,
        avg_user,
        amount_deviation,
        float(defaults.get("transactions_last_2_min", 1)),
        float(hour),
        0.0,  # deviceChanged
        0.0,  # ipChanged
        float(new_payee_int),
        message_risk_score,
    ]
