"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = setupRoutes;
const chat_1 = require("./chat");
const summarization_1 = require("./summarization");
const rateLimiter_1 = require("../middleware/rateLimiter");
function setupRoutes(app) {
    // Apply rate limiting to all API routes
    if (process.env.ENABLE_RATE_LIMIT !== 'false') {
        app.use('/api/', rateLimiter_1.defaultRateLimiter);
    }
    // Chat completion endpoint
    app.use('/api/chat/completions', chat_1.chatCompletionRoute);
    // Summarization endpoint
    app.use('/api/summarize', summarization_1.summarizationRoute);
    // API info endpoint
    app.get('/api/info', (_req, res) => {
        res.json({
            version: '1.0.0',
            endpoints: [
                {
                    path: '/api/chat/completions',
                    method: 'POST',
                    description: 'Create chat completions using OpenAI API'
                },
                {
                    path: '/api/summarize',
                    method: 'POST',
                    description: 'Summarize documentation content'
                }
            ],
            rateLimit: {
                enabled: process.env.ENABLE_RATE_LIMIT !== 'false',
                windowMs: 60000,
                max: process.env.RATE_LIMIT_MAX || 30
            }
        });
    });
}
