/**
 * OTP-related fraud detection for chat messages and descriptions.
 * Detects OTP request language and urgency; returns risk increment and indicators.
 * Case-insensitive and safe for malformed input.
 */

// 4–8 digit numeric pattern (possible OTP / verification code)
const OTP_NUMERIC_REGEX = /\b\d{4,8}\b/g;

/** Phrases that suggest someone is asking the victim to share/send OTP */
const OTP_REQUEST_PHRASES = [
  'share otp',
  'share your otp',
  'tell me otp',
  'tell me your otp',
  'send otp',
  'send your otp',
  'verification code',
  'one time password',
  'resend code',
  'confirm otp',
  'confirm your otp',
  'enter otp',
  'enter your otp',
  'type otp',
  'provide otp',
  'give otp',
  'share the otp',
  'send the otp',
  'what is your otp',
  'share verification code',
  'send verification code',
];

/** Urgency words that amplify OTP fraud risk */
const URGENCY_WORDS = ['urgent', 'urgently', 'now', 'fast', 'immediately', 'asap', 'right now', 'quick', 'quickly'];

const RISK_OTP_ONLY = 40;
const RISK_OTP_WITH_URGENCY = 60;

/**
 * Detect OTP-related fraud language in a message.
 * - Detects 4–8 digit numeric patterns (possible OTP).
 * - Detects phrases like "share otp", "verification code", "resend code", etc.
 * - If OTP request language found: riskIncrement 40.
 * - If OTP request + urgency words: riskIncrement 60.
 *
 * @param {string} message - Raw message (chat or description)
 * @returns {{ riskIncrement: number, indicators: string[] }}
 */
function detectOtpFraud(message) {
  const result = { riskIncrement: 0, indicators: [] };

  if (message == null || typeof message !== 'string') {
    return result;
  }

  const text = message.trim();
  if (text.length === 0) return result;

  const lower = text.toLowerCase();
  const indicators = [];

  // Check for OTP request phrases (case-insensitive)
  let hasOtpRequest = false;
  for (const phrase of OTP_REQUEST_PHRASES) {
    if (lower.includes(phrase)) {
      hasOtpRequest = true;
      indicators.push(`OTP request phrase: "${phrase}"`);
      break; // one indicator for OTP request is enough
    }
  }

  // Also flag standalone "otp" in a request context (e.g. "share otp", "send otp" already covered)
  if (!hasOtpRequest && /\botp\b/.test(lower)) {
    // Check for numeric pattern nearby (possible "your otp is 123456")
    const hasOtpNumeric = OTP_NUMERIC_REGEX.test(text);
    if (hasOtpNumeric) {
      hasOtpRequest = true;
      indicators.push('OTP mentioned with numeric code');
    }
  }

  // 4–8 digit pattern (possible OTP in message) — add indicator only; increment only when request language found
  const numericMatches = text.match(OTP_NUMERIC_REGEX);
  if (numericMatches && numericMatches.length > 0 && !indicators.some((i) => i.includes('numeric'))) {
    indicators.push(`Possible OTP/code: ${numericMatches.length} numeric sequence(s) (4–8 digits)`);
  }

  if (!hasOtpRequest) {
    return result;
  }

  // Check for urgency words
  let hasUrgency = false;
  for (const word of URGENCY_WORDS) {
    if (lower.includes(word)) {
      hasUrgency = true;
      indicators.push(`Urgency language: "${word}"`);
      break;
    }
  }

  result.riskIncrement = hasUrgency ? RISK_OTP_WITH_URGENCY : RISK_OTP_ONLY;
  result.indicators = [...new Set(indicators)];

  return result;
}

export { detectOtpFraud, OTP_REQUEST_PHRASES, URGENCY_WORDS };
export default detectOtpFraud;
