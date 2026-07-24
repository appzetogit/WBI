const mongoose = require('mongoose');
const { isRedisConnected } = require('../services/redisService');
const circuitBreaker = require('./circuitBreaker');

/**
 * GET /live — process is up (K8s liveness). Always 200 if handler runs.
 */
function liveHandler(req, res) {
  res.status(200).json({
    success: true,
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /ready — dependencies OK (K8s readiness / ALB target health).
 * Returns 503 when Mongo is down or Redis required but unavailable.
 */
function readyHandler(req, res) {
  const dbOk = mongoose.connection.readyState === 1;
  const redisRequired = process.env.REDIS_ENABLED === 'true';
  const redisOk = !redisRequired || isRedisConnected();

  const ready = dbOk && redisOk;
  const payload = {
    success: ready,
    status: ready ? 'ready' : 'not_ready',
    checks: {
      mongo: dbOk ? 'ok' : 'down',
      redis: redisRequired ? (redisOk ? 'ok' : 'down') : 'disabled'
    },
    timestamp: new Date().toISOString()
  };

  res.status(ready ? 200 : 503).json(payload);
}

/**
 * GET /health — legacy liveness + informational deps (ALB-friendly 200).
 */
function healthHandler(req, res) {
  const dbOk = mongoose.connection.readyState === 1;
  const redisRequired = process.env.REDIS_ENABLED === 'true';

  const payload = {
    success: true,
    message: 'WBI API is running',
    version: process.env.API_VERSION || '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      mongo: dbOk ? 'ok' : 'degraded',
      redis: redisRequired
        ? (isRedisConnected() ? 'ok' : 'degraded')
        : 'disabled',
      razorpay: process.env.RAZORPAY_KEY_SECRET ? 'configured' : 'missing',
      circuits: {
        razorpay: circuitBreaker.getStatus('razorpay'),
        sms: circuitBreaker.getStatus('sms')
      }
    }
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.nodeEnv = process.env.NODE_ENV;
  }

  res.status(200).json(payload);
}

module.exports = { liveHandler, readyHandler, healthHandler };
