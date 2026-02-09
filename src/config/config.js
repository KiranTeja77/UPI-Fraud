import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  apiKey: process.env.API_KEY || 'default-api-key',
  perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  perplexityModel: process.env.PERPLEXITY_MODEL || 'sonar',
  guviCallbackUrl: 'https://hackathon.guvi.in/api/updateHoneyPotFinalResult',

  // Scam detection thresholds
  scamThreshold: 0.6,  // Minimum confidence to classify as scam
  minMessagesForCallback: 3,  // Minimum messages before sending callback
  maxEngagementTurns: 20,  // Maximum conversation turns

  // Session management
  sessionTimeoutMs: 30 * 60 * 1000,  // 30 minutes
};

export default config;
