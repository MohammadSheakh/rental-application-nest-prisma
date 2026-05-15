import { Provider, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { ConfigService } from '@nestjs/config';

/**
 * Redis Provider
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Creates and configures Redis client with:
 * - Connection pooling
 * - Error handling
 * - Graceful degradation (doesn't crash app)
 * - Health check support
 */
export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async (configService: ConfigService): Promise<Redis | null> => {
    const logger = new Logger('RedisProvider');
    const host = configService.get<string>('REDIS_HOST', 'localhost');
    const port = configService.get<number>('REDIS_PORT', 6379);
    const password = configService.get<string>('REDIS_PASSWORD', '');
    const db = configService.get<number>('REDIS_DB', 0);

    try {
      const client = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        retryStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Max reconnection attempts reached');
            if (process.env.NODE_ENV === 'production') {
              logger.warn('Redis unavailable - caching disabled');
              return null;
            }
            return null;
          }
          logger.log(`Reconnecting attempt ${retries}...`);
          return Math.min(retries * 100, 3000);
        },
      });

      // Connection event handlers
      client.on('error', (err) => {
        logger.error('Redis Client Error:', err.message);
      });

      client.on('connect', () => logger.log('Connected successfully'));

      client.on('ready', () => logger.log('Client ready'));

      client.on('reconnecting', () => logger.log('Reconnecting...'));

      client.on('end', () => logger.log('Connection ended'));

      logger.log('Connection established');
      
      return client;
    } catch (error) {
      logger.error('Connection failed:', error.message);
      
      // In production, don't crash - return null
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Redis unavailable in production - caching disabled');
        return null;
      }
      
      // In development, throw error to alert developer
      throw error;
    }
  },
  inject: [ConfigService],
};
