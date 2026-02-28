import OpenAI from 'openai';
import config from '../config/config.js';
import detectOtpFraud from './otpFraudDetector.js';

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
        weight: 0.4  // Increased from 0.15
    },
    threats: {
        patterns: ['blocked', 'suspended', 'terminated', 'legal action', 'police', 'arrest', 'fine', 'penalty', 'frozen', 'court', 'warrant'],
        weight: 0.5 // Increased from 0.2
    },
    financialRequest: {
        patterns: ['bank account', 'upi', 'transfer', 'payment', 'otp', 'pin', 'cvv', 'card number', 'account number', 'share your', 'send money', 'deposit'],
        weight: 0.5 // Increased from 0.25
    },
    impersonation: {
        patterns: ['rbi', 'reserve bank', 'income tax', 'government', 'official', 'customer care', 'bank manager', 'technical support', 'support team'],
        weight: 0.4 // Increased from 0.15
    },
    rewards: {
        patterns: ['winner', 'lottery', 'prize', 'cashback', 'reward', 'free gift', 'lucky', 'selected', 'congratulations', 'won'],
        weight: 0.3 // Increased from 0.15
    },
    verification: {
        patterns: ['verify', 'kyc', 'update details', 'confirm identity', 'link aadhaar', 'pan card', 're-verify', 'update pan'],
        weight: 0.3 // Increased from 0.1
    },
    jobScam: {
        patterns: ['part-time', 'job', 'hiring', 'recruit', 'vacancy', 'daily income', 'earn daily', 'work from home', 'wfh', 'no investment', 'telegram', 'whatsapp', 'task based', 'youtube likes'],
        weight: 0.5 // Increased from 0.25
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

        const prompt = `You are a STRICT and PARANOID scam detection expert. Your job is to FLAG ANY SUSPICIOUS MESSAGE immediately.
        
${historyContext}Latest message: "${text}"

Evaluate if this is a scam message. BE VERY STRICT.
If the message contains ANY of the following, IT IS A SCAM:
1. Job offers via WhatsApp/Telegram (especially "part-time", "like videos", "task based")
2. Requests for money, UPI transfers, or bank details
3. Threats of legal action, arrest, or account blocking
4. Offers of free money, lottery wins, or prizes
5. Requests to download APKs or visit suspicious links
6. Impersonation of government officials or bank support

Respond ONLY with a JSON object in this exact format:
{
  "isScam": true, // DEFAULT TO TRUE if even slightly suspicious
  "confidence": 0.0 to 1.0, // Should be HIGH (>0.8) for job offers and threats
  "scamType": "string describing the type of scam",
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

        let responseText = response.choices[0]?.message?.content || '';
        console.log('Gemini Raw Response:', responseText);

        // Clean markdown code blocks if present
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed;
            } catch (e) {
                console.error('JSON Parsing Error:', e);
                console.error('Failed Text:', responseText);
                return null;
            }
        }

        return null;
    } catch (error) {
        console.error('AI detection error:', error);
        if (error.response) {
            console.error('API Error Data:', error.response.data);
        }
        return null;
    }
}

/**
 * Combined scam detection (rule-based + AI + OTP fraud)
 */
export async function detectScam(text, conversationHistory = []) {
    // Rule-based detection
    const ruleBasedResult = calculateRuleBasedScore(text);

    // AI-based detection
    const aiResult = await detectWithAI(text, conversationHistory);

    // OTP fraud detection (additive; does not remove existing logic)
    const otpResult = detectOtpFraud(text);
    const otpBoost = otpResult.riskIncrement > 0 ? otpResult.riskIncrement / 100 : 0;

    // Combine results
    let finalConfidence = ruleBasedResult.score;
    let isScam = ruleBasedResult.score >= config.scamThreshold;
    let scamType = 'unknown';
    let indicators = ruleBasedResult.categories;
    let reasoning = `Rule-based detection found indicators in categories: ${indicators.join(', ')}`;

    if (aiResult) {
        // AI result logic
        // If Rule-based detection is STRONG, override AI if AI is lenient
        if (ruleBasedResult.score > 0.4 && !aiResult.isScam) {
            console.log("Rule-based detection overrides AI (Safe -> Scam)");
            finalConfidence = Math.max(ruleBasedResult.score, aiResult.confidence);
            isScam = true;
            scamType = 'suspected scam';
            reasoning = "Rule-based pattern matching flagged this as a potential scam despite AI analysis.";
        } else {
            // Take the HIGHER confidence score, don't average down
            finalConfidence = Math.max(ruleBasedResult.score, aiResult.confidence);
            isScam = aiResult.isScam || finalConfidence >= config.scamThreshold;
            scamType = aiResult.scamType || scamType;
            reasoning = aiResult.reasoning || reasoning;
        }

        indicators = [...new Set([...indicators, ...(aiResult.indicators || [])])];
    }

    // Apply OTP fraud increment (cap confidence at 1)
    if (otpBoost > 0) {
        finalConfidence = Math.min(1, finalConfidence + otpBoost);
        isScam = isScam || finalConfidence >= config.scamThreshold;
        indicators = [...new Set([...indicators, ...otpResult.indicators])];
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
