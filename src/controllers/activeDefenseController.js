import { sessionManager } from '../services/sessionManager.js';
import { runDefenseAnalysis, pickDefensiveReply } from '../services/defenseOrchestratorService.js';

const MAX_MESSAGE_LENGTH = 4000;

export async function handleActiveDefenseChat(req, res) {
  try {
    const { sessionId, sender, text } = req.body || {};

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Missing or invalid sessionId',
      });
    }

    if (sender !== 'scammer') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid sender. Only "scammer" is allowed.',
      });
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing or empty text',
      });
    }

    const cleanText = text.trim().slice(0, MAX_MESSAGE_LENGTH);

    // Session handling
    const session = sessionManager.getSession(sessionId);
    const incomingMessage = {
      sender: 'scammer',
      text: cleanText,
      timestamp: new Date().toISOString(),
    };
    sessionManager.addMessage(sessionId, incomingMessage);

    // Risk analysis pipeline
    const risk = await runDefenseAnalysis(cleanText, session);

    const intervention = risk.riskScore >= 70;
    let autoReply = null;

    if (intervention) {
      autoReply = pickDefensiveReply();
      const replyMessage = {
        sender: 'honeypot',
        text: autoReply,
        timestamp: new Date().toISOString(),
      };
      sessionManager.addMessage(sessionId, replyMessage);
    }

    return res.json({
      status: 'success',
      risk,
      intervention,
      autoReply,
    });
  } catch (error) {
    console.error('ActiveDefense controller error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process defense chat message',
    });
  }
}

export default { handleActiveDefenseChat };

