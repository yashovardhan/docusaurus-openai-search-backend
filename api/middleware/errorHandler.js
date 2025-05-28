"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, _next) {
    // Log error
    logger_1.logger.error({
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    // Default to 500 server error
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal server error';
    // Send error response
    res.status(statusCode).json({
        error: {
            message,
            statusCode,
            timestamp: new Date().toISOString()
        }
    });
}
