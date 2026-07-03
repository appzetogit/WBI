const redisService = require('../services/redisService');

// In-memory fallback cache
const localCache = new Map();

/**
 * Clean up expired local cache entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of localCache.entries()) {
    if (now > entry.expiry) {
      localCache.delete(key);
    }
  }
}, 30000).unref(); // Run every 30s, do not keep event loop active

const getCache = async (key) => {
  try {
    // 1. Try Redis first if connected
    if (redisService.isRedisConnected()) {
      return await redisService.getCache(key);
    }
  } catch (error) {
    console.error('[CacheHelper] Redis getCache error:', error);
  }

  // 2. Fallback to local in-memory cache
  const entry = localCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiry) {
    localCache.delete(key);
    return null;
  }

  return entry.data;
};

const setCache = async (key, data, ttlSeconds = 300) => {
  try {
    // 1. Try Redis first if connected
    if (redisService.isRedisConnected()) {
      return await redisService.setCache(key, data, ttlSeconds);
    }
  } catch (error) {
    console.error('[CacheHelper] Redis setCache error:', error);
  }

  // 2. Fallback to local in-memory cache
  localCache.set(key, {
    data,
    expiry: Date.now() + (ttlSeconds * 1000)
  });
  return true;
};

const delCache = async (pattern) => {
  try {
    const patterns = [pattern];
    if (pattern === 'home_data:*') {
      patterns.push('homeData:*');
    }
    // 1. Try Redis first if connected
    if (redisService.isRedisConnected()) {
      for (const pat of patterns) {
        await redisService.delCache(pat);
      }
      return true;
    }
  } catch (error) {
    console.error('[CacheHelper] Redis delCache error:', error);
  }

  // 2. Fallback to local in-memory cache
  const patterns = [pattern];
  if (pattern === 'home_data:*') {
    patterns.push('homeData:*');
  }
  for (const pat of patterns) {
    if (pat.includes('*')) {
      const regexStr = '^' + pat.replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexStr);
      for (const key of localCache.keys()) {
        if (regex.test(key)) {
          localCache.delete(key);
        }
      }
    } else {
      localCache.delete(pat);
    }
  }
  return true;
};

module.exports = {
  getCache,
  setCache,
  delCache
};
