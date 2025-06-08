import { Request, Response, NextFunction } from 'express';
import https from 'https';

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Verify reCAPTCHA token with Google
 */
async function verifyRecaptchaToken(token: string, secretKey: string): Promise<RecaptchaResponse> {
  return new Promise((resolve, reject) => {
    const data = `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`;
    
    const options = {
      hostname: 'www.google.com',
      port: 443,
      path: '/recaptcha/api/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (error) {
          reject(new Error('Failed to parse reCAPTCHA response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Middleware to validate reCAPTCHA tokens
 */
export function recaptchaMiddleware(options?: {
  skipPaths?: string[];
  scoreThreshold?: number;
  enabledActions?: string[];
}) {
  const { 
    skipPaths = ['/health'], 
    scoreThreshold = 0.5,
    enabledActions = ['keywords', 'generate_answer']
  } = options || {};

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip validation for certain paths
    if (skipPaths.includes(req.path)) {
      return next();
    }

    // Check if reCAPTCHA is configured
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      // reCAPTCHA not configured, skip validation
      return next();
    }

    // Get token from header
    const token = req.headers['x-recaptcha-token'] as string;
    
    if (!token) {
      return res.status(400).json({
        error: { message: 'reCAPTCHA token is required' }
      });
    }

    try {
      // Verify token with Google
      const recaptchaResponse = await verifyRecaptchaToken(token, secretKey);
      
      if (!recaptchaResponse.success) {
        console.error('reCAPTCHA verification failed:', recaptchaResponse['error-codes']);
        return res.status(403).json({
          error: { message: 'reCAPTCHA verification failed' }
        });
      }

      // Check score threshold for v3
      if (recaptchaResponse.score !== undefined && recaptchaResponse.score < scoreThreshold) {
        console.warn('reCAPTCHA score too low:', recaptchaResponse.score);
        return res.status(403).json({
          error: { message: 'Request blocked due to suspicious activity' }
        });
      }

      // Check action if specified
      if (recaptchaResponse.action && enabledActions.length > 0 && !enabledActions.includes(recaptchaResponse.action)) {
        console.warn('Invalid reCAPTCHA action:', recaptchaResponse.action);
        return res.status(403).json({
          error: { message: 'Invalid reCAPTCHA action' }
        });
      }

      // Add reCAPTCHA info to request for logging
      (req as any).recaptcha = {
        score: recaptchaResponse.score,
        action: recaptchaResponse.action,
        timestamp: recaptchaResponse.challenge_ts,
        hostname: recaptchaResponse.hostname
      };

      next();
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      return res.status(500).json({
        error: { message: 'Failed to verify reCAPTCHA' }
      });
    }
  };
} 