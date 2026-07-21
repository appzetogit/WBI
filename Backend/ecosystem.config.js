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
      script: 'server.js',
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
        // Ensure these are set in the process environment / .env on the host:
        // REDIS_ENABLED=true
        // REDIS_URL=redis://...
        // RATE_LIMIT_MAX=300
        // ENGINEER_API_RATE_MAX=120
      }
    }
  ]
};
