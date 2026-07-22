/**
 * PM2 ecosystem — production cluster for WBI API
 *
 * Deploy:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production   # zero-downtime restart
 *
 * Requires Redis (REDIS_ENABLED=true) so rate limits + Socket.io rooms
 * are shared across cluster workers. Without Redis, each worker has its
 * own in-memory rate-limit counters and socket rooms (alerts may miss).
 *
 * Blue/green / ALB: point health check at GET /health
 */
module.exports = {
  apps: [
    {
      name: 'wbi-backend',
      script: 'scripts/start-production.js',
      cwd: __dirname,
      instances: 'max', // all CPU cores; override with instances: 2 on small boxes
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 8000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production',
        REDIS_ENABLED: 'true',
        RATE_LIMIT_MAX: '100',
        ADMIN_RATE_LIMIT_MAX: '200',
        LOGIN_RATE_LIMIT_MAX: '10',
        REGISTRATION_RATE_LIMIT_MAX: '5',
        OTP_HTTP_RATE_LIMIT_MAX: '5',
        OTP_RATE_LIMIT: '5',
        OTP_RATE_WINDOW: '3600',
        MONGODB_MAX_POOL_SIZE: '25',
        REQUEST_LOG_ENABLED: 'true'
      }
    }
  ]
};
