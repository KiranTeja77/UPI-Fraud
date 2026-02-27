import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  sender: { type: String, enum: ['scammer', 'honeypot', 'victim'], required: true },
  text: { type: String, required: true },
  deliveredToVictim: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const ChatSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  scammerId: { type: String, required: true, index: true },
  victimId: { type: String },
  divertedToHoneypot: { type: Boolean, default: false },
  isScamConfirmed: { type: Boolean, default: false },
  messages: [MessageSchema],
  extractedDetails: {
    upiIds: [String],
    phoneNumbers: [String],
    links: [String],
    bankAccounts: [String]
  },
  lastRisk: {
    riskScore: Number,
    riskLevel: String,
    riskColor: String,
    riskEmoji: String,
    indicators: [String],
    fraudCategory: {
      name: String,
      icon: String
    },
    reasoning: String,
    recommendedActions: [String]
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ChatSession', ChatSessionSchema);

