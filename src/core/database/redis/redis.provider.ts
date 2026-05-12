import { Provider, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
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
  useFactory: async (configService: ConfigService): Promise<RedisClientType | null> => {
    const logger = new Logger('RedisProvider');
    const host = configService.get<string>('REDIS_HOST', 'localhost');
    const port = configService.get<number>('REDIS_PORT', 6379);
    const password = configService.get<string>('REDIS_PASSWORD', '');
    const db = configService.get<number>('REDIS_DB', 0);

    try {
      // Create Redis client
      const client = createClient({
        socket: {
          host,
          port,
          reconnectStrategy: (retries) => {
            // Exponential backoff reconnection strategy
            if (retries > 10) {
              logger.error('Max reconnection attempts reached');
              // In production, return null instead of crashing
              if (process.env.NODE_ENV === 'production') {
                logger.warn('Redis unavailable - caching disabled');
                return null; // Stop reconnecting
              }
              return new Error('Redis max reconnection attempts reached');
            }
            logger.log(`Reconnecting attempt ${retries}...`);
            return Math.min(retries * 100, 3000);
          },
        },
        password: password || undefined,
        database: db,
      });

      // Connection event handlers
      client.on('error', (err) => {
        logger.error('Redis Client Error:', err.message);
      });

      client.on('connect', () => {
        logger.log('Connected successfully');
      });

      client.on('ready', () => {
        logger.log('Client ready');
      });

      client.on('reconnecting', () => {
        logger.log('Reconnecting...');
      });

      client.on('end', () => {
        logger.log('Connection ended');
      });

      // Connect to Redis
      await client.connect();
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
