import OpenAI from 'openai';
import config from '../config/config.js';

// Initialize Gemini client (OpenAI-compatible)
let gemini = null;

function initializeAI() {
    if (!gemini && config.geminiApiKey) {
        gemini = new OpenAI({
            apiKey: config.geminiApiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
        });
    }
}

// Common scam indicators with weighted scores
const scamIndicators = {
    urgency: {
        patterns: ['urgent', 'immediately', 'right now', 'within 24 hours', 'today only', 'expires', 'last chance', 'act now', 'dont delay', "don't delay"],
        weight: 0.15
    },
    threats: {
        patterns: ['blocked', 'suspended', 'terminated', 'legal action', 'police', 'arrest', 'fine', 'penalty', 'frozen'],
        weight: 0.2
    },
    financialRequest: {
        patterns: ['bank account', 'upi', 'transfer', 'payment', 'otp', 'pin', 'cvv', 'card number', 'account number', 'share your', 'send money'],
        weight: 0.25
    },
    impersonation: {
        patterns: ['rbi', 'reserve bank', 'income tax', 'government', 'official', 'customer care', 'bank manager', 'technical support'],
        weight: 0.15
    },
    rewards: {
        patterns: ['winner', 'lottery', 'prize', 'cashback', 'reward', 'free gift', 'lucky', 'selected', 'congratulations'],
        weight: 0.15
    },
    verification: {
        patterns: ['verify', 'kyc', 'update details', 'confirm identity', 'link aadhaar', 'pan card', 're-verify'],
        weight: 0.1
    }
};

/**
 * Rule-based scam score calculation
 */
function calculateRuleBasedScore(text) {
    const lowerText = text.toLowerCase();
    let totalScore = 0;
    const detectedCategories = [];

    for (const [category, data] of Object.entries(scamIndicators)) {
        for (const pattern of data.patterns) {
            if (lowerText.includes(pattern)) {
                totalScore += data.weight;
                if (!detectedCategories.includes(category)) {
                    detectedCategories.push(category);
                }
                break; // Count each category only once
            }
        }
    }

    // Normalize score to 0-1 range
    const normalizedScore = Math.min(totalScore, 1);

    return {
        score: normalizedScore,
        categories: detectedCategories
    };
}

/**
 * AI-powered scam detection using Gemini
 */
async function detectWithAI(text, conversationHistory = []) {
    initializeAI();

    if (!gemini) {
        console.warn('Gemini AI not initialized, using rule-based detection only');
        return null;
    }

    try {
        const historyContext = conversationHistory.length > 0
            ? `Previous messages:\n${conversationHistory.map(m => `${m.sender}: ${m.text}`).join('\n')}\n\n`
            : '';

        const prompt = `You are a scam detection expert. Analyze the following message for scam intent.

${historyContext}Latest message: "${text}"

Evaluate if this is a scam message. Consider:
1. Urgency tactics (creating panic or time pressure)
2. Impersonation of authorities (banks, government, companies)
3. Requests for sensitive information (OTP, PIN, passwords, bank details)
4. Threats of account suspension, legal action, or penalties
5. Too-good-to-be-true offers (lottery wins, prizes, rewards)
6. Suspicious links or requests to click/download
7. Poor grammar/spelling typical of scam messages
8. Inconsistencies in the conversation

Respond ONLY with a JSON object in this exact format:
{
  "isScam": true/false,
  "confidence": 0.0 to 1.0,
  "scamType": "string describing the type of scam or 'none'",
  "indicators": ["list", "of", "suspicious", "elements"],
  "reasoning": "brief explanation"
}`;

        const response = await gemini.chat.completions.create({
            model: config.geminiModel,
            messages: [
                { role: 'system', content: 'You are a scam detection expert. Always respond with valid JSON only.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.1
        });

        const responseText = response.choices[0]?.message?.content || '';

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return null;
    } catch (error) {
        console.error('AI detection error:', error.message);
        return null;
    }
}

/**
 * Combined scam detection (rule-based + AI)
 */
export async function detectScam(text, conversationHistory = []) {
    // Rule-based detection
    const ruleBasedResult = calculateRuleBasedScore(text);

    // AI-based detection
    const aiResult = await detectWithAI(text, conversationHistory);

    // Combine results
    let finalConfidence = ruleBasedResult.score;
    let isScam = ruleBasedResult.score >= config.scamThreshold;
    let scamType = 'unknown';
    let indicators = ruleBasedResult.categories;
    let reasoning = `Rule-based detection found indicators in categories: ${indicators.join(', ')}`;

    if (aiResult) {
        // Weight AI result more heavily if available
        finalConfidence = (ruleBasedResult.score * 0.3) + (aiResult.confidence * 0.7);
        isScam = finalConfidence >= config.scamThreshold || aiResult.isScam;
        scamType = aiResult.scamType || scamType;
        indicators = [...new Set([...indicators, ...(aiResult.indicators || [])])];
        reasoning = aiResult.reasoning || reasoning;
    }

    return {
        isScam,
        confidence: Math.round(finalConfidence * 100) / 100,
        scamType,
        indicators,
        reasoning,
        ruleBasedScore: ruleBasedResult.score,
        aiResult: aiResult ? true : false
    };
}

export default { detectScam };
