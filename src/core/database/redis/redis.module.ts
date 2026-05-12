import { Module, Global } from '@nestjs/common';
import { RedisProvider } from './redis.provider';

/**
 * Redis Module
 * 
 * 📚 INDUSTRY STANDARD IMPLEMENTATION
 * 
 * Global module providing Redis client to all other modules
 * 
 * Features:
 * ✅ Global module (no need to import in other modules)
 * ✅ Configurable via environment variables
 * ✅ Automatic reconnection
 * ✅ Health check support
 * 
 * Usage:
 * constructor(@Inject(REDIS_CLIENT) private redisClient: RedisClientType) {}
 */
@Global()
@Module({
  providers: [RedisProvider],
  exports: [RedisProvider],
})
export class RedisModule {}
