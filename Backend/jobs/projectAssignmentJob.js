const { Worker } = require('bullmq');
const { redisConnection } = require('./queueSetup');
const {
  handleVendorTimeout,
  handleFreelancerPoolTimeout
} = require('../services/projectAssignmentEngine.service');

const projectAssignmentWorker = new Worker(
  'project-assignment',
  async (job) => {
    if (job.name === 'vendor-response-timeout') {
      const { opportunityId, vendorId } = job.data || {};
      if (!opportunityId || !vendorId) return;
      await handleVendorTimeout(opportunityId, vendorId);
      return { handled: true };
    }
    if (job.name === 'freelancer-pool-timeout') {
      const { opportunityId } = job.data || {};
      if (!opportunityId) return;
      await handleFreelancerPoolTimeout(opportunityId);
      return { handled: true };
    }
    return { skipped: true };
  },
  { connection: redisConnection, concurrency: 5 }
);

projectAssignmentWorker.on('error', (err) => {
  console.error('[projectAssignmentWorker]', err.message);
});

module.exports = projectAssignmentWorker;
