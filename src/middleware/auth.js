import config from '../config/config.js';

/**
 * API Key Authentication Middleware
 * Validates the x-api-key header against the configured API key
 */
export const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            status: 'error',
            message: 'Missing API key. Please provide x-api-key header.'
        });
    }

    if (apiKey !== config.apiKey) {
        return res.status(403).json({
            status: 'error',
            message: 'Invalid API key.'
        });
    }

    next();
};

export default authenticateApiKey;
