import ChatSession from '../models/ChatSession.js';
import Blacklist from '../models/Blacklist.js';
import { extractTransactionFromMessage } from '../services/messageExtractor.js';
import { detectScam } from '../services/scamDetector.js';
import { analyzeTransaction } from '../services/upiTransactionAnalyzer.js';
import { analyzeUpiQr } from '../services/qrAnalyzerService.js';
import { generateHoneypotReply } from '../services/honeypotService.js';

const MAX_TEXT_LENGTH = 4000;

function mergeExtracted(target, extracted) {
  if (!target) {
    // eslint-disable-next-line no-param-reassign
    target = {
      upiIds: [],
      phoneNumbers: [],
      links: [],
      bankAccounts: []
    };
  }

  const upis = extracted.allUpiIds || [];
  const phones = extracted.phoneNumbers || [];
  const links = extracted.links || [];
  const banks = extracted.bankAccounts || [];

  // eslint-disable-next-line no-param-reassign
  target.upiIds = Array.from(new Set([...(target.upiIds || []), ...upis]));
  // eslint-disable-next-line no-param-reassign
  target.phoneNumbers = Array.from(new Set([...(target.phoneNumbers || []), ...phones]));
  // eslint-disable-next-line no-param-reassign
  target.links = Array.from(new Set([...(target.links || []), ...links]));
  // eslint-disable-next-line no-param-reassign
  target.bankAccounts = Array.from(new Set([...(target.bankAccounts || []), ...banks]));

  return target;
}

function mergeRiskResults(scamAnalysis, transactionAnalysis, qrAnalysis) {
  const candidates = [];

  if (scamAnalysis && typeof scamAnalysis.confidence === 'number') {
    candidates.push({
      source: 'scam',
      score: Math.round((scamAnalysis.confidence || 0) * 100)
    });
  }

  if (transactionAnalysis && typeof transactionAnalysis.riskScore === 'number') {
    candidates.push({
      source: 'transaction',
      score: transactionAnalysis.riskScore,
      data: transactionAnalysis
    });
  }

  if (qrAnalysis && qrAnalysis.ok && qrAnalysis.analysis && typeof qrAnalysis.analysis.riskScore === 'number') {
    candidates.push({
      source: 'qr',
      score: qrAnalysis.analysis.riskScore,
      data: qrAnalysis.analysis
    });
  }

  if (!candidates.length) {
    return {
      riskScore: 0,
      riskLevel: 'LOW',
      riskColor: '#16a34a',
      riskEmoji: '✅',
      indicators: [],
      fraudCategory: null,
      reasoning: 'No strong scam indicators detected.',
      recommendedActions: []
    };
  }

  const best = candidates.reduce((acc, c) => (c.score > acc.score ? c : acc), candidates[0]);
  const baseScore = best.score;

  let riskLevel = 'LOW';
  let riskColor = '#16a34a';
  let riskEmoji = '✅';

  if (baseScore >= 85) {
    riskLevel = 'CRITICAL';
    riskColor = '#dc2626';
    riskEmoji = '🚨';
  } else if (baseScore >= 70) {
    riskLevel = 'HIGH';
    riskColor = '#ea580c';
    riskEmoji = '⚠️';
  } else if (baseScore >= 40) {
    riskLevel = 'MEDIUM';
    riskColor = '#d97706';
    riskEmoji = '🔶';
  }

  const indicators = [];
  let fraudCategory = null;
  const recommendedActions = [];
  const reasoningParts = [];

  if (transactionAnalysis) {
    if (Array.isArray(transactionAnalysis.indicators)) {
      transactionAnalysis.indicators.forEach(i => indicators.push(i.label || i));
    }
    if (transactionAnalysis.fraudCategory) {
      fraudCategory = transactionAnalysis.fraudCategory;
    }
    if (Array.isArray(transactionAnalysis.recommendedActions)) {
      recommendedActions.push(...transactionAnalysis.recommendedActions);
    }
    if (transactionAnalysis.reasoning) {
      reasoningParts.push(transactionAnalysis.reasoning);
    }
  }

  if (qrAnalysis?.analysis) {
    const qr = qrAnalysis.analysis;
    if (Array.isArray(qr.warnings)) {
      indicators.push(...qr.warnings);
    }
    if (qr.fraudCategory) {
      fraudCategory = fraudCategory || qr.fraudCategory;
    }
    if (Array.isArray(qr.recommendedActions)) {
      recommendedActions.push(...qr.recommendedActions);
    }
    if (qr.reasoning) {
      reasoningParts.push(qr.reasoning);
    }
  }

  if (scamAnalysis) {
    if (Array.isArray(scamAnalysis.indicators)) {
      indicators.push(...scamAnalysis.indicators);
    }
    if (scamAnalysis.scamType) {
      fraudCategory = fraudCategory || { name: scamAnalysis.scamType, icon: '🎭' };
    }
    if (scamAnalysis.reasoning) {
      reasoningParts.push(scamAnalysis.reasoning);
    }
  }

  return {
    riskScore: baseScore,
    riskLevel,
    riskColor,
    riskEmoji,
    indicators: Array.from(new Set(indicators)),
    fraudCategory,
    reasoning: reasoningParts.join(' ') || 'Combined risk analysis from text, transaction and QR engines.',
    recommendedActions: Array.from(new Set(recommendedActions))
  };
}

export const handleChatMessage = async (req, res) => {
  try {
    const { sessionId, scammerId, victimId, text } = req.body || {};

    if (!sessionId || !scammerId || !text || typeof text !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: sessionId, scammerId, text'
      });
    }

    const cleanText = text.trim().slice(0, MAX_TEXT_LENGTH);
    let honeypotReply = null;

    let session = await ChatSession.findOne({ sessionId }).exec();
    if (!session) {
      session = await ChatSession.create({
        sessionId,
        scammerId,
        victimId: victimId || null
      });
    }

    // Extract identifiers
    const extracted = await extractTransactionFromMessage(cleanText);

    // Check blacklist
    const upis = extracted.allUpiIds || [];
    const phones = extracted.phoneNumbers || [];

    const blacklisted = await Blacklist.findOne({
      $or: [
        { scammerId },
        { upiIds: { $in: upis } },
        { phoneNumbers: { $in: phones } }
      ]
    }).exec();

    // Store scammer message (not delivered yet)
    session.messages.push({
      sender: 'scammer',
      text: cleanText,
      deliveredToVictim: false
    });

    // Merge extracted details
    // eslint-disable-next-line no-param-reassign
    session.extractedDetails = mergeExtracted(session.extractedDetails || {}, extracted);

    if (blacklisted || session.divertedToHoneypot) {
      session.divertedToHoneypot = true;
      session.isScamConfirmed = true;

      // Run risk engine for THIS message so victim sees current risk (safe vs risky)
      const scamAnalysisDiverted = await detectScam(cleanText, []);
      const txnForAnalysisDiverted = {
        senderUPI: extracted.senderUPI || 'unknown',
        receiverUPI: extracted.receiverUPI || (extracted.allUpiIds?.[0] ?? 'unknown'),
        amount: extracted.amount || 1,
        type: extracted.transactionType || 'P2P',
        description: extracted.rawMessage,
        isNewPayee: extracted.isNewPayee ?? true,
        source: extracted.source || 'SMS'
      };
      const transactionAnalysisDiverted = await analyzeTransaction(txnForAnalysisDiverted);
      const qrAnalysisDiverted = cleanText.toLowerCase().includes('upi://pay')
        ? await analyzeUpiQr(cleanText)
        : null;
      const currentRisk = mergeRiskResults(scamAnalysisDiverted, transactionAnalysisDiverted, qrAnalysisDiverted);
      session.lastRisk = currentRisk;

      // Ensure the just-added scammer message is visible to the victim
      const scamIndex = session.messages.length - 1;
      if (scamIndex >= 0) {
        session.messages[scamIndex].deliveredToVictim = true;
      }

      // Only send honeypot reply when THIS message is high risk; safe messages get no AI reply
      if (currentRisk.riskScore >= 70) {
        honeypotReply = await generateHoneypotReply(cleanText, sessionId);
        session.messages.push({
          sender: 'honeypot',
          text: honeypotReply,
          deliveredToVictim: true
        });
      }

      await session.save();

      return res.json({
        status: 'success',
        diverted: true,
        risk: currentRisk,
        honeypotReply
      });
    }

    // Run risk engine
    const scamAnalysis = await detectScam(cleanText, []);

    const txnForAnalysis = {
      senderUPI: extracted.senderUPI || 'unknown',
      receiverUPI: extracted.receiverUPI || (extracted.allUpiIds?.[0] ?? 'unknown'),
      amount: extracted.amount || 1,
      type: extracted.transactionType || 'P2P',
      description: extracted.rawMessage,
      isNewPayee: extracted.isNewPayee ?? true,
      source: extracted.source || 'SMS'
    };

    const transactionAnalysis = await analyzeTransaction(txnForAnalysis);
    const qrAnalysis = cleanText.toLowerCase().includes('upi://pay')
      ? await analyzeUpiQr(cleanText)
      : null;

    const finalRisk = mergeRiskResults(scamAnalysis, transactionAnalysis, qrAnalysis);

    // Persist last computed risk on the session for victim UI
    // eslint-disable-next-line no-param-reassign
    session.lastRisk = finalRisk;

    const lastIndex = session.messages.length - 1;
    const lastMessage = lastIndex >= 0 ? session.messages[lastIndex] : null;

    if (finalRisk.riskScore >= 70) {
      session.divertedToHoneypot = true;
      session.isScamConfirmed = true;

      await Blacklist.updateOne(
        { scammerId },
        {
          $setOnInsert: { scammerId },
          $addToSet: {
            upiIds: { $each: session.extractedDetails.upiIds || [] },
            phoneNumbers: { $each: session.extractedDetails.phoneNumbers || [] }
          },
          $set: { reason: 'Confirmed scam activity' }
        },
        { upsert: true }
      ).exec();

      honeypotReply = await generateHoneypotReply(cleanText, sessionId);

      session.messages.push({
        sender: 'honeypot',
        text: honeypotReply,
        deliveredToVictim: true
      });
      // Victim can still see the original scammer message classified as fraud
      if (lastMessage) lastMessage.deliveredToVictim = true;
    } else if (finalRisk.riskScore >= 40) {
      // MEDIUM RISK: deliver message only; no honeypot. Victim and other user chat normally.
      if (lastMessage) lastMessage.deliveredToVictim = true;
      session.divertedToHoneypot = false;
    } else {
      // LOW RISK: normal delivery
      if (lastMessage) lastMessage.deliveredToVictim = true;
    }

    await session.save();

    return res.json({
      status: 'success',
      diverted: session.divertedToHoneypot,
      risk: finalRisk,
      honeypotReply
    });
  } catch (error) {
    console.error('handleChatMessage error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to process chat message'
    });
  }
};

const MAX_VICTIM_TEXT_LENGTH = 4000;

export const handleVictimReply = async (req, res) => {
  try {
    const { sessionId, text: rawText } = req.body || {};

    if (!sessionId || typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: sessionId, text'
      });
    }

    const text = rawText.trim().slice(0, MAX_VICTIM_TEXT_LENGTH);

    const session = await ChatSession.findOne({ sessionId }).exec();
    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    const lastRisk = session.lastRisk;
    const riskScore = lastRisk && typeof lastRisk.riskScore === 'number' ? lastRisk.riskScore : 0;
    if (riskScore >= 70 && session.divertedToHoneypot) {
      return res.status(403).json({
        status: 'error',
        message: 'Cannot send: conversation diverted to honeypot due to high fraud risk'
      });
    }

    session.messages.push({
      sender: 'victim',
      text,
      deliveredToVictim: true
    });
    await session.save();

    return res.json({
      status: 'success',
      message: 'Sent'
    });
  } catch (error) {
    console.error('handleVictimReply error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to send victim reply'
    });
  }
};

export const getChatSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({ sessionId }).lean().exec();
    if (!session) {
      return res.json({
        status: 'success',
        messages: [],
        isScamConfirmed: false,
        risk: null,
        extractedDetails: null
      });
    }

    const deliveredMessages = (session.messages || []).filter(m => m.deliveredToVictim);

    return res.json({
      status: 'success',
      messages: deliveredMessages.map(m => ({
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp
      })),
      isScamConfirmed: !!session.isScamConfirmed,
      // Expose only risk summary to victim UI, never raw extracted intelligence
      risk: session.lastRisk || null,
      extractedDetails: null
    });
  } catch (error) {
    console.error('getChatSession error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch chat session'
    });
  }
};

export default { handleChatMessage, getChatSession, handleVictimReply };

