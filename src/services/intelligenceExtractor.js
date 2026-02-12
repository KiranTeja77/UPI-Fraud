/**
 * Intelligence Extractor
 * Extracts scam-related intelligence from messages using regex patterns and AI
 */

// Regex patterns for intelligence extraction
const patterns = {
    // Bank account patterns (Indian format)
    // NOTE: We intentionally avoid matching plain long digit sequences without context,
    // to reduce false positives when users type random numbers.
    bankAccounts: [
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,  // Card-like patterns (16-digit, grouped)
        /(?:account|a\/c|ac)\s*(?:no|number|#)?[:\s]*(\d{9,18})/gi, // Explicit "account" context
    ],

    // UPI ID patterns
    upiIds: [
        /[a-zA-Z0-9._-]+@[a-zA-Z0-9]+/g,  // Standard UPI format
        /(?:upi|vpa)[:\s]*([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/gi,
    ],

    // Phone number patterns (Indian format)
    phoneNumbers: [
        // Require start-of-string or non-digit before, and no digit after,
        // so that we don't accidentally grab the tail of a longer bank/account number
        /(?:(?<=\D)|^)(?:\+91|91)?[- ]?[6-9]\d{9}(?!\d)/g,
        /(?:(?<=\D)|^)(?:\+91|91)?[- ]?\d{5}[- ]?\d{5}(?!\d)/g,
    ],

    // URL/Link patterns
    phishingLinks: [
        /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi,
        /(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"{}|\\^`[\]]*)?/gi,
    ],

    // Suspicious keywords
    suspiciousKeywords: [
        'urgent', 'immediately', 'verify', 'blocked', 'suspended', 'expire',
        'kyc', 'update', 'confirm', 'otp', 'pin', 'cvv', 'password',
        'lottery', 'winner', 'prize', 'claim', 'reward', 'offer',
        'limited time', 'act now', 'last chance', 'warning',
        'account blocked', 'security alert', 'unauthorized',
        'transfer', 'payment', 'refund', 'cashback',
        'click here', 'link below', 'verify now', 'update now',
        'rbi', 'sbi', 'hdfc', 'icici', 'bank of india',
        'paytm', 'phonepe', 'gpay', 'google pay', 'whatsapp pay'
    ]
};

/**
 * Extract bank account numbers from text
 */
function extractBankAccounts(text) {
    const accounts = new Set();

    for (const pattern of patterns.bankAccounts) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(match => {
                // Clean and validate
                const cleaned = match.replace(/[-\s]/g, '');
                if (cleaned.length >= 9 && cleaned.length <= 18) {
                    accounts.add(cleaned);
                }
            });
        }
    }

    return [...accounts];
}

/**
 * Extract UPI IDs from text
 */
function extractUpiIds(text) {
    const upiIds = new Set();

    for (const pattern of patterns.upiIds) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(match => {
                // Extract UPI ID from match
                const upiMatch = match.match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9]+/);
                if (upiMatch) {
                    upiIds.add(upiMatch[0].toLowerCase());
                }
            });
        }
    }

    return [...upiIds];
}

/**
 * Extract phone numbers from text
 * Bank/account numbers are extracted first; we then avoid treating any
 * contiguous 10‑digit slice of a longer bank number as a phone number.
 */
function extractPhoneNumbers(text, bankAccounts = []) {
    const phones = new Set();
    const bankDigits = bankAccounts.map(acc => String(acc).replace(/\D/g, ''));

    for (const pattern of patterns.phoneNumbers) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(match => {
                // Normalize phone number
                let cleaned = match.replace(/[-\s]/g, '');

                // Raw digit sequence for comparison against bank accounts
                const digitsOnly = cleaned.replace(/\D/g, '');

                // If this digit sequence is a strict substring of any known bank
                // account number, skip it to avoid misclassification
                const isPartOfBank = bankDigits.some(acc =>
                    acc.length > digitsOnly.length && acc.includes(digitsOnly)
                );
                if (isPartOfBank) {
                    return;
                }

                if (cleaned.startsWith('91') && cleaned.length === 12) {
                    cleaned = '+' + cleaned;
                } else if (cleaned.length === 10) {
                    cleaned = '+91' + cleaned;
                }
                if (cleaned.length >= 10) {
                    phones.add(cleaned);
                }
            });
        }
    }

    return [...phones];
}

/**
 * Extract URLs/links from text
 */
function extractPhishingLinks(text) {
    const links = new Set();

    for (const pattern of patterns.phishingLinks) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(match => {
                // Skip common legitimate domains
                const lowerMatch = match.toLowerCase();
                if (!lowerMatch.includes('google.com') &&
                    !lowerMatch.includes('facebook.com') &&
                    !lowerMatch.includes('whatsapp.com')) {
                    links.add(match);
                }
            });
        }
    }

    return [...links];
}

/**
 * Extract suspicious keywords from text
 */
function extractSuspiciousKeywords(text) {
    const found = new Set();
    const lowerText = text.toLowerCase();

    for (const keyword of patterns.suspiciousKeywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
            found.add(keyword);
        }
    }

    return [...found];
}

/**
 * Extract all intelligence from a message
 */
export function extractIntelligence(text) {
    const bankAccounts = extractBankAccounts(text);
    return {
        bankAccounts,
        upiIds: extractUpiIds(text),
        phoneNumbers: extractPhoneNumbers(text, bankAccounts),
        phishingLinks: extractPhishingLinks(text),
        suspiciousKeywords: extractSuspiciousKeywords(text)
    };
}

/**
 * Extract intelligence from entire conversation history
 */
export function extractFromConversation(conversationHistory) {
    const combined = {
        bankAccounts: [],
        upiIds: [],
        phoneNumbers: [],
        phishingLinks: [],
        suspiciousKeywords: []
    };

    for (const message of conversationHistory) {
        const intel = extractIntelligence(message.text);
        combined.bankAccounts.push(...intel.bankAccounts);
        combined.upiIds.push(...intel.upiIds);
        combined.phoneNumbers.push(...intel.phoneNumbers);
        combined.phishingLinks.push(...intel.phishingLinks);
        combined.suspiciousKeywords.push(...intel.suspiciousKeywords);
    }

    // Remove duplicates
    return {
        bankAccounts: [...new Set(combined.bankAccounts)],
        upiIds: [...new Set(combined.upiIds)],
        phoneNumbers: [...new Set(combined.phoneNumbers)],
        phishingLinks: [...new Set(combined.phishingLinks)],
        suspiciousKeywords: [...new Set(combined.suspiciousKeywords)]
    };
}

export default { extractIntelligence, extractFromConversation };
