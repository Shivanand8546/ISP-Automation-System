import IORedis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

let redisClient: IORedis | null = null;

export function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis error');
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.ping();
  logger.info('Redis ping successful');
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}

export function getCacheClient(): IORedis {
  return new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
