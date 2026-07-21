const rateLimit = require('express-rate-limit');

/**
 * Build a Redis-backed store when Redis is enabled; otherwise undefined
 * (express-rate-limit falls back to in-memory — fine for single-process/dev).
 * passOnStoreError keeps traffic flowing if Redis blips under PM2 cluster load.
 */
const createRedisStore = (prefix) => {
  if (process.env.REDIS_ENABLED !== 'true') return undefined;

  try {
    const { RedisStore } = require('rate-limit-redis');
    const { getRedis } = require('../services/redisService');

    return new RedisStore({
      prefix: `wbi:rl:${prefix}:`,
      sendCommand: (...args) => {
        const redis = getRedis();
        if (!redis) {
          return Promise.reject(new Error('Redis not initialized'));
        }
        return redis.call(...args);
      }
    });
  } catch (err) {
    console.warn(`[RateLimit] Redis store unavailable (${prefix}):`, err.message);
    return undefined;
  }
};

const baseOpts = {
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true
};

/**
 * General rate limiter (applied globally in server.js)
 * Default 300 req/min/IP — override via RATE_LIMIT_* env
 */
const rateLimiter = rateLimit({
  ...baseOpts,
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  store: createRedisStore('global')
});

/**
 * Verification limiter — PAN / Aadhaar / Bank / Selfie / DigiLocker
 * Max 5 requests per 15 minutes per IP
 */
const verificationLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many verification attempts. Please wait 15 minutes before trying again.' },
  skipSuccessfulRequests: false,
  store: createRedisStore('verify')
});

/**
 * OTP limiter — Send OTP endpoint
 * Max 3 requests per 10 minutes per IP (prevents OTP spam)
 */
const otpLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many OTP requests. Please wait 10 minutes before requesting again.' },
  store: createRedisStore('otp')
});

/**
 * Joining fee / payment order creation limiter
 * Max 5 payment order creations per 10 minutes per IP
 */
const paymentLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many payment requests. Please slow down and try again shortly.' },
  store: createRedisStore('pay')
});

/**
 * Payment verify limiter (separate from create-order)
 * Prevents verify being blocked after user retries create-order
 */
const paymentVerifyLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many verification attempts. Please wait a moment and try again.' },
  store: createRedisStore('pay-verify')
});

/**
 * Registration / signup limiter
 * Max 5 registration attempts per 30 minutes per IP
 */
const registrationLimiter = rateLimit({
  ...baseOpts,
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many registration attempts from this device. Please try again in 30 minutes.' },
  store: createRedisStore('register')
});

/**
 * Strict API limiter for sensitive endpoints (PAN, Aadhaar lookup, login)
 * Max 3 requests per 10 seconds — prevents rapid-fire duplicate clicks
 */
const strictApiLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 1000,
  max: 3,
  message: { success: false, message: 'Please slow down. Only 3 requests allowed per 10 seconds.' },
  store: createRedisStore('strict')
});

/**
 * Public vendor company code validation (brute-force target)
 * IP soft cap — fine-grained IP+session failed-attempt check is in the controller
 */
const vendorCodeValidateLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    valid: false,
    message: 'Too many attempts, try after 10 minutes'
  },
  store: createRedisStore('vendor-code')
});

/**
 * Authenticated engineer read/list APIs (dashboard, jobs, B2B, ops)
 * Soft cap per IP so a stuck client cannot hammer Mongo under cluster mode
 */
const engineerApiLimiter = rateLimit({
  ...baseOpts,
  windowMs: parseInt(process.env.ENGINEER_API_RATE_WINDOW_MS, 10) || 60 * 1000,
  max: parseInt(process.env.ENGINEER_API_RATE_MAX, 10) || 120,
  message: { success: false, message: 'Too many engineer API requests. Please slow down.' },
  store: createRedisStore('eng-api')
});

/**
 * Engineer OTP resend / sensitive job mutations
 */
const engineerActionLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many actions. Please wait a moment.' },
  store: createRedisStore('eng-action')
});

// Attach all limiters to main export for convenience
rateLimiter.verificationLimiter = verificationLimiter;
rateLimiter.otpLimiter = otpLimiter;
rateLimiter.paymentLimiter = paymentLimiter;
rateLimiter.paymentVerifyLimiter = paymentVerifyLimiter;
rateLimiter.registrationLimiter = registrationLimiter;
rateLimiter.strictApiLimiter = strictApiLimiter;
rateLimiter.vendorCodeValidateLimiter = vendorCodeValidateLimiter;
rateLimiter.engineerApiLimiter = engineerApiLimiter;
rateLimiter.engineerActionLimiter = engineerActionLimiter;

module.exports = rateLimiter;
