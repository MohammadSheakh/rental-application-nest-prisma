//@ts-ignore
import { createClient } from 'redis';
//@ts-ignore
import colors from 'colors';
import { errorLogger, logger } from '../../shared/logger';
import { config } from '../../config';

// Create Redis clients
/***********
const redisPubClient = createClient({

  host: config.redis.host || 'redis',  // Update with your Redis configuration // For Office->'172.22.201.132' // Docker->redis
  port: parseInt(config.redis.port) || 6379, // config.redis.port || 6379, // For Office  6379 
  // username: '',
  // password: ""
  family: 4, // Force IPv4
  connectTimeout: 10000,
  lazyConnect: true
});
*********** */

// Create Redis clients with CORRECT v4+ syntax
const redisPubClient = createClient({
  socket: {
    host: config.redis.host || 'redis',
    port: parseInt(config.redis.port) || 6379,
    family: 4, // Force IPv4
    connectTimeout: 10000,
  },
  // Remove lazyConnect - not needed in v4+
});

const redisSubClient = redisPubClient.duplicate();

// For general caching operations, we'll use the pub client
export const redisClient = redisPubClient;

// Export both clients if needed for Socket.IO adapter
export { redisPubClient, redisSubClient };

// Connection event handlers
redisPubClient.on('ready', () => {
  logger.info(colors.green('♨️  Redis Pub Client ready'));
});
//@ts-ignore
redisPubClient.on('error', (err) => {
  errorLogger.error('Redis Pub Client Error:', err);
});

redisSubClient.on('ready', () => {
  logger.info(colors.green('♨️  Redis Sub Client ready'));
});
//@ts-ignore
redisSubClient.on('error', (err) => {
  logger.error('Redis Sub Client Error:', err);
});

// Initialize Redis connections
export async function initializeRedis() {

  // Add this to your main server file or Redis config file
  // console.log('😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄😄 process.env.redis_host', process.env.REDIS_HOST, process.env.REDIS_PORT);

  try {
    await Promise.all([
      redisPubClient.connect(),
      redisSubClient.connect()
    ]);
    logger.info(colors.green('✅ Redis clients connected successfully'));
  } catch (error) {
    logger.error('Failed to connect Redis clients:', error);
    throw error;
  }
}

// Graceful shutdown
export async function closeRedisConnections() {
  try {
    await Promise.all([
      redisPubClient.quit(),
      redisSubClient.quit()
    ]);
    logger.info('Redis connections closed');
  } catch (error) {
    errorLogger.error('Error closing Redis connections:', error);
  }
}