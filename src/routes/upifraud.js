import express from 'express';
import multer from 'multer';
import { authenticateApiKey } from '../middleware/auth.js';
import { analyzeTransaction } from '../services/upiTransactionAnalyzer.js';
import { extractTransactionFromMessage } from '../services/messageExtractor.js';
import { generateAlert, getSupportedLanguages } from '../services/regionalAlertService.js';
import { getTips, getContextualTips } from '../services/safetyTipsService.js';
import { decodeQrFromBuffer } from '../services/qrDecoderService.js';
import { analyzeUpiQr } from '../services/qrAnalyzerService.js';
import { getMlFraudProbability, applyAdvancedFusionToScanAnalysis } from '../services/mlFraudService.js';
import { detectScam } from '../services/scamDetector.js';
import Blacklist from '../models/Blacklist.js';

const PAY_VALIDATION_BLACKLIST_ID = 'pay-validation';

function riskLevelFromScore(score) {
    if (score >= 85) return { riskLevel: 'CRITICAL', riskColor: '#dc2626', riskEmoji: '🚨' };
    if (score >= 70) return { riskLevel: 'HIGH', riskColor: '#ea580c', riskEmoji: '⚠️' };
    if (score >= 40) return { riskLevel: 'MEDIUM', riskColor: '#d97706', riskEmoji: '🔶' };
    return { riskLevel: 'LOW', riskColor: '#16a34a', riskEmoji: '✅' };
}

const router = express.Router();

// QR image upload (memory) with safety limits
const qrUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (!file?.mimetype?.startsWith('image/')) {
            return cb(new Error('Only image uploads are allowed'));
        }
        cb(null, true);
    }
});

/**
 * POST /api/upi/scan
 * Accept a raw message text, auto-extract UPI details, and analyze for fraud
 */
router.post('/scan', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();

    try {
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: message'
            });
        }

        // Step 1: Extract transaction details from raw message
        const extracted = await extractTransactionFromMessage(message);

        if (extracted.error) {
            return res.status(400).json({
                status: 'error',
                message: extracted.error
            });
        }

        // Step 2: Build transaction object for analysis
        const transaction = {
            senderUPI: extracted.senderUPI || 'unknown',
            receiverUPI: extracted.receiverUPI || (extracted.allUpiIds?.[0]) || 'unknown',
            amount: extracted.amount || 1, // default to 1 if no amount found (still analyze text)
            type: extracted.transactionType || 'P2P',
            description: extracted.rawMessage,
            isNewPayee: extracted.isNewPayee ?? true,
            source: extracted.source || 'SMS'
        };

        // Step 3: Analyze for fraud
        const analysis = await analyzeTransaction(transaction);

        // Step 4: Combine extracted info + analysis
        return res.json({
            status: 'success',
            extracted: {
                senderUPI: extracted.senderUPI,
                receiverUPI: extracted.receiverUPI,
                allUpiIds: extracted.allUpiIds,
                amount: extracted.amount,
                phoneNumbers: extracted.phoneNumbers,
                bankAccounts: extracted.bankAccounts,
                links: extracted.links,
                transactionType: extracted.transactionType,
                source: extracted.source,
                description: extracted.description,
                isNewPayee: extracted.isNewPayee,
                fraudIndicators: extracted.fraudIndicators,
                scamType: extracted.scamType,
                aiExtracted: extracted.aiExtracted
            },
            analysis,
            responseTimeMs: Date.now() - startTime
        });

    } catch (error) {
        console.error('Message scan error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to scan message'
        });
    }
});

/**
 * POST /api/upi/validate-transaction
 * Real-time transaction validation before pay. Validates description (scam/NLP) like chatbot,
 * merges with transaction rules + ML. High-risk UPIs are added to blacklist; blacklisted UPIs
 * return a clear "do not pay" message.
 * Body: { amount: number, receiverUPI: string, description?: string, newPayee?: boolean }
 */
router.post('/validate-transaction', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();
    try {
        const { amount, receiverUPI, description, newPayee } = req.body || {};
        const amt = Number(amount);
        const receiver = typeof receiverUPI === 'string' ? receiverUPI.trim() : '';
        if (receiver === '') {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: receiverUPI'
            });
        }

        // 1) Blacklist check: if this UPI is already blacklisted, return high risk immediately
        const blacklisted = await Blacklist.findOne({ upiIds: receiver }).lean().exec();
        if (blacklisted) {
            const level = riskLevelFromScore(100);
            return res.json({
                status: 'success',
                riskScore: 100,
                riskLevel: level.riskLevel,
                riskColor: level.riskColor,
                riskEmoji: level.riskEmoji,
                isFraud: true,
                shouldBlock: true,
                message: 'This UPI ID is in our blacklist. Do not send money or exchange with this recipient.',
                triggeredIndicators: ['UPI ID is blacklisted – previously flagged as high risk'],
                recommendations: [
                    'Do not proceed with this payment.',
                    'This recipient was previously flagged for fraud.',
                    'Report to your bank if you have already sent money.'
                ],
                blacklisted: true,
                responseTimeMs: Date.now() - startTime
            });
        }

        const transaction = {
            senderUPI: 'unknown',
            receiverUPI: receiver,
            amount: Number.isFinite(amt) ? amt : 0,
            type: 'P2P',
            description: typeof description === 'string' ? description : '',
            isNewPayee: !!newPayee,
            source: 'USER_PAY'
        };

        // 2) Rule-based transaction analysis (amount, new payee, etc.)
        let analysis = await analyzeTransaction(transaction);

        // 3) Message/description validation (same as chatbot: rule-based + NLP scam detection)
        const combinedText = [
            transaction.description,
            receiver,
            transaction.amount > 0 ? `Amount Rs ${transaction.amount}` : ''
        ].filter(Boolean).join(' ');
        const scamAnalysis = await detectScam(combinedText || receiver, []);
        const scamScore = Math.round((scamAnalysis.confidence || 0) * 100);
        const mergedScore = Math.max(analysis.riskScore ?? 0, scamScore);
        analysis.riskScore = mergedScore;
        analysis.riskLevel = riskLevelFromScore(mergedScore).riskLevel;
        analysis.riskColor = riskLevelFromScore(mergedScore).riskColor;
        analysis.riskEmoji = riskLevelFromScore(mergedScore).riskEmoji;
        const scamIndicators = Array.isArray(scamAnalysis.indicators)
            ? scamAnalysis.indicators.map((i) => (typeof i === 'string' ? i : `Scam: ${i}`))
            : [];
        const existingLabels = (analysis.indicators || []).map((i) => (typeof i === 'object' && i?.label ? i.label : String(i)));
        analysis.indicators = [...existingLabels, ...scamIndicators];

        // 4) Optional ML fusion (advanced: ML>0.9 → 60% ML weight; rule>80 → +10; blacklist handled above)
        const mlResult = await getMlFraudProbability({
            text: combinedText || receiver,
            transaction: { ...transaction, isNewPayee: transaction.isNewPayee }
        });
        if (mlResult) {
            analysis = applyAdvancedFusionToScanAnalysis(analysis, mlResult, false);
        }

        const riskScore = analysis.riskScore ?? mergedScore;
        const shouldBlock = riskScore >= 70;
        const isFraud = shouldBlock;

        // 5) Add high-risk UPI to blacklist so future validations catch it
        if (shouldBlock) {
            await Blacklist.updateOne(
                { scammerId: PAY_VALIDATION_BLACKLIST_ID },
                {
                    $addToSet: { upiIds: receiver },
                    $set: { reason: 'Flagged from Pay validation (high risk)' }
                },
                { upsert: true }
            ).exec();
        }

        const indicators = (analysis.indicators || []).map((i) =>
            typeof i === 'object' && i?.label ? i.label : String(i)
        );

        return res.json({
            status: 'success',
            riskScore,
            riskLevel: analysis.riskLevel || riskLevelFromScore(riskScore).riskLevel,
            riskColor: analysis.riskColor || riskLevelFromScore(riskScore).riskColor,
            riskEmoji: analysis.riskEmoji || riskLevelFromScore(riskScore).riskEmoji,
            isFraud,
            shouldBlock,
            message: shouldBlock
                ? 'Do not pay. This transaction was flagged as high risk.'
                : riskScore >= 40
                    ? 'Caution. Verify the recipient before paying.'
                    : 'Transaction appears safe. Always verify the payee.',
            triggeredIndicators: indicators,
            recommendations: analysis.recommendedActions || [],
            responseTimeMs: Date.now() - startTime
        });
    } catch (error) {
        console.error('Validate transaction error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to validate transaction'
        });
    }
});

/**
 * POST /api/upi/scan-qr
 * Upload a QR image, decode UPI payment data, and analyze scam risk
 *
 * Multipart/form-data
 * Field: qrImage
 * Header: x-api-key
 */
router.post('/scan-qr', authenticateApiKey, (req, res) => {
    qrUpload.single('qrImage')(req, res, async (err) => {
        if (err) {
            const isSizeError = err.code === 'LIMIT_FILE_SIZE';
            return res.status(400).json({
                status: 'error',
                message: isSizeError
                    ? 'Image too large. Maximum allowed size is 5MB.'
                    : err.message || 'Failed to process uploaded image.'
            });
        }

        try {
            if (!req.file?.buffer) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No QR image provided. Please upload an image in field "qrImage".'
                });
            }

            const rawQr = await decodeQrFromBuffer(req.file.buffer);
            if (!rawQr) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No QR code detected in the image.'
                });
            }

            const result = await analyzeUpiQr(rawQr);
            if (!result.ok) {
                return res.status(400).json({
                    status: 'error',
                    message: result.error || 'Unable to analyze QR content.'
                });
            }

            return res.json({
                status: 'success',
                extracted: result.extracted,
                analysis: result.analysis
            });
        } catch (error) {
            console.error('QR scan error:', error);
            return res.status(500).json({
                status: 'error',
                message: 'Failed to scan QR code'
            });
        }
    });
});


/**
 * POST /api/upi/analyze
 * Analyze a UPI transaction for fraud risk
 */
router.post('/analyze', authenticateApiKey, async (req, res) => {
    const startTime = Date.now();

    try {
        const { transaction } = req.body;

        if (!transaction) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: transaction'
            });
        }

        if (!transaction.amount || transaction.amount <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Transaction must have a positive amount'
            });
        }

        const result = await analyzeTransaction(transaction);

        return res.json({
            status: 'success',
            analysis: result,
            responseTimeMs: Date.now() - startTime
        });

    } catch (error) {
        console.error('Transaction analysis error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to analyze transaction'
        });
    }
});

/**
 * POST /api/upi/alert
 * Generate a regional language alert for a fraud detection result
 */
router.post('/alert', authenticateApiKey, async (req, res) => {
    try {
        const { fraudResult, language = 'en' } = req.body;

        if (!fraudResult) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: fraudResult'
            });
        }

        const alert = await generateAlert(fraudResult, language);

        return res.json({
            status: 'success',
            alert
        });

    } catch (error) {
        console.error('Alert generation error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to generate alert'
        });
    }
});

/**
 * GET /api/upi/languages
 * Get list of supported languages
 */
router.get('/languages', (req, res) => {
    return res.json({
        status: 'success',
        languages: getSupportedLanguages()
    });
});

/**
 * GET /api/upi/tips
 * Get safety tips (optional ?category= filter)
 */
router.get('/tips', (req, res) => {
    const { category } = req.query;

    const result = getTips(category || null);

    return res.json({
        status: 'success',
        ...result
    });
});

/**
 * POST /api/upi/tips/contextual
 * Get contextual safety tips based on fraud analysis result
 */
router.post('/tips/contextual', authenticateApiKey, async (req, res) => {
    try {
        const { fraudResult } = req.body;

        if (!fraudResult) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required field: fraudResult'
            });
        }

        const result = await getContextualTips(fraudResult);

        return res.json({
            status: 'success',
            ...result
        });

    } catch (error) {
        console.error('Contextual tips error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to get contextual tips'
        });
    }
});

export default router;
