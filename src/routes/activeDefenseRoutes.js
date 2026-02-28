import express from 'express';
import config from '../config/config.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { handleActiveDefenseChat } from '../controllers/activeDefenseController.js';
import { handleChatMessage, getChatSession, handleVictimReply } from '../controllers/autoDefenseController.js';

const router = express.Router();

// ML health proxy (so frontend can check ML API status without CORS)
router.get('/ml-health', authenticateApiKey, async (req, res) => {
  const url = config.mlFraudApiUrl;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.json({ status: 'ok', mlEnabled: false, modelLoaded: false });
  }
  const healthUrl = url.replace(/\/predict\/?$/, '') + '/health';
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(t);
    const data = await r.json().catch(() => ({}));
    return res.json({
      status: 'ok',
      mlEnabled: true,
      modelLoaded: !!data.model_loaded
    });
  } catch (err) {
    return res.json({ status: 'ok', mlEnabled: true, modelLoaded: false, error: err.message });
  }
});

// Active defense chat (per-message risk + auto reply)
router.post('/defense', authenticateApiKey, handleActiveDefenseChat);

// Auto honeypot diversion mode
router.post('/send', authenticateApiKey, handleChatMessage);
router.get('/session/:sessionId', authenticateApiKey, getChatSession);

// Victim reply (bidirectional chat when session is safe)
router.post('/victim-reply', authenticateApiKey, handleVictimReply);

export default router;

