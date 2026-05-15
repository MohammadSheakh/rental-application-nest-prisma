/**
 * Redis-Based Rate Limiter Middleware
 * Production-ready rate limiting using Redis with sliding window algorithm
 *
 * This implementation completely bypasses express-rate-limit validation issues
 * by using Redis directly for rate limiting.
 *
 * @see masterSystemPrompt.md Section 10: Rate Limiting Rules
 * @version 1.0.0 - Redis-based implementation
 */

import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../helpers/redis/redis';
import { errorLogger } from '../shared/logger';

/**
 * Rate Limit Configuration Types
 */
export type TRateLimitType = 'user' | 'admin' | 'auth' | 'api' | 'strict';

/**
 * Rate Limit Presets
 * Pre-configured rate limits for different use cases
 */
export const RATE_LIMIT_PRESETS = {
  user: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: {
      success: false,
      message: 'Too many requests, please slow down',
    },
  },

  admin: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
      success: false,
      message: 'Too many requests from admin',
    },
  },

  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 5 attempts per 15 minutes (brute force protection)
    message: {
      success: false,
      message: 'Too many authentication attempts, please try again later',
    },
  },

  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: {
      success: false,
      message: 'Too many API requests, please slow down',
    },
  },

  strict: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 3 requests per hour // TODO : 
    message: {
      success: false,
      message: 'Too many sensitive operations, please try again later',
    },
  },
} as const;

/**
 * Rate Limit Result
 */
interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  total: number;
}

/**
 * utility function to format time
 */
function formatTime(seconds: number): string {
  const minute = Math.floor(seconds / 60);
  const second = seconds % 60;
  return `${minute}m ${second}s`;
}

/**
 * Check rate limit using Redis
 * Implements sliding window algorithm
 */
async function checkRateLimit(
  key: string,
  windowMs: number,
  max: number,
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Use Redis pipeline for atomic operations
    const pipeline = redisClient.multi();

    // Remove old entries outside the window
    pipeline.zRemRangeByScore(key, '0', String(windowStart));

    // Add current request
    pipeline.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

    // Set expiry on the key
    pipeline.expireAt(key, Math.ceil((now + windowMs) / 1000));

    // Count requests in current window
    pipeline.zCard(key);

    // Execute pipeline
    const results = await pipeline.exec();

    // Get the count (last result)
    const count = (results?.[3] as number) || 0;
    const remaining = Math.max(0, max - count);
    const reset = Math.ceil((now + windowMs) / 1000);

    const nowSec = Math.floor(now / 1000);

    const remainingTimeSec = Math.max(0, reset - nowSec);
    const remainingTimeFormatted = formatTime(remainingTimeSec);

    return {
      success: count <= max,
      remaining,
      reset: remainingTimeFormatted,
      total: max,
    };
  } catch (error) {
    errorLogger.error('Redis rate limit check failed:', error);
    // Fail open - allow request if Redis is down
    return {
      success: true,
      remaining: max,
      reset: Math.ceil((Date.now() + windowMs) / 1000),
      total: max,
    };
  }
}

/**
 * Create Rate Limiter Middleware
 * Factory function to create rate limiters with different configurations
 *
 * @param type - Rate limit type (user, admin, auth, api, strict)
 * @returns Rate limit middleware function
 */
export function rateLimiter(
  type: TRateLimitType = 'user',
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const preset = RATE_LIMIT_PRESETS[type];

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate unique key for this user
      let identifier: string;

      if (req.user?.userId) {
        // Authenticated user - use userId
        identifier = `user:${req.user.userId}`;
      } else {
        // Unauthenticated - use IP or socket address
        identifier = `ip:${req.socket?.remoteAddress || 'unknown'}`;
      }

      // Create rate limit key
      const key = `ratelimit:${type}:${identifier}`;

      // Check rate limit
      const result = await checkRateLimit(key, preset.windowMs, preset.max);

      console.log('result :: ', result);

      // Set rate limit headers
      res.set('X-RateLimit-Limit', String(result.total));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset', String(result.reset));

      // Check if limit exceeded
      if (!result.success) {
        res.set('Retry-After', String(result.reset));

        return res.status(429).json({
          success: false,
          message: preset.message.message,
          retryAfter: result.reset,
        });
      }

      // Continue to next middleware
      next();
    } catch (error) {
      errorLogger.error('Rate limiter middleware error:', error);
      // Fail open - allow request on error
      next();
    }
  };
}

/**
 * Custom Rate Limiter
 * Create a custom rate limiter with specific configuration
 *
 * @param windowMs - Time window in milliseconds
 * @param max - Maximum requests allowed
 * @param message - Error message when limit exceeded
 * @param keyPrefix - Custom key prefix for Redis
 * @returns Rate limit middleware function
 */
export function createCustomRateLimiter(
  windowMs: number,
  max: number,
  message?: string,
  keyPrefix: string = 'custom',
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const errorMessage = message || 'Too many requests, please try again later';

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate unique key for this user
      let identifier: string;

      if (req.user?.userId) {
        identifier = `user:${req.user.userId}`;
      } else {
        identifier = `ip:${req.socket?.remoteAddress || 'unknown'}`;
      }

      // Create rate limit key
      const key = `ratelimit:${keyPrefix}:${identifier}`;

      // Check rate limit
      const result = await checkRateLimit(key, windowMs, max);

      // Set rate limit headers
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset', String(result.reset));

      // Check if limit exceeded
      if (!result.success) {
        res.set('Retry-After', String(result.reset));

        return res.status(429).json({
          success: false,
          message: errorMessage,
          retryAfter: result.reset,
        });
      }

      // Continue to next middleware
      next();
    } catch (error) {
      errorLogger.error('Custom rate limiter error:', error);
      // Fail open - allow request on error
      next();
    }
  };
}

/**
 * Get Rate Limit Status
 * Utility function to check current rate limit status without blocking
 *
 * @param type - Rate limit type
 * @param userId - User ID (optional, uses request user if not provided)
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(
  type: TRateLimitType,
  userId?: string,
): Promise<RateLimitResult | null> {
  try {
    if (!userId) {
      return null;
    }

    const preset = RATE_LIMIT_PRESETS[type];
    const key = `ratelimit:${type}:user:${userId}`;

    const result = await checkRateLimit(key, preset.windowMs, preset.max);
    return result;
  } catch (error) {
    errorLogger.error('Get rate limit status error:', error);
    return null;
  }
}

// Export default rate limiter (user type)
export default rateLimiter;
