"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
const logger_1 = require("./logger");
function validateEnvironment() {
    const requiredEnvVars = [
        'OPENAI_API_KEY',
        'ALLOWED_DOMAINS'
    ];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        logger_1.logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
        logger_1.logger.error('Please check your .env file or environment configuration');
        process.exit(1);
    }
    // Validate ALLOWED_DOMAINS format
    const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || [];
    if (allowedDomains.length === 0) {
        logger_1.logger.warn('No allowed domains configured. This is a security risk!');
    }
    // Log configuration (without sensitive data)
    logger_1.logger.info('Environment validation passed');
    logger_1.logger.info(`Configured domains: ${allowedDomains.length}`);
    logger_1.logger.info(`Rate limiting: ${process.env.ENABLE_RATE_LIMIT !== 'false' ? 'Enabled' : 'Disabled'}`);
    logger_1.logger.info(`Redis caching: ${process.env.ENABLE_REDIS === 'true' ? 'Enabled' : 'Disabled'}`);
}
