import express from 'express';
import cors from 'cors';
import config from './config/config.js';
import honeypotRoutes from './routes/honeypot.js';
import upifraudRoutes from './routes/upifraud.js';

// Initialize Express app
const app = express();

// CORS configuration - Allow all origins for API access
const corsOptions = {
    origin: '*',  // Allow all origins
    credentials: false,  // Must be false when origin is '*'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'UPI Fraud Detection & Honey-Pot API',
        version: '2.0.0',
        description: 'AI-powered UPI fraud detection with regional alerts, risk scoring, and safety education',
        endpoints: {
            'POST /api/upi/analyze': 'Analyze a UPI transaction for fraud',
            'POST /api/upi/alert': 'Generate regional language fraud alert',
            'GET /api/upi/languages': 'Get supported languages',
            'GET /api/upi/tips': 'Get safety tips (optional ?category= filter)',
            'POST /api/upi/tips/contextual': 'Get contextual safety tips',
            'POST /api/honeypot': 'Process incoming scam message',
            'GET /api/honeypot/session/:sessionId': 'Get session details',
            'POST /api/honeypot/session/:sessionId/callback': 'Manually trigger GUVI callback',
            'DELETE /api/honeypot/session/:sessionId': 'Delete a session'
        },
        authentication: 'x-api-key header required'
    });
});

// Mount routes
app.use('/api/honeypot', honeypotRoutes);
app.use('/api/upi', upifraudRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        status: 'error',
        message: 'Internal server error'
    });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🛡️  UPI Fraud Detection API Server                          ║
║                                                               ║
║   Server running on port ${PORT}                                 ║
║   API Key: ${config.apiKey ? 'Configured ✓' : 'NOT SET ✗'}                               ║
║   Gemini AI: ${config.geminiApiKey ? 'Configured ✓' : 'NOT SET (using fallback)'}                  ║
║                                                               ║
║   UPI Fraud Endpoints:                                        ║
║   - POST /api/upi/analyze       (Analyze transaction)         ║
║   - POST /api/upi/alert         (Regional language alert)     ║
║   - GET  /api/upi/languages     (Supported languages)         ║
║   - GET  /api/upi/tips          (Safety tips)                 ║
║   - POST /api/upi/tips/contextual (Contextual tips)           ║
║                                                               ║
║   Honeypot Endpoints:                                         ║
║   - POST /api/honeypot          (Process messages)            ║
║   - GET  /api/honeypot/session/:id (Get session info)         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
