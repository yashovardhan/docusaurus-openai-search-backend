"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizationRoute = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const openai_service_1 = require("../services/openai.service");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// Validation middleware
const validateSummarizationRequest = [
    (0, express_validator_1.body)('query').isString().notEmpty().withMessage('Query is required'),
    (0, express_validator_1.body)('content').isArray({ min: 1 }).withMessage('Content must be a non-empty array'),
    (0, express_validator_1.body)('content.*').isString().notEmpty().withMessage('Content items must be non-empty strings'),
    (0, express_validator_1.body)('model').optional().isString().withMessage('Model must be a string'),
    (0, express_validator_1.body)('maxTokens').optional().isInt({ min: 1, max: 4096 }).withMessage('maxTokens must be between 1 and 4096')
];
// Summarization handler
router.post('/', validateSummarizationRequest, async (req, res, _next) => {
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
        logger_1.logger.info('Summarization request', {
            query: req.body.query.substring(0, 100) + '...',
            contentCount: req.body.content.length,
            model: req.body.model || 'default'
        });
        // Call summarization service
        const summary = await openai_service_1.openAIService.summarizeContent({
            query: req.body.query,
            content: req.body.content,
            model: req.body.model,
            maxTokens: req.body.maxTokens
        });
        return res.json({
            summary,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Summarization error:', error);
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
exports.summarizationRoute = router;
