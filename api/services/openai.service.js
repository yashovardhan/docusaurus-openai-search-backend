"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAIService = void 0;
const openai_1 = require("openai");
const logger_1 = require("../utils/logger");
const redis_1 = require("../utils/redis");
const crypto_1 = __importDefault(require("crypto"));
class OpenAIService {
    client;
    cacheEnabled;
    cacheTTL;
    constructor() {
        this.client = new openai_1.OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.cacheEnabled = process.env.ENABLE_CACHE === 'true';
        this.cacheTTL = parseInt(process.env.CACHE_TTL || '3600'); // 1 hour default
    }
    /**
     * Generate a cache key for the request
     */
    generateCacheKey(data) {
        const hash = crypto_1.default.createHash('sha256');
        hash.update(JSON.stringify(data));
        return `openai:${hash.digest('hex')}`;
    }
    /**
     * Handle chat completion requests
     */
    async createChatCompletion(request) {
        try {
            // Check cache first
            if (this.cacheEnabled && !request.stream) {
                const cacheKey = this.generateCacheKey(request);
                const cachedResponse = await (0, redis_1.getCachedResponse)(cacheKey);
                if (cachedResponse) {
                    logger_1.logger.info('Returning cached response');
                    return JSON.parse(cachedResponse);
                }
            }
            // Validate request
            this.validateChatRequest(request);
            // Make API call
            logger_1.logger.info('Making OpenAI API call', {
                model: request.model,
                messageCount: request.messages.length,
                maxTokens: request.max_tokens
            });
            const response = await this.client.chat.completions.create({
                model: request.model,
                messages: request.messages,
                max_tokens: request.max_tokens,
                temperature: request.temperature,
                stream: request.stream || false,
            });
            // Cache the response if caching is enabled
            if (this.cacheEnabled && !request.stream) {
                const cacheKey = this.generateCacheKey(request);
                await (0, redis_1.setCachedResponse)(cacheKey, JSON.stringify(response), this.cacheTTL);
            }
            return response;
        }
        catch (error) {
            logger_1.logger.error('OpenAI API error:', error);
            // Handle specific OpenAI errors
            if (error.status === 429) {
                throw new Error('OpenAI API rate limit exceeded. Please try again later.');
            }
            else if (error.status === 401) {
                throw new Error('Invalid OpenAI API key.');
            }
            else if (error.status === 400) {
                throw new Error(`Invalid request: ${error.message}`);
            }
            throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
        }
    }
    /**
     * Handle content summarization requests
     */
    async summarizeContent(request) {
        try {
            const systemPrompt = `You are a helpful assistant that summarizes documentation content.
Your task is to create a concise summary that captures the most relevant information for answering the user's query.
Focus on extracting key points, code examples, and important details that directly relate to the query.`;
            const userPrompt = `Query: "${request.query}"

Please summarize the following documentation content, focusing on information relevant to the query above:

${request.content.map((content, index) => `Document ${index + 1}:\n${content}`).join('\n\n---\n\n')}

Provide a concise summary that will help answer the query.`;
            const chatRequest = {
                model: request.model || 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: request.maxTokens || 1000,
                temperature: 0.3
            };
            const response = await this.createChatCompletion(chatRequest);
            return response.choices[0]?.message?.content || 'Unable to generate summary';
        }
        catch (error) {
            logger_1.logger.error('Summarization error:', error);
            throw error;
        }
    }
    /**
     * Validate chat completion request
     */
    validateChatRequest(request) {
        if (!request.model) {
            throw new Error('Model is required');
        }
        if (!request.messages || request.messages.length === 0) {
            throw new Error('Messages array is required and must not be empty');
        }
        // Validate message format
        for (const message of request.messages) {
            if (!message.role || !message.content) {
                throw new Error('Each message must have a role and content');
            }
            if (!['system', 'user', 'assistant'].includes(message.role)) {
                throw new Error('Invalid message role. Must be system, user, or assistant');
            }
        }
        // Validate max_tokens
        if (request.max_tokens && (request.max_tokens < 1 || request.max_tokens > 4096)) {
            throw new Error('max_tokens must be between 1 and 4096');
        }
        // Validate temperature
        if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 2)) {
            throw new Error('temperature must be between 0 and 2');
        }
    }
}
// Export singleton instance
exports.openAIService = new OpenAIService();
