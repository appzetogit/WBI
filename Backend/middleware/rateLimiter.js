const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Redis-backed store when REDIS_ENABLED=true.
 * In production, do not fail open on Redis errors (enterprise counters must be shared).
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
  passOnStoreError: !isProd
};

/** General API — default 100 req/min/IP (Phase 9) */
const rateLimiter = rateLimit({
  ...baseOpts,
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  store: createRedisStore('global')
});

/** Admin APIs — 200 req/min/IP */
const adminApiLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX, 10) || 200,
  message: { success: false, message: 'Too many admin requests. Please slow down.' },
  store: createRedisStore('admin'),
  skip: (req) => req.path.startsWith('/auth')
});

/** Login — 10 req/min/IP */
const loginLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  message: { success: false, message: 'Too many login attempts. Please try again in a minute.' },
  store: createRedisStore('login')
});

const verificationLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many verification attempts. Please wait 15 minutes before trying again.' },
  skipSuccessfulRequests: false,
  store: createRedisStore('verify')
});

/** GST verify — slightly higher limit for multi-step registration UX */
const gstVerifyLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.GST_VERIFY_RATE_LIMIT_MAX, 10) || 10,
  message: { success: false, code: 'GST_RATE_LIMIT', message: 'Too many GST verification attempts. Please wait 15 minutes.' },
  store: createRedisStore('gst')
});

/** CIN / MCA verify */
const cinVerifyLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.CIN_VERIFY_RATE_LIMIT_MAX, 10) || 10,
  message: {
    success: false,
    code: 'CIN_RATE_LIMIT',
    message: 'Too many CIN verification attempts. Please wait 15 minutes.'
  },
  store: createRedisStore('cin')
});

/** UPI / Mobile-UPI / Location suite */
const cgpeSuiteLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.CGPE_SUITE_RATE_LIMIT_MAX, 10) || 20,
  message: {
    success: false,
    code: 'CGPE_SUITE_RATE_LIMIT',
    message: 'Too many verification attempts. Please wait 15 minutes.'
  },
  store: createRedisStore('cgpe-suite')
});

/** OTP HTTP — 5 req/hour/IP (Phase 9) */
const otpLimiter = rateLimit({
  ...baseOpts,
  windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS, 10) || 60 * 60 * 1000,
  max: parseInt(process.env.OTP_HTTP_RATE_LIMIT_MAX, 10) || 5,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' },
  store: createRedisStore('otp')
});

const paymentLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many payment requests. Please slow down and try again shortly.' },
  store: createRedisStore('pay')
});

const paymentVerifyLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many verification attempts. Please wait a moment and try again.' },
  store: createRedisStore('pay-verify')
});

/** Registration — 5 req/min/IP (Phase 9) */
const registrationLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  max: parseInt(process.env.REGISTRATION_RATE_LIMIT_MAX, 10) || 5,
  message: { success: false, message: 'Too many registration attempts from this device. Please try again shortly.' },
  store: createRedisStore('register')
});

const strictApiLimiter = rateLimit({
  ...baseOpts,
  windowMs: 10 * 1000,
  max: 3,
  message: { success: false, message: 'Please slow down. Only 3 requests allowed per 10 seconds.' },
  store: createRedisStore('strict')
});

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

const engineerApiLimiter = rateLimit({
  ...baseOpts,
  windowMs: parseInt(process.env.ENGINEER_API_RATE_WINDOW_MS, 10) || 60 * 1000,
  max: parseInt(process.env.ENGINEER_API_RATE_MAX, 10) || 120,
  message: { success: false, message: 'Too many engineer API requests. Please slow down.' },
  store: createRedisStore('eng-api')
});

const engineerActionLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many actions. Please wait a moment.' },
  store: createRedisStore('eng-action')
});

rateLimiter.verificationLimiter = verificationLimiter;
rateLimiter.gstVerifyLimiter = gstVerifyLimiter;
rateLimiter.cinVerifyLimiter = cinVerifyLimiter;
rateLimiter.cgpeSuiteLimiter = cgpeSuiteLimiter;
rateLimiter.otpLimiter = otpLimiter;
rateLimiter.paymentLimiter = paymentLimiter;
rateLimiter.paymentVerifyLimiter = paymentVerifyLimiter;
rateLimiter.registrationLimiter = registrationLimiter;
rateLimiter.strictApiLimiter = strictApiLimiter;
rateLimiter.vendorCodeValidateLimiter = vendorCodeValidateLimiter;
rateLimiter.engineerApiLimiter = engineerApiLimiter;
rateLimiter.engineerActionLimiter = engineerActionLimiter;
rateLimiter.loginLimiter = loginLimiter;
rateLimiter.adminApiLimiter = adminApiLimiter;

module.exports = rateLimiter;
