import express from 'express';
import cors from 'cors';
import config from './config/config.js';
import honeypotRoutes from './routes/honeypot.js';

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
        name: 'Agentic Honey-Pot API',
        version: '1.0.0',
        description: 'AI-powered honeypot for scam detection and intelligence extraction',
        endpoints: {
            'POST /api/honeypot': 'Process incoming scam message',
            'GET /api/honeypot/session/:sessionId': 'Get session details',
            'POST /api/honeypot/session/:sessionId/callback': 'Manually trigger GUVI callback',
            'DELETE /api/honeypot/session/:sessionId': 'Delete a session'
        },
        authentication: 'x-api-key header required'
    });
});

// Mount honeypot routes
app.use('/api/honeypot', honeypotRoutes);

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
║   🍯 Agentic Honey-Pot API Server                              ║
║                                                               ║
║   Server running on port ${PORT}                                 ║
║   API Key: ${config.apiKey ? 'Configured ✓' : 'NOT SET ✗'}                               ║
║   Gemini AI:     ${config.geminiApiKey ? 'Configured ✓' : 'NOT SET (using fallback)'}              ║
║                                                               ║
║   Endpoints:                                                  ║
║   - POST /api/honeypot          (Process messages)            ║
║   - GET  /api/honeypot/session/:id (Get session info)         ║
║   - POST /api/honeypot/session/:id/callback (Force callback)  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
