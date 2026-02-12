import config from '../config/config.js';

/**
 * Session Manager
 * Manages conversation sessions with state persistence
 */
class SessionManager {
    constructor() {
        this.sessions = new Map();

        // Periodic cleanup of expired sessions
        setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
    }

    /**
     * Get or create a session
     */
    getSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                sessionId,
                createdAt: new Date(),
                lastActivity: new Date(),
                scamDetected: false,          // Has this session ever been classified as scam
                scamConfidence: 0,            // Aggregated confidence across scammer messages
                scamScores: [],               // Per-message scam confidences for scammer messages
                messageCount: 0,
                conversationHistory: [],
                extractedIntelligence: {
                    bankAccounts: [],
                    upiIds: [],
                    phishingLinks: [],
                    phoneNumbers: [],
                    suspiciousKeywords: []
                },
                agentNotes: [],
                callbackSent: false,
                metadata: {}
            });
        }

        const session = this.sessions.get(sessionId);
        session.lastActivity = new Date();
        return session;
    }

    /**
     * Update session with new message
     */
    addMessage(sessionId, message) {
        const session = this.getSession(sessionId);
        session.conversationHistory.push(message);
        session.messageCount++;
        return session;
    }

    /**
     * Update scam detection status
     */
    updateScamStatus(sessionId, scamDetected, confidence) {
        const session = this.getSession(sessionId);
        session.scamDetected = scamDetected;
        session.scamConfidence = confidence;
        return session;
    }

    /**
     * Add extracted intelligence
     */
    addIntelligence(sessionId, intelligence) {
        const session = this.getSession(sessionId);
        const intel = session.extractedIntelligence;

        // Merge intelligence, avoiding duplicates
        if (intelligence.bankAccounts) {
            intel.bankAccounts = [...new Set([...intel.bankAccounts, ...intelligence.bankAccounts])];
        }
        if (intelligence.upiIds) {
            intel.upiIds = [...new Set([...intel.upiIds, ...intelligence.upiIds])];
        }
        if (intelligence.phishingLinks) {
            intel.phishingLinks = [...new Set([...intel.phishingLinks, ...intelligence.phishingLinks])];
        }
        if (intelligence.phoneNumbers) {
            intel.phoneNumbers = [...new Set([...intel.phoneNumbers, ...intelligence.phoneNumbers])];
        }
        if (intelligence.suspiciousKeywords) {
            intel.suspiciousKeywords = [...new Set([...intel.suspiciousKeywords, ...intelligence.suspiciousKeywords])];
        }

        return session;
    }

    /**
     * Add agent observation notes
     */
    addAgentNote(sessionId, note) {
        const session = this.getSession(sessionId);
        session.agentNotes.push(note);
        return session;
    }

    /**
     * Mark callback as sent
     */
    markCallbackSent(sessionId) {
        const session = this.getSession(sessionId);
        session.callbackSent = true;
        return session;
    }

    /**
     * Check if session should trigger callback
     */
    shouldSendCallback(sessionId) {
        const session = this.getSession(sessionId);
        return (
            session.scamDetected &&
            !session.callbackSent &&
            session.messageCount >= config.minMessagesForCallback
        );
    }

    /**
     * Get session summary for callback
     */
    getSessionSummary(sessionId) {
        const session = this.getSession(sessionId);
        return {
            sessionId: session.sessionId,
            scamDetected: session.scamDetected,
            totalMessagesExchanged: session.messageCount,
            extractedIntelligence: session.extractedIntelligence,
            agentNotes: session.agentNotes.join('; ')
        };
    }

    /**
     * Cleanup expired sessions
     */
    cleanupExpiredSessions() {
        const now = new Date();
        for (const [sessionId, session] of this.sessions) {
            if (now - session.lastActivity > config.sessionTimeoutMs) {
                this.sessions.delete(sessionId);
            }
        }
    }

    /**
     * Delete a session
     */
    deleteSession(sessionId) {
        this.sessions.delete(sessionId);
    }
}

// Singleton instance
export const sessionManager = new SessionManager();
export default sessionManager;
