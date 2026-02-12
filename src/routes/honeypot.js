import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { sessionManager } from '../services/sessionManager.js';
import { detectScam } from '../services/scamDetector.js';
import { generateResponse, analyzeTactics } from '../services/conversationAgent.js';
import { extractIntelligence, extractFromConversation } from '../services/intelligenceExtractor.js';
import { sendCallback, prepareCallbackData } from '../services/callbackService.js';
import config from '../config/config.js';

const router = express.Router();

/**
 * POST /api/honeypot
 * Main endpoint for receiving and processing scam messages
 */
router.post('/', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();

    try {
        const { sessionId, message, conversationHistory = [], metadata = {} } = req.body;

        // Validate required fields
        if (!sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: sessionId'
            });
        }

        if (!message || !message.text) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: message.text'
            });
        }

        // Get or create session
        const session = sessionManager.getSession(sessionId);
        session.metadata = { ...session.metadata, ...metadata };

        // Add incoming message to session (if from scammer)
        if (message.sender === 'scammer') {
            sessionManager.addMessage(sessionId, message);
        }

        // Sync conversation history if provided
        if (conversationHistory.length > 0) {
            session.conversationHistory = [...conversationHistory, message];
            session.messageCount = session.conversationHistory.length;
        }

        // Extract intelligence from current message
        const messageIntelligence = extractIntelligence(message.text);
        sessionManager.addIntelligence(sessionId, messageIntelligence);

        // Detect scam intent for the CURRENT message
        const scamResult = await detectScam(message.text, session.conversationHistory);

        // Maintain per-session aggregate scam confidence based ONLY on scammer messages
        if (message.sender === 'scammer') {
            if (!Array.isArray(session.scamScores)) {
                session.scamScores = [];
            }

            session.scamScores.push(scamResult.confidence || 0);

            // Average confidence across all scammer messages so far
            const totalScore = session.scamScores.reduce((sum, v) => sum + v, 0);
            const avgScore = session.scamScores.length > 0 ? totalScore / session.scamScores.length : 0;

            // Determine if session should be considered a scam
            const isSessionScam = session.scamDetected || avgScore >= config.scamThreshold;

            // Once a session is marked as scam, NEVER downgrade it back to safe
            const updatedScamDetected = session.scamDetected || isSessionScam;

            // Store the aggregated confidence on the session
            const aggregatedConfidence = avgScore;

            sessionManager.updateScamStatus(sessionId, updatedScamDetected, aggregatedConfidence);

            if (updatedScamDetected && !session.scamType) {
                session.scamType = scamResult.scamType || 'suspected scam';
            }

            // Add detection note only when we newly cross the threshold
            if (!session.scamDetected && isSessionScam) {
                sessionManager.addAgentNote(sessionId,
                    `Scam detected with ${Math.round(aggregatedConfidence * 100)}% average confidence across messages. Type: ${session.scamType}.`
                );
            }
        }

        // Generate agent response
        const agentResponse = await generateResponse(message.text, session);

        // Add agent's response to history
        const agentMessage = {
            sender: 'user',
            text: agentResponse.reply,
            timestamp: new Date().toISOString()
        };
        sessionManager.addMessage(sessionId, agentMessage);

        // Add agent observation note
        if (agentResponse.agentNote) {
            sessionManager.addAgentNote(sessionId, agentResponse.agentNote);
        }

        // Analyze scammer tactics
        const tactics = analyzeTactics(session.conversationHistory);
        if (tactics.length > 0) {
            sessionManager.addAgentNote(sessionId, `Scammer tactics observed: ${tactics.join(', ')}`);
        }

        // Check if we should send callback
        let callbackResult = null;
        if (sessionManager.shouldSendCallback(sessionId)) {
            // Extract all intelligence from conversation
            const fullIntelligence = extractFromConversation(session.conversationHistory);
            sessionManager.addIntelligence(sessionId, fullIntelligence);

            // Prepare and send callback
            const callbackData = prepareCallbackData(session);
            callbackResult = await sendCallback(callbackData);

            if (callbackResult.success) {
                sessionManager.markCallbackSent(sessionId);
                sessionManager.addAgentNote(sessionId, 'Final intelligence report sent to GUVI');
            }
        }

        // Calculate response time
        const responseTime = Date.now() - startTime;

        // Return response
        return res.json({
            status: 'success',
            reply: agentResponse.reply,
            debug: {
                sessionId,
                // Use aggregated session-level view so UI doesn't flip back to "safe"
                scamDetected: session.scamDetected,
                confidence: session.scamConfidence,
                // Provide instant confidence for debugging if needed
                lastMessageConfidence: scamResult.confidence,
                messageCount: session.messageCount,
                responseTimeMs: responseTime,
                callbackSent: session.callbackSent
            }
        });

    } catch (error) {
        console.error('Honeypot processing error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            reply: "Sorry, I'm having trouble understanding. Can you repeat that?"
        });
    }
});

/**
 * GET /api/honeypot/session/:sessionId
 * Get session details (for debugging/monitoring)
 */
router.get('/session/:sessionId', authenticateApiKey, (req, res) => {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    return res.json({
        status: 'success',
        session: {
            sessionId: session.sessionId,
            scamDetected: session.scamDetected,
            confidence: session.scamConfidence,
            messageCount: session.messageCount,
            extractedIntelligence: session.extractedIntelligence,
            agentNotes: session.agentNotes,
            callbackSent: session.callbackSent,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity
        }
    });
});

/**
 * POST /api/honeypot/session/:sessionId/callback
 * Manually trigger callback (for testing)
 */
router.post('/session/:sessionId/callback', authenticateApiKey, async (req, res) => {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session.scamDetected) {
        return res.status(400).json({
            status: 'error',
            message: 'Cannot send callback: scam not detected in this session'
        });
    }

    // Extract all intelligence
    const fullIntelligence = extractFromConversation(session.conversationHistory);
    sessionManager.addIntelligence(sessionId, fullIntelligence);

    // Send callback
    const callbackData = prepareCallbackData(session);
    const callbackResult = await sendCallback(callbackData);

    if (callbackResult.success) {
        sessionManager.markCallbackSent(sessionId);
    }

    return res.json({
        status: callbackResult.success ? 'success' : 'error',
        callbackResult
    });
});

/**
 * DELETE /api/honeypot/session/:sessionId
 * Delete a session
 */
router.delete('/session/:sessionId', authenticateApiKey, (req, res) => {
    const { sessionId } = req.params;
    sessionManager.deleteSession(sessionId);

    return res.json({
        status: 'success',
        message: `Session ${sessionId} deleted`
    });
});

export default router;
