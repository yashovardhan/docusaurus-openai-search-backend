import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Rate limiting configuration for different environments
 */
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Get client identifier for rate limiting
 * In a serverless environment, we need to be careful about IP extraction
 */
function getClientIdentifier(req: Request): string {
  // Try to get the real IP from various headers (in order of preference)
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip']; // Cloudflare
  const vercelForwardedFor = req.headers['x-vercel-forwarded-for']; // Vercel
  
  if (vercelForwardedFor && typeof vercelForwardedFor === 'string') {
    return vercelForwardedFor.split(',')[0].trim();
  }
  
  if (cfConnectingIp && typeof cfConnectingIp === 'string') {
    return cfConnectingIp;
  }
  
  if (forwardedFor && typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIp && typeof realIp === 'string') {
    return realIp;
  }
  
  // Fallback to connection remote address
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Create rate limiter based on environment
 */
export function createRateLimiter(config?: Partial<RateLimitConfig>) {
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  const defaultConfig: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT || '30'),
    message: 'Too many requests, please try again later.',
    skipSuccessfulRequests: false,
    standardHeaders: true,
    legacyHeaders: false,
  };

  const finalConfig = { ...defaultConfig, ...config };

  if (isVercel) {
    // For Vercel/serverless, we use a more lenient configuration
    // since state isn't shared between function invocations
    // Real rate limiting should be done at the edge (Vercel's built-in rate limiting)
    // or using an external service like Redis/Upstash
    console.log('Running in Vercel environment - using stateless rate limiting');
    
    return rateLimit({
      ...finalConfig,
      // Use a custom key generator that properly extracts client IP
      keyGenerator: (req: Request) => getClientIdentifier(req),
      // Skip successful requests to be more lenient
      skipSuccessfulRequests: true,
      // Increase the limit for serverless
      max: finalConfig.max * 2, // Double the limit for serverless
    });
  }

  // For non-Vercel environments, use standard rate limiting
  return rateLimit({
    ...finalConfig,
    keyGenerator: (req: Request) => getClientIdentifier(req),
  });
}

/**
 * Middleware for logging rate limit information
 */
export function rateLimitLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Log rate limit headers for debugging
    const remaining = res.getHeader('X-RateLimit-Remaining');
    const limit = res.getHeader('X-RateLimit-Limit');
    
    if (remaining !== undefined && limit !== undefined) {
      console.log(`Rate limit: ${remaining}/${limit} for ${getClientIdentifier(req)}`);
    }
    
    next();
  };
}

/**
 * Custom rate limit handler with more detailed error response
 */
export function customRateLimitHandler(_req: Request, res: Response) {
  const retryAfter = res.getHeader('Retry-After');
  const resetTime = res.getHeader('X-RateLimit-Reset');
  
  res.status(429).json({
    error: {
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
      retryAfter: retryAfter ? parseInt(retryAfter as string) : undefined,
      resetTime: resetTime ? new Date(parseInt(resetTime as string) * 1000).toISOString() : undefined,
    }
  });
} 