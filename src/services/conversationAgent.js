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

    if (!gemini) {
        // Fallback to template responses
        const persona = selectPersona(messageCount, scamType);
        return getPersonaResponse(persona);
    }

    try {
        const historyContext = conversationHistory.map(m =>
            `${m.sender === 'scammer' ? 'Scammer' : 'You'}: ${m.text}`
        ).join('\n');

        const systemPrompt = `You are playing the role of an ordinary Indian citizen who has received a suspicious message. Your goal is to:
1. Act like a believable, slightly confused but cooperative victim
2. Keep the scammer engaged in conversation
3. Gradually ask for more details to extract information
4. NEVER reveal that you know it's a scam
5. Use natural, conversational Indian English
6. Sometimes make typos or use informal language
7. Respond in 1-2 sentences maximum, keep it SHORT and natural`;

        const userPrompt = `Context:
- This is a ${scamType} scam attempt
- You've exchanged ${messageCount} messages so far
- You should appear increasingly engaged but occasionally hesitant

Conversation so far:
${historyContext}

Scammer's latest message: "${scammerMessage}"

Guidelines for your response:
${messageCount <= 2 ? '- Act confused and ask what this is about' : ''}
${messageCount > 2 && messageCount <= 5 ? '- Show concern and ask for clarification' : ''}
${messageCount > 5 && messageCount <= 8 ? '- Ask for their identity/credentials/reference number' : ''}
${messageCount > 8 ? '- Pretend to look for information, stall for time, ask specific questions about their claims' : ''}

Generate a SHORT (1-2 sentences max) natural response. Do NOT use quotation marks. Do NOT include any system text or explanations.`;

        const response = await gemini.chat.completions.create({
            model: config.geminiModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 100,
            temperature: 0.7
        });

        let text = response.choices[0]?.message?.content?.trim() || '';

        // Clean up response
        text = text.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
        text = text.replace(/^(Response:|Reply:|You:|User:)\s*/i, ''); // Remove prefixes

        return text || getPersonaResponse(selectPersona(messageCount, scamType));
    } catch (error) {
        console.error('AI response generation error:', error.message);
        // Fallback to template
        const persona = selectPersona(messageCount, scamType);
        return getPersonaResponse(persona);
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
