import OpenAI from 'openai';
import config from '../config/config.js';

let gemini = null;

function initializeAI() {
    if (!gemini && config.geminiApiKey) {
        gemini = new OpenAI({
            apiKey: config.geminiApiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
        });
    }
}

// ─── Fraud Pattern Definitions ───
const FRAUD_PATTERNS = {
    highAmount: {
        check: (txn) => txn.amount > 50000,
        weight: 15,
        label: 'Unusually high transaction amount'
    },
    veryHighAmount: {
        check: (txn) => txn.amount > 200000,
        weight: 25,
        label: 'Extremely high amount (>₹2,00,000)'
    },
    roundAmount: {
        check: (txn) => txn.amount >= 1000 && txn.amount % 1000 === 0,
        weight: 5,
        label: 'Round-number amount (common in scams)'
    },
    midnightTransaction: {
        check: (txn) => {
            const hour = txn.hour ?? new Date().getHours();
            return hour >= 0 && hour < 5;
        },
        weight: 15,
        label: 'Transaction during unusual hours (midnight–5AM)'
    },
    lateNightTransaction: {
        check: (txn) => {
            const hour = txn.hour ?? new Date().getHours();
            return hour >= 22 || hour < 6;
        },
        weight: 8,
        label: 'Late-night transaction'
    },
    newPayee: {
        check: (txn) => txn.isNewPayee === true,
        weight: 12,
        label: 'First-time payee (new beneficiary)'
    },
    suspiciousDescription: {
        check: (txn) => {
            const desc = (txn.description || '').toLowerCase();
            const redFlags = ['urgent', 'immediately', 'otp', 'kyc', 'verify',
                'blocked', 'suspended', 'lottery', 'prize', 'winner', 'claim',
                'refund', 'cashback', 'reward', 'lucky', 'selected', 'offer',
                'fine', 'penalty', 'police', 'arrest', 'court', 'legal'];
            return redFlags.some(flag => desc.includes(flag));
        },
        weight: 20,
        label: 'Suspicious keywords in description'
    },
    p2pToMerchant: {
        check: (txn) => txn.type === 'P2P' && txn.amount > 10000,
        weight: 8,
        label: 'Large P2P transfer (potential mule account)'
    },
    rapidSuccession: {
        check: (txn) => txn.isRapid === true,
        weight: 18,
        label: 'Rapid successive transactions detected'
    },
    knownScamUPI: {
        check: (txn) => {
            const receiver = (txn.receiverUPI || '').toLowerCase();
            const suspiciousHandles = ['@ybl', '@axl', '@idfcfirst'];
            // Flag if the UPI looks auto-generated (long numeric prefix)
            const numericPrefix = receiver.match(/^(\d+)@/);
            if (numericPrefix && numericPrefix[1].length > 8) return true;
            return false;
        },
        weight: 10,
        label: 'Receiver UPI ID appears auto-generated or suspicious'
    },
    qrCodeTransaction: {
        check: (txn) => txn.source === 'QR_SCAN',
        weight: 10,
        label: 'QR code initiated transaction (verify QR source)'
    }
};

// ─── Fraud Categories ───
const FRAUD_CATEGORIES = {
    PHISHING: { name: 'Phishing Attack', icon: '🎣', keywords: ['kyc', 'verify', 'update', 'link', 'click', 'login', 'password'] },
    QR_SCAM: { name: 'QR Code Scam', icon: '📱', keywords: ['qr', 'scan', 'receive', 'collect'] },
    OTP_FRAUD: { name: 'OTP Fraud', icon: '🔢', keywords: ['otp', 'pin', 'code', 'share', 'tell'] },
    VISHING: { name: 'Vishing (Voice Phishing)', icon: '📞', keywords: ['call', 'phone', 'customer care', 'support', 'bank manager'] },
    LOTTERY_SCAM: { name: 'Lottery/Reward Scam', icon: '🎰', keywords: ['lottery', 'prize', 'winner', 'reward', 'cashback', 'lucky'] },
    JOB_SCAM: { name: 'Fake Job Scam', icon: '💼', keywords: ['job', 'hiring', 'part-time', 'work from home', 'daily income', 'task'] },
    IMPERSONATION: { name: 'Impersonation Fraud', icon: '🎭', keywords: ['rbi', 'government', 'police', 'court', 'income tax', 'bank official'] },
    REMOTE_ACCESS: { name: 'Remote Access Scam', icon: '💻', keywords: ['anydesk', 'teamviewer', 'download', 'install', 'apk', 'app'] },
    INVESTMENT_SCAM: { name: 'Investment Scam', icon: '📈', keywords: ['invest', 'return', 'profit', 'double', 'guaranteed', 'crypto', 'trading'] }
};

/**
 * Rule-based fraud score calculation
 */
function calculateRuleScore(transaction) {
    let score = 0;
    const indicators = [];

    for (const [key, pattern] of Object.entries(FRAUD_PATTERNS)) {
        try {
            if (pattern.check(transaction)) {
                score += pattern.weight;
                indicators.push({
                    id: key,
                    label: pattern.label,
                    severity: pattern.weight >= 15 ? 'HIGH' : pattern.weight >= 10 ? 'MEDIUM' : 'LOW'
                });
            }
        } catch (e) {
            // Skip broken pattern
        }
    }

    return { score: Math.min(score, 100), indicators };
}

/**
 * Detect fraud category from transaction context
 */
function detectCategory(transaction) {
    const text = `${transaction.description || ''} ${transaction.senderUPI || ''} ${transaction.receiverUPI || ''} ${transaction.source || ''}`.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, cat] of Object.entries(FRAUD_CATEGORIES)) {
        const matchCount = cat.keywords.filter(kw => text.includes(kw)).length;
        if (matchCount > bestScore) {
            bestScore = matchCount;
            bestMatch = { key, ...cat };
        }
    }

    if (transaction.source === 'QR_SCAN') {
        return { key: 'QR_SCAM', ...FRAUD_CATEGORIES.QR_SCAM };
    }

    return bestMatch;
}

/**
 * AI-powered fraud analysis via Gemini
 */
async function analyzeWithAI(transaction) {
    initializeAI();
    if (!gemini) return null;

    try {
        const prompt = `You are an expert UPI fraud analyst for Indian digital payments. Analyze this UPI transaction for potential fraud.

Transaction Details:
- Sender UPI: ${transaction.senderUPI || 'unknown'}
- Receiver UPI: ${transaction.receiverUPI || 'unknown'}
- Amount: ₹${transaction.amount}
- Type: ${transaction.type || 'P2P'}
- Description/Note: "${transaction.description || 'none'}"
- Source: ${transaction.source || 'manual'}
- Time: ${transaction.timestamp || new Date().toISOString()}
- Is New Payee: ${transaction.isNewPayee ? 'Yes' : 'No'}

Evaluate for ALL types of UPI fraud: phishing, QR scams, OTP fraud, vishing, lottery scams, job scams, impersonation, remote access scams, investment fraud.

Respond ONLY with valid JSON:
{
  "riskScore": 0-100,
  "isHighRisk": true/false,
  "fraudCategory": "category name or null",
  "reasoning": "brief explanation",
  "indicators": ["list of suspicious elements"],
  "recommendedAction": "what user should do",
  "confidence": 0.0-1.0
}`;

        const response = await gemini.chat.completions.create({
            model: config.geminiModel,
            messages: [
                { role: 'system', content: 'You are a UPI fraud detection expert. Always respond with valid JSON only. Be strict — flag anything suspicious.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 600,
            temperature: 0.1
        });

        let text = response.choices[0]?.message?.content || '';
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (error) {
        console.error('AI fraud analysis error:', error.message);
        return null;
    }
}

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
    if (score >= 75) return { level: 'CRITICAL', color: '#dc2626', emoji: '🚨' };
    if (score >= 50) return { level: 'HIGH', color: '#ea580c', emoji: '⚠️' };
    if (score >= 25) return { level: 'MEDIUM', color: '#d97706', emoji: '🔶' };
    return { level: 'LOW', color: '#16a34a', emoji: '✅' };
}

/**
 * Generate recommended actions based on risk
 */
function getRecommendedActions(riskScore, category) {
    const actions = [];

    if (riskScore >= 75) {
        actions.push('🚫 BLOCK this transaction immediately');
        actions.push('📞 Call your bank\'s fraud helpline');
        actions.push('📱 Report to Cyber Crime helpline: 1930');
        actions.push('🔒 Change your UPI PIN immediately');
    } else if (riskScore >= 50) {
        actions.push('⏸️ Hold this transaction and verify the payee');
        actions.push('🔍 Double-check the receiver\'s identity');
        actions.push('📞 Call the person directly to confirm');
        actions.push('⚠️ Never share OTP or UPI PIN with anyone');
    } else if (riskScore >= 25) {
        actions.push('👀 Review transaction details carefully');
        actions.push('✅ Verify the receiver is known to you');
        actions.push('🔐 Ensure you are on official app (not a link)');
    } else {
        actions.push('✅ Transaction appears safe');
        actions.push('💡 Always verify before large transfers');
    }

    if (category) {
        switch (category.key) {
            case 'QR_SCAM':
                actions.push('📱 Never scan QR codes sent by strangers');
                actions.push('⚠️ QR codes are for PAYING, not RECEIVING money');
                break;
            case 'OTP_FRAUD':
                actions.push('🔒 NEVER share OTP with anyone — banks never ask for it');
                break;
            case 'PHISHING':
                actions.push('🔗 Do NOT click suspicious links — use official bank apps only');
                break;
            case 'VISHING':
                actions.push('📞 Hang up and call your bank on the number printed on your card');
                break;
        }
    }

    return [...new Set(actions)];
}

/**
 * Main analysis function — combines rule-based + AI scoring
 */
export async function analyzeTransaction(transaction) {
    const startTime = Date.now();

    // Normalize transaction
    const txn = {
        ...transaction,
        amount: Number(transaction.amount) || 0,
        hour: transaction.timestamp ? new Date(transaction.timestamp).getHours() : new Date().getHours(),
        timestamp: transaction.timestamp || new Date().toISOString()
    };

    // Rule-based analysis
    const ruleResult = calculateRuleScore(txn);

    // AI analysis
    const aiResult = await analyzeWithAI(txn);

    // Detect fraud category
    const category = detectCategory(txn);

    // Combine scores: take the higher of rule-based and AI scores
    let finalScore = ruleResult.score;
    let allIndicators = [...ruleResult.indicators];

    if (aiResult) {
        finalScore = Math.max(ruleResult.score, aiResult.riskScore || 0);

        if (aiResult.indicators) {
            aiResult.indicators.forEach(ind => {
                allIndicators.push({
                    id: 'ai_' + allIndicators.length,
                    label: ind,
                    severity: 'AI'
                });
            });
        }
    }

    // Cap at 100
    finalScore = Math.min(Math.round(finalScore), 100);

    const riskLevel = getRiskLevel(finalScore);
    const finalCategory = (aiResult?.fraudCategory && aiResult.fraudCategory !== 'null')
        ? { key: 'AI_DETECTED', name: aiResult.fraudCategory, icon: '🤖' }
        : category;

    const recommendedActions = getRecommendedActions(finalScore, finalCategory);

    return {
        transactionId: txn.transactionId || `txn_${Date.now()}`,
        riskScore: finalScore,
        riskLevel: riskLevel.level,
        riskColor: riskLevel.color,
        riskEmoji: riskLevel.emoji,
        isHighRisk: finalScore >= 50,
        fraudCategory: finalCategory ? { name: finalCategory.name, icon: finalCategory.icon } : null,
        indicators: allIndicators,
        recommendedActions,
        reasoning: aiResult?.reasoning || `Rule-based analysis detected ${ruleResult.indicators.length} risk indicator(s).`,
        aiAnalysis: aiResult ? true : false,
        analysisTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
    };
}

export default { analyzeTransaction };
