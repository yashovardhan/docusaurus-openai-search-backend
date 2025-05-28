"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeRedis = initializeRedis;
exports.getRedisClient = getRedisClient;
exports.getCachedResponse = getCachedResponse;
exports.setCachedResponse = setCachedResponse;
exports.incrementRateLimit = incrementRateLimit;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
let redisClient = null;
async function initializeRedis() {
    if (process.env.ENABLE_REDIS !== 'true') {
        return;
    }
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        redisClient = new ioredis_1.default(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            reconnectOnError: (err) => {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    // Only reconnect when the error contains "READONLY"
                    return true;
                }
                return false;
            }
        });
        redisClient.on('error', (err) => {
            logger_1.logger.error('Redis Client Error:', err);
        });
        redisClient.on('connect', () => {
            logger_1.logger.info('Redis Client Connected');
        });
        // Test the connection
        await redisClient.ping();
    }
    catch (error) {
        logger_1.logger.error('Failed to initialize Redis:', error);
        throw error;
    }
}
function getRedisClient() {
    return redisClient;
}
async function getCachedResponse(key) {
    if (!redisClient)
        return null;
    try {
        return await redisClient.get(key);
    }
    catch (error) {
        logger_1.logger.error('Redis get error:', error);
        return null;
    }
}
async function setCachedResponse(key, value, ttlSeconds = 3600) {
    if (!redisClient)
        return;
    try {
        await redisClient.setex(key, ttlSeconds, value);
    }
    catch (error) {
        logger_1.logger.error('Redis set error:', error);
    }
}
async function incrementRateLimit(key, windowSeconds = 60) {
    if (!redisClient)
        return 0;
    try {
        const multi = redisClient.multi();
        multi.incr(key);
        multi.expire(key, windowSeconds);
        const results = await multi.exec();
        if (results && results[0]) {
            return results[0][1];
        }
        return 0;
    }
    catch (error) {
        logger_1.logger.error('Redis rate limit error:', error);
        return 0;
    }
}
