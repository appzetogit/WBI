/**
 * Invalidate Redis / in-memory caches so all panels pick up SMS changes.
 */
const { delCache, isRedisConnected } = require('./redisService');

async function invalidateAllCatalogCaches() {
  const keys = [
    'service:config:all',
    'vendor:config:*'
  ];

  for (const key of keys) {
    try {
      await delCache(key);
    } catch (err) {
      console.warn('[catalogCache] delCache failed', key, err.message);
    }
  }

  // Frontend apiCache is client-side; backend public endpoints should be uncached or short-TTL.
  // Mark a bump key so clients can detect staleness if needed later.
  try {
    if (isRedisConnected()) {
      const { setCache } = require('./redisService');
      await setCache('catalog:version', { bumpedAt: new Date().toISOString() }, 86400);
    }
  } catch {
    /* optional */
  }

  return true;
}

module.exports = { invalidateAllCatalogCaches };
