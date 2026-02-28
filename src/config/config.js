import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  apiKey: process.env.API_KEY || 'default-api-key',
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  guviCallbackUrl: 'https://hackathon.guvi.in/api/updateHoneyPotFinalResult',

  // Scam detection thresholds
  scamThreshold: 0.4,  // Minimum confidence to classify as scam
  minMessagesForCallback: 3,  // Minimum messages before sending callback
  maxEngagementTurns: 20,  // Maximum conversation turns

  // Session management
  sessionTimeoutMs: 30 * 60 * 1000,  // 30 minutes

  // Optional ML fraud model (probability 0-1); fused with rule score when set
  mlFraudApiUrl: process.env.ML_FRAUD_API_URL || process.env.ML_FRAUD_API,
  mlFraudTimeoutMs: Math.min(Number(process.env.ML_FRAUD_TIMEOUT_MS) || 150, 180),
};

export default config;
