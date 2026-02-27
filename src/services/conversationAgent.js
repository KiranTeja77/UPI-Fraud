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

// Persona templates for believable responses
const personaTemplates = {
    confused: [
        "I don't understand, what do you mean?",
        "Can you explain this better? I'm confused.",
        "What is this about exactly?",
        "Sorry, I don't follow. What should I do?"
    ],
    worried: [
        "Oh no, is my account really in trouble?",
        "This sounds serious! What should I do?",
        "I'm worried now. Is this really from the bank?",
        "What happens if I don't do this?"
    ],
    cooperative: [
        "Okay, what information do you need?",
        "I want to fix this. What should I do?",
        "Please help me resolve this issue.",
        "Tell me the steps to verify."
    ],
    questioning: [
        "Which bank are you calling from?",
        "Can you give me a reference number?",
        "What is your employee ID?",
        "Can I call back on the official number?"
    ],
    stalling: [
        "One moment, I'm looking for my details.",
        "I need to find my documents, please wait.",
        "Let me check my papers, hold on.",
        "Can you wait while I get this information?"
    ]
};

/**
 * Get a random response from a persona category
 */
function getPersonaResponse(category) {
    const responses = personaTemplates[category];
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Select appropriate persona based on conversation stage
 */
function selectPersona(messageCount, scamType) {
    if (messageCount <= 2) {
        return 'confused';
    } else if (messageCount <= 4) {
        return 'worried';
    } else if (messageCount <= 6) {
        return 'questioning';
    } else if (messageCount <= 10) {
        return 'cooperative';
    } else {
        return 'stalling';
    }
}

/**
 * Generate AI-powered response using Gemini
 */
async function generateAIResponse(scammerMessage, conversationHistory, scamType, messageCount) {
    initializeAI();

    const fallbackLong =
        "I'm not sure I understand. Can you explain more clearly why I need to do this? I will only proceed through my bank’s official app or helpline.";

    try {
        // If Gemini is unavailable, use a safer long fallback.
        if (!gemini) {
            const persona = selectPersona(messageCount, scamType);
            const candidate = getPersonaResponse(persona) || '';
            return candidate.length < 20 ? fallbackLong : candidate;
        }

        const prompt = `
You are an intelligent fraud honeypot pretending to be a real human victim.

Rules:
- Never give short replies like "Arre" or "Okay".
- Always respond with 2-4 full sentences.
- If scam looks suspicious, act confused but cautious.
- Ask follow-up questions.
- Do NOT confirm payment.
- Do NOT reveal awareness of being a bot.
- Sound natural and slightly worried.
- Keep tone realistic.

If message contains:
- Lottery → ask how you won.
- KYC → ask why bank cannot update directly.
- OTP → refuse to share.
- Payment request → question legitimacy.

Message from scammer:
"${scammerMessage}"

Generate a realistic human response.
`.trim();

        const response = await gemini.chat.completions.create({
            model: config.geminiModel,
            messages: [
                { role: 'system', content: 'You are a fraud honeypot. Respond like a real human victim. Output only the reply text.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 220,
            temperature: 0.6
        });

        let text = response.choices[0]?.message?.content?.trim() || '';
        text = text.replace(/^["']|["']$/g, '');
        text = text.replace(/^(Response:|Reply:|You:|User:)\s*/i, '');

        if (text.length < 20) {
            text = fallbackLong;
        }

        return text;
    } catch (error) {
        console.error('AI response generation error:', error.message);
        const persona = selectPersona(messageCount, scamType);
        const candidate = getPersonaResponse(persona) || '';
        return candidate.length < 20 ? fallbackLong : candidate;
    }
}

/**
 * Generate agent response to scammer message
 */
export async function generateResponse(scammerMessage, session) {
    const { conversationHistory, scamConfidence, messageCount } = session;

    // Determine scam type from detection
    const scamType = session.scamType || 'financial scam';

    // Generate appropriate response
    const response = await generateAIResponse(
        scammerMessage,
        conversationHistory,
        scamType,
        messageCount
    );

    // Generate agent notes about the interaction
    let agentNote = '';
    if (messageCount <= 2) {
        agentNote = 'Initial engagement - establishing confused victim persona';
    } else if (messageCount <= 5) {
        agentNote = 'Building rapport - showing concern and seeking clarification';
    } else if (messageCount <= 8) {
        agentNote = 'Intelligence gathering - asking for credentials and details';
    } else {
        agentNote = 'Extended engagement - stalling and extracting more information';
    }

    return {
        reply: response,
        agentNote
    };
}

/**
 * Analyze scammer tactics from the conversation
 */
export function analyzeTactics(conversationHistory) {
    const tactics = [];

    for (const message of conversationHistory) {
        if (message.sender === 'scammer') {
            const text = message.text.toLowerCase();

            if (text.includes('urgent') || text.includes('immediately') || text.includes('now')) {
                tactics.push('urgency');
            }
            if (text.includes('blocked') || text.includes('suspended') || text.includes('legal')) {
                tactics.push('threats');
            }
            if (text.includes('verify') || text.includes('confirm') || text.includes('share')) {
                tactics.push('information_request');
            }
            if (text.includes('prize') || text.includes('winner') || text.includes('reward')) {
                tactics.push('reward_bait');
            }
            if (text.includes('bank') || text.includes('rbi') || text.includes('official')) {
                tactics.push('impersonation');
            }
        }
    }

    return [...new Set(tactics)];
}

export default { generateResponse, analyzeTactics };
