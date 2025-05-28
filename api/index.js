"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const openai_1 = require("openai");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is required');
    process.exit(1);
}
if (!process.env.ALLOWED_DOMAINS) {
    console.error('Error: ALLOWED_DOMAINS is required');
    process.exit(1);
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Parse allowed domains
const allowedDomains = process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim());
// CORS configuration
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman in dev)
        if (!origin && process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        // Check if the origin is allowed
        if (origin && allowedDomains.some(domain => {
            // Support wildcard subdomains
            if (domain.startsWith('*.')) {
                const baseDomain = domain.slice(2);
                return origin.endsWith(baseDomain);
            }
            return origin === domain || origin.endsWith(`://${domain}`);
        })) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT || '30'), // 30 requests per minute
    message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);
// Initialize OpenAI client
const openai = new openai_1.OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Chat completion endpoint
app.post('/api/chat/completions', async (req, res) => {
    try {
        const { model, messages, max_tokens, temperature, stream } = req.body;
        // Basic validation
        if (!model || !messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: { message: 'Invalid request: model and messages are required' }
            });
        }
        // Make OpenAI request
        const response = await openai.chat.completions.create({
            model,
            messages,
            max_tokens: max_tokens || 2000,
            temperature: temperature || 0.5,
            stream: stream || false,
        });
        return res.json(response);
    }
    catch (error) {
        console.error('OpenAI API error:', error);
        const statusCode = error.status || 500;
        const message = error.message || 'Internal server error';
        return res.status(statusCode).json({
            error: { message, statusCode }
        });
    }
});
// Summarization endpoint
app.post('/api/summarize', async (req, res) => {
    try {
        const { query, content, model, maxTokens, systemPrompt } = req.body;
        // Basic validation
        if (!query || !content || !Array.isArray(content)) {
            return res.status(400).json({
                error: { message: 'Invalid request: query and content array are required' }
            });
        }
        // Use provided systemPrompt or fall back to default
        const finalSystemPrompt = systemPrompt || `You are a helpful assistant that summarizes documentation content.
Your task is to create a concise summary that captures the most relevant information for answering the user's query.
Focus on extracting key points, code examples, and important details that directly relate to the query.`;
        const userPrompt = `Query: "${query}"

Please summarize the following documentation content, focusing on information relevant to the query above:

${content.map((c, i) => `Document ${i + 1}:\n${c}`).join('\n\n---\n\n')}

Provide a concise summary that will help answer the query.`;
        const response = await openai.chat.completions.create({
            model: model || 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: finalSystemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: maxTokens || 1000,
            temperature: 0.3
        });
        return res.json({
            summary: response.choices[0]?.message?.content || 'Unable to generate summary'
        });
    }
    catch (error) {
        console.error('Summarization error:', error);
        const statusCode = error.status || 500;
        const message = error.message || 'Internal server error';
        return res.status(statusCode).json({
            error: { message, statusCode }
        });
    }
});
// Error handling middleware
app.use((err, _req, res, _next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: { message: 'Internal server error' }
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Allowed domains: ${allowedDomains.join(', ')}`);
});
