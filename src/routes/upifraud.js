import express from 'express';
import multer from 'multer';
import { authenticateApiKey } from '../middleware/auth.js';
import { analyzeTransaction } from '../services/upiTransactionAnalyzer.js';
import { extractTransactionFromMessage } from '../services/messageExtractor.js';
import { generateAlert, getSupportedLanguages } from '../services/regionalAlertService.js';
import { getTips, getContextualTips } from '../services/safetyTipsService.js';
import { decodeQrFromBuffer } from '../services/qrDecoderService.js';
import { analyzeUpiQr } from '../services/qrAnalyzerService.js';

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
