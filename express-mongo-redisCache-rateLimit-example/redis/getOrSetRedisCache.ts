import { redisClient } from "./redis";

export function getOrSetRedisCache(
  key: string,
  cb: () => Promise<any>,
  ttl = 3600, // default TTL of 1 hour
  wantToUseRedis: boolean = true
): Promise<any> {

  if (!wantToUseRedis) {
    return cb(); 
  }

  return new Promise(async (resolve, reject) => {
    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        return resolve(JSON.parse(cachedData));
      }

      const freshData = await cb();
      await redisClient.setEx(key, ttl, JSON.stringify(freshData));
      resolve(freshData);
    } catch (error) {
      reject(error);
    }
  });
}

