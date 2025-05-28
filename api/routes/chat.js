"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatCompletionRoute = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const openai_service_1 = require("../services/openai.service");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// Validation middleware
const validateChatRequest = [
    (0, express_validator_1.body)('model').isString().notEmpty().withMessage('Model is required'),
    (0, express_validator_1.body)('messages').isArray({ min: 1 }).withMessage('Messages must be a non-empty array'),
    (0, express_validator_1.body)('messages.*.role').isIn(['system', 'user', 'assistant']).withMessage('Invalid message role'),
    (0, express_validator_1.body)('messages.*.content').isString().notEmpty().withMessage('Message content is required'),
    (0, express_validator_1.body)('max_tokens').optional().isInt({ min: 1, max: 4096 }).withMessage('max_tokens must be between 1 and 4096'),
    (0, express_validator_1.body)('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('temperature must be between 0 and 2'),
    (0, express_validator_1.body)('stream').optional().isBoolean().withMessage('stream must be a boolean')
];
// Chat completion handler
router.post('/', validateChatRequest, async (req, res, _next) => {
    try {
        // Check validation errors
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: {
                    message: 'Validation failed',
                    details: errors.array()
                }
            });
        }
        // Log request (without sensitive content)
        logger_1.logger.info('Chat completion request', {
            model: req.body.model,
            messageCount: req.body.messages.length,
            maxTokens: req.body.max_tokens,
            stream: req.body.stream
        });
        // Handle streaming responses
        if (req.body.stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            try {
                const stream = await openai_service_1.openAIService.createChatCompletion(req.body);
                for await (const chunk of stream) {
                    const data = JSON.stringify(chunk);
                    res.write(`data: ${data}\n\n`);
                }
                res.write('data: [DONE]\n\n');
                res.end();
            }
            catch (error) {
                const errorData = JSON.stringify({
                    error: {
                        message: error.message || 'Stream error occurred'
                    }
                });
                res.write(`data: ${errorData}\n\n`);
                res.end();
            }
            return; // Ensure we return after handling streaming
        }
        else {
            // Handle regular responses
            const response = await openai_service_1.openAIService.createChatCompletion(req.body);
            return res.json(response);
        }
    }
    catch (error) {
        logger_1.logger.error('Chat completion error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal server error';
        return res.status(statusCode).json({
            error: {
                message,
                statusCode,
                timestamp: new Date().toISOString()
            }
        });
    }
});
exports.chatCompletionRoute = router;
