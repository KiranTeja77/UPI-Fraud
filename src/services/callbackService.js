import config from '../config/config.js';

/**
 * GUVI Callback Service
 * Sends final intelligence to the GUVI evaluation endpoint
 */

/**
 * Send intelligence callback to GUVI
 */
export async function sendCallback(sessionData) {
    const payload = {
        sessionId: sessionData.sessionId,
        scamDetected: sessionData.scamDetected,
        totalMessagesExchanged: sessionData.totalMessagesExchanged,
        extractedIntelligence: sessionData.extractedIntelligence,
        agentNotes: sessionData.agentNotes
    };

    console.log('Sending callback to GUVI:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(config.guviCallbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            timeout: 5000
        });

        const result = await response.json();

        console.log('GUVI callback response:', result);

        return {
            success: response.ok,
            status: response.status,
            response: result
        };
    } catch (error) {
        console.error('Failed to send GUVI callback:', error.message);

        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Prepare session data for callback
 */
export function prepareCallbackData(session) {
    return {
        sessionId: session.sessionId,
        scamDetected: session.scamDetected,
        totalMessagesExchanged: session.messageCount,
        extractedIntelligence: session.extractedIntelligence,
        agentNotes: session.agentNotes.join('; ')
    };
}

export default { sendCallback, prepareCallbackData };
