const { redisClient } = require('../utils/cache');

/**
 * Idempotency Middleware
 * Prevents double execution of POST/PUT/PATCH requests by caching the response
 * using the 'Idempotency-Key' header.
 */
const idempotency = async (req, res, next) => {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

  if (!idempotencyKey) {
    // If no key is provided, we can either reject or pass through.
    // For seamless adoption, we'll pass through if not provided, 
    // but in a strict API you might return 400 Bad Request.
    return next();
  }

  const cacheKey = `idempotency:${req.originalUrl}:${idempotencyKey}`;

  try {
    // Check if we've already processed this request
    const cachedResponse = await redisClient.get(cacheKey);

    if (cachedResponse) {
      console.log(`[IDEMPOTENCY] Returning cached response for key: ${idempotencyKey}`);
      const parsed = JSON.parse(cachedResponse);
      return res.status(parsed.status).json(parsed.body);
    }

    // Intercept res.json to cache it before sending
    const originalJson = res.json;
    res.json = function (body) {
      const responseToCache = {
        status: res.statusCode,
        body: body
      };

      // Cache for 24 hours (86400 seconds)
      redisClient.set(cacheKey, JSON.stringify(responseToCache), 'EX', 86400)
        .catch(err => console.error('[IDEMPOTENCY] Redis Cache Error:', err.message));

      return originalJson.apply(this, arguments);
    };

    next();
  } catch (error) {
    console.error('[IDEMPOTENCY] Error:', error.message);
    next();
  }
};

module.exports = idempotency;
