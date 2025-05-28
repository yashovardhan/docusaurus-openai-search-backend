"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strictRateLimiter = exports.defaultRateLimiter = exports.createRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const redis_1 = require("../utils/redis");
const logger_1 = require("../utils/logger");
// Create a custom Redis store for rate limiting
class RedisStore {
    windowMs;
    constructor(windowMs) {
        this.windowMs = windowMs;
    }
    async increment(key) {
        const redisClient = (0, redis_1.getRedisClient)();
        if (!redisClient) {
            // Fallback to memory store
            return { totalHits: 1 };
        }
        try {
            const totalHits = await (0, redis_1.incrementRateLimit)(key, Math.ceil(this.windowMs / 1000));
            return { totalHits };
        }
        catch (error) {
            logger_1.logger.error('Redis rate limit increment error:', error);
            return { totalHits: 1 };
        }
    }
    async decrement(_key) {
        // Not implemented for Redis
    }
    async resetKey(key) {
        const redisClient = (0, redis_1.getRedisClient)();
        if (redisClient) {
            try {
                await redisClient.del(key);
            }
            catch (error) {
                logger_1.logger.error('Redis rate limit reset error:', error);
            }
        }
    }
}
// Rate limiter configuration
const createRateLimiter = (options) => {
    const windowMs = options?.windowMs || 60 * 1000; // 1 minute
    const max = options?.max || parseInt(process.env.RATE_LIMIT_MAX || '30');
    const redisClient = (0, redis_1.getRedisClient)();
    return (0, express_rate_limit_1.default)({
        windowMs,
        max,
        message: options?.message || 'Too many requests, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        // Use Redis store if available, otherwise use memory store
        store: redisClient ? new RedisStore(windowMs) : undefined,
        // Key generator - use IP address by default
        keyGenerator: (req) => {
            // You can customize this to use user ID, API key, etc.
            return `rate-limit:${req.ip}`;
        },
        // Skip rate limiting for certain conditions
        skip: (req) => {
            // Skip rate limiting in development if configured
            if (process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT_DEV === 'true') {
                return true;
            }
            // Skip for health check endpoint
            if (req.path === '/health') {
                return true;
            }
            return false;
        },
        // Custom handler for rate limit exceeded
        handler: (req, res) => {
            logger_1.logger.warn({
                message: 'Rate limit exceeded',
                ip: req.ip,
                path: req.path,
                userAgent: req.get('user-agent')
            });
            res.status(429).json({
                error: {
                    message: 'Too many requests, please try again later.',
                    statusCode: 429,
                    retryAfter: res.getHeader('Retry-After'),
                    timestamp: new Date().toISOString()
                }
            });
        }
    });
};
exports.createRateLimiter = createRateLimiter;
// Create default rate limiter
exports.defaultRateLimiter = (0, exports.createRateLimiter)();
// Create strict rate limiter for sensitive endpoints
exports.strictRateLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many requests to this endpoint, please try again later.'
});
