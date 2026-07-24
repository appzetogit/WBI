const mongoose = require('mongoose');
const logger = require('./logger');

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30000;

let shuttingDown = false;

/**
 * Register SIGTERM/SIGINT handlers — drain HTTP, close Mongo/Redis, exit cleanly.
 * Required for K8s rolling updates and PM2 reload without dropped requests.
 */
function registerGracefulShutdown({ server, getRedisClose, getWorkerClosers = [] }) {
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown.start', { signal });

    const forceTimer = setTimeout(() => {
      logger.error('shutdown.timeout', { ms: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      if (server && typeof server.close === 'function') {
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
        logger.info('shutdown.http_closed');
      }

      for (const closeFn of getWorkerClosers) {
        try {
          if (typeof closeFn === 'function') await closeFn();
        } catch (err) {
          logger.warn('shutdown.worker_close_failed', { err: err.message });
        }
      }

      if (typeof getRedisClose === 'function') {
        try {
          await getRedisClose();
          logger.info('shutdown.redis_closed');
        } catch (err) {
          logger.warn('shutdown.redis_close_failed', { err: err.message });
        }
      }

      await mongoose.connection.close(false);
      logger.info('shutdown.mongo_closed');

      clearTimeout(forceTimer);
      logger.info('shutdown.complete', { signal });
      process.exit(0);
    } catch (err) {
      logger.error('shutdown.error', { err });
      clearTimeout(forceTimer);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { isShuttingDown: () => shuttingDown };
}

module.exports = { registerGracefulShutdown, isShuttingDown: () => shuttingDown };
