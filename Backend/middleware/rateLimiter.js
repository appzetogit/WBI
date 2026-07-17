const rateLimit = require('express-rate-limit');

/**
 * General rate limiter (applied globally in server.js)
 * 300 requests per minute per IP
 */
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 300,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Verification limiter — PAN / Aadhaar / Bank / Selfie / DigiLocker
 * Max 5 requests per 15 minutes per IP
 */
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many verification attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * OTP limiter — Send OTP endpoint
 * Max 3 requests per 10 minutes per IP (prevents OTP spam)
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many OTP requests. Please wait 10 minutes before requesting again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Joining fee / payment limiter
 * Max 5 payment order creations per 10 minutes per IP
 */
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many payment requests. Please slow down and try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Registration / signup limiter
 * Max 5 registration attempts per 30 minutes per IP
 */
const registrationLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many registration attempts from this device. Please try again in 30 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict API limiter for sensitive endpoints (PAN, Aadhaar lookup)
 * Max 3 requests per 10 seconds — prevents rapid-fire duplicate clicks
 */
const strictApiLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 3,
  message: { success: false, message: 'Please slow down. Only 3 requests allowed per 10 seconds.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Attach all limiters to main export for convenience
rateLimiter.verificationLimiter = verificationLimiter;
rateLimiter.otpLimiter = otpLimiter;
rateLimiter.paymentLimiter = paymentLimiter;
rateLimiter.registrationLimiter = registrationLimiter;
rateLimiter.strictApiLimiter = strictApiLimiter;

module.exports = rateLimiter;
