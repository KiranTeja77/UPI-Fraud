/**
 * ML Fraud Service — integrates custom ML fraud probability with existing risk scoring.
 * - Calls optional ML API for fraud probability (0–1).
 * - Fuses with existing score: FinalRisk = (Existing × 0.6) + (MLScore × 0.4).
 * - On ML failure/timeout: fallback to existing score only.
 * - Logs ML probability for monitoring.
 */

const WEIGHT_EXISTING = 0.6;
const WEIGHT_ML = 0.4;
const DEFAULT_ML_TIMEOUT_MS = 150;

/**
 * Fetch ML fraud probability from external service (e.g. Python model API).
 * Expects POST body: { text, amount?, receiverUPI?, description? }
 * Expects response: { probability: number (0-1), indicators?: string[] }
 * @param {{ text: string, transaction?: object }} payload
 * @returns {Promise<{ probability: number, indicators: string[] } | null>}
 */
export async function getMlFraudProbability(payload) {
  const url = process.env.ML_FRAUD_API_URL || process.env.ML_FRAUD_API;
  if (!url || !url.trim()) return null;

  const timeoutMs = Math.min(
    Number(process.env.ML_FRAUD_TIMEOUT_MS) || DEFAULT_ML_TIMEOUT_MS,
    180
  );
  const body = {
    text: payload.text || '',
    amount: payload.transaction?.amount,
    receiverUPI: payload.transaction?.receiverUPI,
    description: payload.transaction?.description || payload.text,
    newPayee: payload.transaction?.isNewPayee ?? false
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const prob = data.probability ?? data.fraudProbability ?? data.fraud_probability;
    if (typeof prob !== 'number' || prob < 0 || prob > 1) return null;
    const indicators = Array.isArray(data.indicators)
      ? data.indicators.map((i) => (typeof i === 'string' ? i : i.label || String(i)))
      : [];
    return { probability: prob, indicators };
  } catch (err) {
    clearTimeout(timeoutId);
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[ML Fraud] Service unavailable or timeout:', err.message || err);
    }
    return null;
  }
}

/**
 * Convert ML probability (0–1) to 0–100 score and fuse with existing score.
 * FinalRisk = (ExistingScore × 0.6) + (MLScore × 0.4), clamped 0–100.
 */
function fuseScores(existingScore, mlProbability) {
  const mlScore = Math.min(100, Math.max(0, mlProbability * 100));
  const fused = existingScore * WEIGHT_EXISTING + mlScore * WEIGHT_ML;
  return Math.min(100, Math.max(0, Math.round(fused)));
}

function getLevelFromScore(score) {
  if (score >= 85) return { riskLevel: 'CRITICAL', riskColor: '#dc2626', riskEmoji: '🚨' };
  if (score >= 70) return { riskLevel: 'HIGH', riskColor: '#ea580c', riskEmoji: '⚠️' };
  if (score >= 40) return { riskLevel: 'MEDIUM', riskColor: '#d97706', riskEmoji: '🔶' };
  return { riskLevel: 'LOW', riskColor: '#16a34a', riskEmoji: '✅' };
}

/**
 * Merge ML indicators into existing indicators (avoid duplicates, prefix ML).
 * existingRisk.indicators can be strings or { label: string }.
 */
function mergeIndicators(existingIndicators, mlIndicators) {
  const existingLabels = new Set(
    (existingIndicators || []).map((i) => (typeof i === 'string' ? i : i.label || ''))
  );
  const out = [...(existingIndicators || [])];
  for (const label of mlIndicators || []) {
    const mlLabel = typeof label === 'string' ? `ML: ${label}` : `ML: ${label.label || label}`;
    if (mlLabel && !existingLabels.has(mlLabel)) {
      existingLabels.add(mlLabel);
      out.push(mlLabel);
    }
  }
  return out;
}

/**
 * Fuse existing risk (from mergeRiskResults) with ML result.
 * Preserves fraudCategory, reasoning, recommendedActions; updates score, level, indicators.
 * Logs ML probability for monitoring.
 * @param {object} existingRisk - { riskScore, riskLevel, riskColor, riskEmoji, indicators, fraudCategory, reasoning, recommendedActions }
 * @param {{ probability: number, indicators: string[] }} mlResult
 * @returns {object} New risk object (same shape as existingRisk).
 */
export function applyMlFusion(existingRisk, mlResult) {
  if (!existingRisk || typeof mlResult?.probability !== 'number') return existingRisk;

  const fusedScore = fuseScores(existingRisk.riskScore ?? 0, mlResult.probability);
  const { riskLevel, riskColor, riskEmoji } = getLevelFromScore(fusedScore);
  const indicators = mergeIndicators(existingRisk.indicators, mlResult.indicators);

  if (process.env.NODE_ENV !== 'test') {
    console.info('[ML Fraud] probability=', mlResult.probability.toFixed(4), 'fusedScore=', fusedScore, 'existingScore=', existingRisk.riskScore);
  }

  return {
    ...existingRisk,
    riskScore: fusedScore,
    riskLevel,
    riskColor,
    riskEmoji,
    indicators,
    mlProbability: mlResult.probability
  };
}

/**
 * Apply ML fusion to scan analysis (upiTransactionAnalyzer shape).
 * Same fusion formula; merges indicators; preserves recommendedActions, reasoning, etc.
 */
export function applyMlFusionToScanAnalysis(analysis, mlResult) {
  if (!analysis || typeof mlResult?.probability !== 'number') return analysis;

  const fusedScore = fuseScores(analysis.riskScore ?? 0, mlResult.probability);
  const level = getRiskLevelForScan(fusedScore);
  const baseIndicators = Array.isArray(analysis.indicators) ? [...analysis.indicators] : [];
  const mlLabels = (mlResult.indicators || []).map((l) => (typeof l === 'string' ? `ML: ${l}` : `ML: ${l.label || l}`));
  mlLabels.forEach((label, idx) => {
    baseIndicators.push({ id: `ml_${idx}`, label, severity: 'ML' });
  });

  if (process.env.NODE_ENV !== 'test') {
    console.info('[ML Fraud] scan probability=', mlResult.probability.toFixed(4), 'fusedScore=', fusedScore);
  }

  return {
    ...analysis,
    riskScore: fusedScore,
    riskLevel: level.level,
    riskColor: level.color,
    riskEmoji: level.emoji,
    isHighRisk: fusedScore >= 50,
    indicators: baseIndicators,
    mlProbability: mlResult.probability
  };
}

function getRiskLevelForScan(score) {
  if (score >= 75) return { level: 'CRITICAL', color: '#dc2626', emoji: '🚨' };
  if (score >= 50) return { level: 'HIGH', color: '#ea580c', emoji: '⚠️' };
  if (score >= 25) return { level: 'MEDIUM', color: '#d97706', emoji: '🔶' };
  return { level: 'LOW', color: '#16a34a', emoji: '✅' };
}

export default {
  getMlFraudProbability,
  applyMlFusion,
  applyMlFusionToScanAnalysis,
  fuseScores
};
