import { detectScam } from './scamDetector.js';
import { extractTransactionFromMessage } from './messageExtractor.js';
import { analyzeTransaction } from './upiTransactionAnalyzer.js';
import { analyzeUpiQr } from './qrAnalyzerService.js';

function normalizeScoreToLevel(score) {
  if (score >= 85) return { riskLevel: 'CRITICAL', riskColor: '#dc2626', riskEmoji: '🚨' };
  if (score >= 70) return { riskLevel: 'HIGH', riskColor: '#ea580c', riskEmoji: '⚠️' };
  if (score >= 40) return { riskLevel: 'MEDIUM', riskColor: '#d97706', riskEmoji: '🔶' };
  return { riskLevel: 'LOW', riskColor: '#16a34a', riskEmoji: '✅' };
}

/**
 * Run combined risk analysis for an incoming scammer message.
 * Reuses existing scam, transaction, and QR analyzers.
 */
export async function runDefenseAnalysis(text, session = null) {
  const trimmed = text.trim();
  const conversationHistory = session?.conversationHistory || [];

  const parts = {
    scam: null,
    transaction: null,
    qr: null,
  };

  // 1) General scam detection (text-level)
  try {
    parts.scam = await detectScam(trimmed, conversationHistory);
  } catch (error) {
    console.error('ActiveDefense scam detect error:', error);
  }

  // 2) Structured transaction extraction + risk
  try {
    const extracted = await extractTransactionFromMessage(trimmed);
    if (!extracted.error) {
      const txn = {
        senderUPI: extracted.senderUPI || 'unknown',
        receiverUPI: extracted.receiverUPI || (extracted.allUpiIds?.[0] ?? 'unknown'),
        amount: extracted.amount || 1,
        type: extracted.transactionType || 'P2P',
        description: extracted.rawMessage,
        isNewPayee: extracted.isNewPayee ?? true,
        source: extracted.source || 'SMS',
      };
      parts.transaction = await analyzeTransaction(txn);
    }
  } catch (error) {
    console.error('ActiveDefense transaction analysis error:', error);
  }

  // 3) QR / UPI URI analysis if content looks like a QR payload
  if (trimmed.toLowerCase().includes('upi://pay')) {
    try {
      const qrResult = await analyzeUpiQr(trimmed);
      if (qrResult?.ok) {
        parts.qr = qrResult;
      }
    } catch (error) {
      console.error('ActiveDefense QR analysis error:', error);
    }
  }

  // 4) Merge scores
  const candidates = [];
  if (parts.transaction?.riskScore != null) candidates.push({ source: 'transaction', score: parts.transaction.riskScore });
  if (parts.qr?.analysis?.riskScore != null) candidates.push({ source: 'qr', score: parts.qr.analysis.riskScore });
  if (parts.scam?.confidence != null) {
    const scamScore = Math.round((parts.scam.confidence || 0) * 100);
    candidates.push({ source: 'scam', score: scamScore });
  }

  const best = candidates.length
    ? candidates.reduce((acc, c) => (c.score > acc.score ? c : acc), candidates[0])
    : { source: 'none', score: 0 };

  let riskScore = best.score;
  if (!Number.isFinite(riskScore)) riskScore = 0;

  let riskLevel = 'LOW';
  let riskColor = '#16a34a';
  let riskEmoji = '✅';
  let fraudCategory = null;
  const indicators = [];
  const warnings = [];
  const recommendedActions = [];
  const reasoningParts = [];

  if (best.source === 'transaction' && parts.transaction) {
    const t = parts.transaction;
    riskLevel = t.riskLevel;
    riskColor = t.riskColor;
    riskEmoji = t.riskEmoji;
    fraudCategory = t.fraudCategory || fraudCategory;
    if (Array.isArray(t.indicators)) {
      t.indicators.forEach(i => indicators.push(i.label || i));
    }
    if (Array.isArray(t.recommendedActions)) {
      recommendedActions.push(...t.recommendedActions);
    }
    if (t.reasoning) reasoningParts.push(t.reasoning);
  }

  if (best.source === 'qr' && parts.qr?.analysis) {
    const q = parts.qr.analysis;
    riskLevel = q.riskLevel;
    riskColor = q.riskColor;
    riskEmoji = q.riskEmoji;
    fraudCategory = q.fraudCategory || fraudCategory;
    if (Array.isArray(q.warnings)) warnings.push(...q.warnings);
    if (Array.isArray(q.recommendedActions)) recommendedActions.push(...q.recommendedActions);
    if (q.reasoning) reasoningParts.push(q.reasoning);
  }

  if (best.source === 'scam' && parts.scam) {
    const s = parts.scam;
    const level = normalizeScoreToLevel(riskScore);
    riskLevel = level.riskLevel;
    riskColor = level.riskColor;
    riskEmoji = level.riskEmoji;
    if (Array.isArray(s.indicators)) indicators.push(...s.indicators);
    if (s.reasoning) reasoningParts.push(s.reasoning);
    if (s.scamType) {
      fraudCategory = fraudCategory || { name: s.scamType, icon: '🎭' };
    }
  }

  // Fallback if nothing contributed a level
  if (!candidates.length) {
    const base = normalizeScoreToLevel(0);
    riskLevel = base.riskLevel;
    riskColor = base.riskColor;
    riskEmoji = base.riskEmoji;
  }

  const uniqueIndicators = [...new Set(indicators)];
  const uniqueWarnings = [...new Set(warnings)];
  const uniqueActions = [...new Set(recommendedActions)];

  return {
    riskScore,
    riskLevel,
    riskColor,
    riskEmoji,
    isHighRisk: riskScore >= 70,
    fraudCategory,
    indicators: uniqueIndicators,
    warnings: uniqueWarnings,
    recommendedActions: uniqueActions,
    reasoning: reasoningParts.join(' ') || 'Combined rule-based and AI analysis of the message.',
  };
}

const FALLBACK_DEFENSIVE_REPLIES = [
  "For security reasons, I cannot proceed with this request.",
  "I do not share OTP, PIN, or banking credentials with anyone.",
  "Please use only official bank apps and support channels for payments.",
  "I will not scan QR codes or click links sent over chat.",
];

export function pickDefensiveReply() {
  const idx = Math.floor(Math.random() * FALLBACK_DEFENSIVE_REPLIES.length);
  return FALLBACK_DEFENSIVE_REPLIES[idx];
}

export default { runDefenseAnalysis, pickDefensiveReply };

