import { generateResponse } from './conversationAgent.js';
import { sessionManager } from './sessionManager.js';

/**
 * Generate a honeypot reply using the existing conversation agent.
 * This keeps the same behavior as /api/honeypot but focused on a single message.
 */
export async function generateHoneypotReply(text, sessionId = null) {
  try {
    let session = null;
    if (sessionId) {
      session = sessionManager.getSession(sessionId);
    } else {
      // Ephemeral session object for stateless use
      session = {
        sessionId: 'honeypot-ephemeral',
        conversationHistory: [],
        metadata: {}
      };
    }

    const reply = await generateResponse(text, session);
    return reply?.reply || "For security reasons, I cannot proceed with this request.";
  } catch (error) {
    console.error('generateHoneypotReply error:', error);
    return "For security reasons, I cannot proceed with this request.";
  }
}

export default { generateHoneypotReply };

