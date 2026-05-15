import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../core/database/redis/redis.constants';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

/**
 * Sliding Window Rate Limit Guard
 * 
 * 📚 SENIOR LEVEL IMPLEMENTATION
 * 
 * High-performance rate limiting using Redis Sorted Sets
 * Features:
 * ✅ Sliding window algorithm (no burst at window edges)
 * ✅ Atomic operations via Redis Pipeline
 * ✅ Fail-open logic for high availability
 * ✅ Standard X-RateLimit headers
 * ✅ Custom route-based presets
 */
@Injectable()
export class SlidingWindowRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SlidingWindowRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no options provided, bypass rate limiting
    if (!options) {
      return true;
    }

    // If Redis is down, fail open (allow request)
    if (!this.redisClient) {
      this.logger.warn('Redis unavailable - Bypassing rate limit (fail-open)');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Generate unique identifier
    const userId = request.user?.userId;
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    
    const keyPrefix = options.keyPrefix || 'default';
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    
    try {
      const now = Date.now();
      const windowStart = now - options.windowMs;

      // Atomic sliding window logic
      const pipeline = this.redisClient.multi();
      
      // 1. Remove entries outside the sliding window
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // 2. Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // 3. Set expiry to clean up old keys
      pipeline.expire(key, Math.ceil(options.windowMs / 1000) + 1);
      
      // 4. Count remaining entries in window
      pipeline.zcard(key);

      const results = await pipeline.exec();
      
      if (!results) {
        return true; // Fail open
      }

      // results is array of [error, result]
      // index 3 is zcard result
      const count = results[3][1] as number;
      const remaining = Math.max(0, options.max - count);
      const reset = Math.ceil((now + options.windowMs) / 1000);

      // Set standard headers
      response.set('X-RateLimit-Limit', String(options.max));
      response.set('X-RateLimit-Remaining', String(remaining));
      response.set('X-RateLimit-Reset', String(reset));

      if (count > options.max) {
        response.set('Retry-After', String(Math.ceil(options.windowMs / 1000)));
        throw new HttpException(
          {
            success: false,
            message: 'Too many requests, please slow down',
            retryAfter: `${Math.ceil(options.windowMs / 1000)}s`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Rate limit error: ${error.message}`);
      return true; // Fail open for any other errors
    }
  }
}
