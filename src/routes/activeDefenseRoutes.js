import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { handleActiveDefenseChat } from '../controllers/activeDefenseController.js';
import { handleChatMessage, getChatSession, handleVictimReply } from '../controllers/autoDefenseController.js';

const router = express.Router();

// Active defense chat (per-message risk + auto reply)
router.post('/defense', authenticateApiKey, handleActiveDefenseChat);

// Auto honeypot diversion mode
router.post('/send', authenticateApiKey, handleChatMessage);
router.get('/session/:sessionId', authenticateApiKey, getChatSession);

// Victim reply (bidirectional chat when session is safe)
router.post('/victim-reply', authenticateApiKey, handleVictimReply);

export default router;

