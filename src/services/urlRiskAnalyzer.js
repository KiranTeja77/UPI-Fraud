/**
 * URL / Phishing risk analyzer for messages.
 * Detects URLs, extracts domains, checks PhishingDomains blacklist, suspicious TLDs and keywords.
 * Production-ready: safe for malformed input, no throws.
 */

import PhishingDomains from '../models/PhishingDomains.js';

// Match http or https URLs (non-greedy, allows for path/query)
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** TLDs often used in phishing (lowercase, no leading dot for matching) */
const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'gq', 'tk', 'ru', 'ml', 'ga', 'cf',
  'work', 'link', 'online', 'site', 'website', 'space', 'pw'
]);

/** Keywords in URL path/domain that suggest phishing (lowercase) */
const PHISHING_KEYWORDS = [
  'verify', 'verification', 'update', 'bank', 'kyc', 'reward',
  'rewards', 'urgent', 'secure', 'login', 'account', 'confirm',
  'activation', 'unlock', 'suspend', 'blocked', 'refund'
];

/**
 * Safely extract domain (hostname) from a URL string.
 * Returns null if parsing fails or input is invalid.
 * @param {string} urlString - Raw URL string
 * @returns {string|null} - Lowercase domain or null
 */
function extractDomain(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return null;
  const trimmed = urlString.trim();
  try {
    // Ensure we have a scheme for URL constructor
    const withScheme = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    const host = url.hostname;
    if (!host) return null;
    return host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Get TLD from domain (e.g. "evil.xyz" -> "xyz", "sub.evil.co.uk" -> "uk").
 * Uses simple last-part heuristic; avoids full PSL for simplicity.
 * @param {string} domain - Lowercase domain
 * @returns {string|null}
 */
function getTld(domain) {
  if (!domain || typeof domain !== 'string') return null;
  const parts = domain.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}

/**
 * Check if URL or domain contains any phishing keyword (case-insensitive).
 * @param {string} urlOrDomain
 * @param {string[]} keywords
 * @returns {string[]} - Matched keywords
 */
function findKeywordsInUrl(urlOrDomain, keywords) {
  if (!urlOrDomain || typeof urlOrDomain !== 'string') return [];
  const lower = urlOrDomain.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw));
}

/**
 * Check if a domain is in the PhishingDomains blacklist.
 * Assumes Mongoose is already configured.
 *
 * @param {string} domain - Domain to check (e.g. "evil.xyz")
 * @returns {Promise<boolean>} - true if domain is in blacklist
 */
async function checkDomainBlacklist(domain) {
  if (domain == null || typeof domain !== 'string' || !domain.trim()) return false;
  const normalized = domain.toLowerCase().trim();
  try {
    const doc = await PhishingDomains.findOne({ domain: normalized }).lean().exec();
    return !!doc;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[urlRiskAnalyzer] checkDomainBlacklist error:', err?.message || err);
    }
    return false;
  }
}

/**
 * Analyze a message for URL-based phishing risk.
 * - Detects http/https URLs via regex
 * - Extracts domain safely; checks PhishingDomains blacklist first (→ riskIncrement 80, "Known phishing domain")
 * - Flags suspicious TLDs and keywords in URL
 *
 * @param {string} message - Raw message text (can be empty or malformed)
 * @returns {Promise<{ riskIncrement: number, indicators: string[] }>}
 */
async function analyzeUrlRisk(message) {
  const result = { riskIncrement: 0, indicators: [] };
  const indicatorSet = new Set();

  if (message == null || typeof message !== 'string') {
    return result;
  }

  const urlMatches = message.match(URL_REGEX);
  if (!urlMatches || urlMatches.length === 0) {
    return result;
  }

  let risk = 0;

  for (const rawUrl of urlMatches) {
    const domain = extractDomain(rawUrl);
    if (!domain) continue;

    // Check PhishingDomains blacklist first; if found, return immediately
    const isBlacklisted = await checkDomainBlacklist(domain);
    if (isBlacklisted) {
      return {
        riskIncrement: 80,
        indicators: ['Known phishing domain']
      };
    }

    const tld = getTld(domain);
    const hasSuspiciousTld = tld && SUSPICIOUS_TLDS.has(tld);
    const matchedKeywords = findKeywordsInUrl(rawUrl, PHISHING_KEYWORDS);

    if (hasSuspiciousTld) {
      risk += 15;
      indicatorSet.add(`Suspicious domain TLD: .${tld}`);
    }

    if (matchedKeywords.length > 0) {
      risk += Math.min(15, matchedKeywords.length * 5);
      matchedKeywords.forEach((kw) => indicatorSet.add(`Phishing keyword in URL: ${kw}`));
    }

    // Any URL in message adds a small base risk (phishing often includes links)
    if (!hasSuspiciousTld && matchedKeywords.length === 0) {
      risk += 5;
      if (!indicatorSet.has('Message contains URL')) {
        indicatorSet.add('Message contains URL');
      }
    }
  }

  // Cap so existing score + riskIncrement stays in a reasonable range
  result.riskIncrement = Math.min(40, risk);
  result.indicators = Array.from(indicatorSet);

  return result;
}

export { analyzeUrlRisk, checkDomainBlacklist, extractDomain, getTld, SUSPICIOUS_TLDS, PHISHING_KEYWORDS };
export default analyzeUrlRisk;
