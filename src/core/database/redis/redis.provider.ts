import { Provider, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { ConfigService } from '@nestjs/config';

/**
 * Redis configuration options shared across the application
 */
export const getRedisOptions = (configService: ConfigService) => ({
  host: configService.get<string>('REDIS_HOST', 'localhost'),
  port: configService.get<number>('REDIS_PORT', 6379),
  password: configService.get<string>('REDIS_PASSWORD', '') || undefined,
  db: configService.get<number>('REDIS_DB', 0),
});

/**
 * Redis Provider
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 */
export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async (configService: ConfigService): Promise<Redis | null> => {
    const logger = new Logger('RedisProvider');
    const options = getRedisOptions(configService);

    try {
      const client = new Redis({
        ...options,
        retryStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Max reconnection attempts reached');
            return null;
          }
          return Math.min(retries * 100, 3000);
        },
      });

      client.on('error', (err) => logger.error('Redis Client Error:', err.message));
      client.on('connect', () => logger.log('Connected successfully'));

      return client;
    } catch (error) {
      logger.error('Connection failed:', error.message);
      return null;
    }
  },
  inject: [ConfigService],
};
