const IORedis = require('ioredis');

// Use existing redis config or fallback to local
const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
};

const redisClient = new IORedis(redisOptions);

redisClient.on('connect', () => {
  console.log('[CACHE] Connected to Redis Cache');
});

redisClient.on('error', (err) => {
  console.error('[CACHE] Redis Error:', err.message);
});

/**
 * Get data from cache
 * @param {string} key Cache key
 * @returns {Promise<any>} Parsed JSON data or null
 */
const getCache = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`[CACHE GET ERROR] Key: ${key}`, error.message);
    return null; // Fallback gracefully
  }
};

/**
 * Set data to cache
 * @param {string} key Cache key
 * @param {any} value Data to cache
 * @param {number} ttl Time to live in seconds (default 3600 = 1 hour)
 */
const setCache = async (key, value, ttl = 3600) => {
  try {
    const stringValue = JSON.stringify(value);
    await redisClient.set(key, stringValue, 'EX', ttl);
  } catch (error) {
    console.error(`[CACHE SET ERROR] Key: ${key}`, error.message);
  }
};

/**
 * Delete data from cache
 * @param {string} key Cache key
 */
const deleteCache = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`[CACHE DEL ERROR] Key: ${key}`, error.message);
  }
};

module.exports = {
  redisClient,
  getCache,
  setCache,
  deleteCache
};
