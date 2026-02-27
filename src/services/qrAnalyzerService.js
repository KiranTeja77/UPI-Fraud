import { analyzeTransaction } from './upiTransactionAnalyzer.js';

/**
 * QR codes are not scams by themselves.
 * The scam happens when a victim is tricked into scanning a QR
 * believing they will RECEIVE money, but the QR actually requests
 * them to SEND money (often with a pre-filled amount or scammy UPI ID).
 */

const SUSPICIOUS_UPI_KEYWORDS = ['support', 'help', 'refund', 'cashback', 'prize'];

function parseUpiPaymentUri(raw) {
    if (!raw || typeof raw !== 'string') {
        return { ok: false, error: 'Empty or invalid QR content' };
    }

    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith('upi://pay')) {
        return { ok: false, error: 'QR does not contain a UPI payment link (upi://pay)' };
    }

    try {
        const url = new URL(trimmed);
        const params = url.searchParams;

        return {
            ok: true,
            raw: trimmed,
            upiId: params.get('pa') || '',
            merchantName: params.get('pn') || '',
            amount: params.get('am') || '',
            currency: params.get('cu') || ''
        };
    } catch {
        return { ok: false, error: 'Failed to parse UPI payment URI from QR' };
    }
}

function ruleBasedQrRisk(parsed) {
    let score = 0;
    const warnings = [];

    const amountValue = parsed.amount ? Number(parsed.amount) : NaN;
    const hasAmount = !Number.isNaN(amountValue) && amountValue > 0;

    // +40 if QR includes fixed high amount (>5000)
    if (hasAmount && amountValue > 5000) {
        score += 40;
        warnings.push('High transaction amount embedded in QR');
    }

    // +30 if UPI ID contains suspicious keywords
    const upiLower = (parsed.upiId || '').toLowerCase();
    if (SUSPICIOUS_UPI_KEYWORDS.some(k => upiLower.includes(k))) {
        score += 30;
        warnings.push('Suspicious UPI ID pattern');
    }

    // +20 if no merchant name
    if (!parsed.merchantName) {
        score += 20;
        warnings.push('No merchant name provided in QR');
    }

    // +30 if amount exists (QR requesting payment)
    if (hasAmount) {
        score += 30;
        warnings.push('QR is requesting a payment');
    }

    return { riskScore: Math.min(score, 100), warnings };
}

function scoreToLevel(score) {
    if (score > 85) return { riskLevel: 'CRITICAL', riskColor: '#dc2626', riskEmoji: '🚨' };
    if (score > 70) return { riskLevel: 'HIGH', riskColor: '#ea580c', riskEmoji: '⚠️' };
    if (score > 40) return { riskLevel: 'MEDIUM', riskColor: '#d97706', riskEmoji: '🔶' };
    return { riskLevel: 'LOW', riskColor: '#16a34a', riskEmoji: '✅' };
}

export async function analyzeUpiQr(rawQrString) {
    const parsed = parseUpiPaymentUri(rawQrString);
    if (!parsed.ok) {
        return { ok: false, error: parsed.error };
    }

    const extracted = {
        upiId: parsed.upiId || null,
        merchantName: parsed.merchantName || null,
        amount: parsed.amount || null
    };

    const rule = ruleBasedQrRisk(parsed);

    // Optional AI enhancement via existing analyzeTransaction()
    const txnForAI = {
        senderUPI: 'unknown',
        receiverUPI: extracted.upiId || 'unknown',
        amount: extracted.amount ? Number(extracted.amount) : 1,
        type: 'P2P',
        description: parsed.raw,
        isNewPayee: true,
        source: 'QR_SCAN'
    };

    let aiAnalysis = null;
    try {
        aiAnalysis = await analyzeTransaction(txnForAI);
    } catch {
        aiAnalysis = null;
    }

    const mergedScore = aiAnalysis?.riskScore !== undefined
        ? Math.max(rule.riskScore, aiAnalysis.riskScore)
        : rule.riskScore;

    const merged = scoreToLevel(mergedScore);

    const warnings = Array.from(new Set([
        ...rule.warnings,
        ...(aiAnalysis?.indicators?.map(i => i.label).filter(Boolean) || []),
        'QR codes are used to SEND money, not receive money.'
    ]));

    const recommendedActions = Array.from(new Set([
        'Do not scan QR to receive money.',
        'Verify merchant before proceeding.',
        'If unsure, avoid payment.',
        ...(aiAnalysis?.recommendedActions || [])
    ]));

    return {
        ok: true,
        extracted,
        analysis: {
            riskScore: mergedScore,
            riskLevel: merged.riskLevel,
            riskColor: merged.riskColor,
            riskEmoji: merged.riskEmoji,
            isHighRisk: merged.riskLevel === 'HIGH' || merged.riskLevel === 'CRITICAL',
            fraudCategory: { name: 'QR Payment Scam', icon: '📷' },
            warnings,
            recommendedActions,
            reasoning: 'QR codes are used to SEND money, not receive money.'
        }
    };
}

export default { analyzeUpiQr };

