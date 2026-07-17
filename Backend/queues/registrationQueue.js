const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

// Use existing redis config or fallback to local
const redisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null // Required by bullmq
};

const connection = new IORedis(redisOptions);

// Create the Queue
const registrationQueue = new Queue('registration-tasks', { connection });

// Generic wrapper to add tasks
const enqueueRegistrationTask = async (taskName, payload) => {
  try {
    console.log(`[QUEUE] Enqueuing ${taskName} for ${payload.phone || payload.email || 'user'}`);
    await registrationQueue.add(taskName, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false
    });
  } catch (error) {
    console.error(`[QUEUE] Failed to enqueue ${taskName}:`, error);
  }
};

// Create the Worker
const registrationWorker = new Worker(
  'registration-tasks',
  async (job) => {
    const { name, data } = job;
    console.log(`[WORKER] Processing job: ${name} (Job ID: ${job.id})`);

    try {
      switch (name) {
        case 'KYC_VERIFICATION':
          // Simulate or call real KYC logic here
          console.log(`[WORKER] Running KYC verification for:`, data.vendorId || data.userId);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          console.log(`[WORKER] KYC Verified.`);
          break;

        case 'BANK_PENNY_DROP':
          // Simulate bank penny drop
          console.log(`[WORKER] Executing Penny Drop for:`, data.bankDetails);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          console.log(`[WORKER] Penny Drop Success.`);
          break;

        case 'WELCOME_NOTIFICATION':
          // Simulate sending SMS/Email
          console.log(`[WORKER] Sending Welcome SMS/Email to:`, data.phone || data.email);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log(`[WORKER] Welcome SMS Sent.`);
          break;

        default:
          console.warn(`[WORKER] Unknown job type: ${name}`);
      }
    } catch (err) {
      console.error(`[WORKER] Error processing ${name}:`, err.message);
      throw err; // Trigger retry
    }
  },
  { connection }
);

// Worker Event Listeners
registrationWorker.on('completed', (job) => {
  console.log(`[WORKER] Job ${job.id} completed successfully.`);
});

registrationWorker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job.id} failed with error: ${err.message}`);
});

module.exports = {
  registrationQueue,
  enqueueRegistrationTask
};
