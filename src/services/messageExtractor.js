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

// ─── Regex-based Extraction (fallback) ───

function extractUpiIds(text) {
    const upiPattern = /[a-zA-Z0-9._-]+@[a-zA-Z0-9]+/g;
    const matches = text.match(upiPattern) || [];
    // Filter out email-like patterns
    return matches.filter(m => {
        const handle = m.split('@')[1].toLowerCase();
        const upiHandles = ['ybl', 'axl', 'okicici', 'oksbi', 'okhdfcbank', 'paytm', 'upi',
            'ibl', 'sbi', 'apl', 'fbl', 'ikwik', 'ubi', 'boi', 'kbl',
            'pnb', 'idfcfirst', 'kotak', 'postbank', 'rbl', 'dlb', 'federal',
            'indus', 'csbpay', 'kvb', 'kaypay', 'jupiteraxis', 'slice',
            'icici', 'hdfcbank', 'axisbank', 'idbi', 'indianbank', 'cbin',
            'unionbankofindia', 'cnrb', 'dbs', 'hsbc', 'scb', 'bandhan',
            'mahb', 'abfspay', 'ratn', 'aubank', 'pingpay', 'waaxis',
            'wahdfcbank', 'waapl', 'nsdl', 'ezeepay', 'jupiteraxis', 'freecharge'];
        // If it's a known UPI handle OR a short handle (likely UPI)
        return upiHandles.includes(handle) || handle.length <= 6;
    });
}

function extractPhoneNumbers(text) {
    const phonePattern = /(?:(?:\+91|91|0)?[-\s]?)?[6-9]\d{9}(?!\d)/g;
    const matches = text.match(phonePattern) || [];
    return [...new Set(matches.map(m => {
        let cleaned = m.replace(/[-\s]/g, '');
        if (cleaned.length === 10) cleaned = '+91' + cleaned;
        else if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = '+' + cleaned;
        else if (cleaned.startsWith('091')) cleaned = '+91' + cleaned.slice(3);
        return cleaned;
    }))];
}

function extractAmounts(text) {
    const patterns = [
        /(?:rs\.?|inr|₹)\s*([0-9,]+\.?\d*)/gi,
        /([0-9,]+\.?\d*)\s*(?:rs\.?|inr|₹|rupees?)/gi,
        /(?:amount|pay|transfer|send|receive|debit|credit)(?:ed|ing)?\s*(?:of|:)?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+\.?\d*)/gi,
    ];
    const amounts = [];
    for (const p of patterns) {
        let match;
        while ((match = p.exec(text)) !== null) {
            const num = parseFloat(match[1].replace(/,/g, ''));
            if (num > 0 && num < 100000000) amounts.push(num);
        }
    }
    return [...new Set(amounts)];
}

function extractBankAccounts(text) {
    const accPattern = /(?:account|a\/c|ac|acct)\s*(?:no|number|#)?[:\s-]*([0-9]{9,18})/gi;
    const matches = [];
    let match;
    while ((match = accPattern.exec(text)) !== null) {
        matches.push(match[1]);
    }
    return [...new Set(matches)];
}

function extractLinks(text) {
    const linkPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    return text.match(linkPattern) || [];
}

/**
 * Rule-based extraction from message text
 */
function extractFromTextRuleBased(text) {
    const upiIds = extractUpiIds(text);
    return {
        senderUPI: null, // Can't determine sender/receiver from regex alone
        receiverUPI: upiIds.length > 0 ? upiIds[0] : null,
        allUpiIds: upiIds,
        phoneNumbers: extractPhoneNumbers(text),
        amounts: extractAmounts(text),
        amount: extractAmounts(text)[0] || null,
        bankAccounts: extractBankAccounts(text),
        links: extractLinks(text),
        rawMessage: text
    };
}

/**
 * AI-powered extraction using Gemini
 */
async function extractFromTextAI(text) {
    initializeAI();
    if (!gemini) return null;

    try {
        const prompt = `You are a UPI transaction message parser for Indian digital payments. Extract ALL financial details from this message.

Message: "${text}"

Extract and return as JSON:
{
  "senderUPI": "sender's UPI ID if mentioned (e.g. user@ybl), or null",
  "receiverUPI": "receiver's UPI ID if mentioned, or null",
  "allUpiIds": ["all UPI IDs found in the message"],
  "amount": numeric amount in rupees (no commas/symbols), or null,
  "phoneNumbers": ["all phone numbers found, in +91XXXXXXXXXX format"],
  "bankAccounts": ["all bank account numbers found"],
  "links": ["all URLs/links found"],
  "transactionType": "one of: P2P, P2M, COLLECT, REFUND, UNKNOWN",
  "source": "one of: SMS, WHATSAPP, EMAIL, APP_NOTIFICATION, PHONE_CALL, QR_SCAN, LINK, UNKNOWN",
  "description": "brief summary of what the message is about",
  "isNewPayee": true/false based on context (true if message implies unfamiliar sender),
  "fraudIndicators": ["list of suspicious elements you notice"],
  "scamType": "type of scam if detected: PHISHING, QR_SCAM, OTP_FRAUD, VISHING, LOTTERY_SCAM, JOB_SCAM, IMPERSONATION, INVESTMENT_SCAM, or null if legitimate"
}

Rules:
- Indian phone numbers start with 6-9 and have 10 digits
- UPI IDs have format: name@handle (e.g. user@ybl, 9876543210@paytm)
- Look for urgency keywords, threats, reward promises, OTP requests as fraud indicators
- Be thorough — extract EVERYTHING financial from the message
- If sender/receiver cannot be determined, set as null
- Always respond with valid JSON only`;

        const response = await gemini.chat.completions.create({
            model: config.geminiModel,
            messages: [
                { role: 'system', content: 'You are a financial message parser. Extract all UPI/banking details. Always respond with valid JSON only.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.1
        });

        let responseText = response.choices[0]?.message?.content || '';
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                senderUPI: parsed.senderUPI || null,
                receiverUPI: parsed.receiverUPI || null,
                allUpiIds: parsed.allUpiIds || [],
                amount: parsed.amount || null,
                phoneNumbers: parsed.phoneNumbers || [],
                bankAccounts: parsed.bankAccounts || [],
                links: parsed.links || [],
                transactionType: parsed.transactionType || 'UNKNOWN',
                source: parsed.source || 'UNKNOWN',
                description: parsed.description || '',
                isNewPayee: parsed.isNewPayee ?? true,
                fraudIndicators: parsed.fraudIndicators || [],
                scamType: parsed.scamType || null,
                rawMessage: text
            };
        }
        return null;
    } catch (error) {
        console.error('AI message extraction error:', error.message);
        return null;
    }
}

/**
 * Main extraction function — combines rule-based + AI extraction
 */
export async function extractTransactionFromMessage(messageText) {
    if (!messageText || !messageText.trim()) {
        return { error: 'Empty message' };
    }

    const text = messageText.trim();

    // Rule-based extraction (instant)
    const ruleResult = extractFromTextRuleBased(text);

    // AI-based extraction (may take a few seconds)
    const aiResult = await extractFromTextAI(text);

    // Merge results — prefer AI but supplement with rule-based
    const merged = {
        senderUPI: aiResult?.senderUPI || ruleResult.senderUPI,
        receiverUPI: aiResult?.receiverUPI || ruleResult.receiverUPI,
        allUpiIds: [...new Set([
            ...(aiResult?.allUpiIds || []),
            ...(ruleResult.allUpiIds || [])
        ])],
        amount: aiResult?.amount || ruleResult.amount || 0,
        phoneNumbers: [...new Set([
            ...(aiResult?.phoneNumbers || []),
            ...(ruleResult.phoneNumbers || [])
        ])],
        bankAccounts: [...new Set([
            ...(aiResult?.bankAccounts || []),
            ...(ruleResult.bankAccounts || [])
        ])],
        links: [...new Set([
            ...(aiResult?.links || []),
            ...(ruleResult.links || [])
        ])],
        transactionType: aiResult?.transactionType || 'UNKNOWN',
        source: aiResult?.source || 'UNKNOWN',
        description: aiResult?.description || text.substring(0, 100),
        isNewPayee: aiResult?.isNewPayee ?? true,
        fraudIndicators: aiResult?.fraudIndicators || [],
        scamType: aiResult?.scamType || null,
        rawMessage: text,
        aiExtracted: !!aiResult
    };

    return merged;
}

export default { extractTransactionFromMessage };
