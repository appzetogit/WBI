/**
 * BullMQ worker for notification-queue
 */
const { Worker } = require('bullmq');
const { redisConnection, notificationQueue } = require('./queueSetup');
const { deliverChannel, processBroadcastChunk } = require('../services/notification/channelAdapters');

let worker = null;

function initNotificationWorker() {
  if (worker) return worker;

  worker = new Worker(
    'notification-queue',
    async (job) => {
      const name = job.name || job.data?.type;
      if (name === 'broadcast_chunk' || job.data?.type === 'broadcast_chunk') {
        return processBroadcastChunk(job.data);
      }
      if (name === 'scheduled_emit' || job.data?.type === 'scheduled_emit') {
        const { emit } = require('../services/notification/notificationOrchestrator.service');
        return emit(job.data.eventKey, job.data.opts || {});
      }
      // deliver_channel
      return deliverChannel({ ...job.data, type: 'deliver_channel' });
    },
    {
      connection: redisConnection,
      concurrency: parseInt(process.env.NOTIF_WORKER_CONCURRENCY || '5', 10),
      limiter: {
        max: parseInt(process.env.NOTIF_WORKER_RATE || '100', 10),
        duration: 1000
      }
    }
  );

  worker.on('completed', (job) => {
    if (process.env.NOTIF_DEBUG === 'true') {
      console.log(`[notificationWorker] completed ${job.id} ${job.name}`);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(`[notificationWorker] failed ${job?.id}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[notificationWorker] error:', err.message);
  });

  console.log('[Server] Notification Worker initialized');
  return worker;
}

module.exports = {
  initNotificationWorker,
  notificationQueue
};
