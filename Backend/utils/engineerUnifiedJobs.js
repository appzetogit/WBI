const VendorOpsJob = require('../models/VendorOpsJob');

const OPS_ASSIGNED = ['pending_acceptance', 'accepted'];
const OPS_IN_PROGRESS = ['en_route', 'on_site', 'in_progress'];
const OPS_COMPLETED = ['completed'];

const opsStatusQuery = (tab) => {
  if (tab === 'assigned') return { $in: OPS_ASSIGNED };
  if (tab === 'in_progress') return { $in: OPS_IN_PROGRESS };
  if (tab === 'completed') return { $in: OPS_COMPLETED };
  return { $nin: ['cancelled', 'rejected'] };
};

const mapOpsJobForList = (job) => ({
  _id: job._id,
  isOpsJob: true,
  status: job.status,
  serviceName: job.title,
  serviceId: { title: job.title },
  address: { city: job.city || '', addressLine1: job.address || '' },
  finalAmount: job.budget || 0,
  basePrice: job.budget || 0,
  scheduledDate: job.scheduledAt || job.assignedAt || job.createdAt,
  createdAt: job.createdAt,
  clientName: job.clientName,
  jobCode: job.jobCode,
  city: job.city
});

async function fetchOpsJobsForEngineer(engineerId, tab = 'all') {
  const filter = {
    engineerId,
    status: opsStatusQuery(tab)
  };
  const jobs = await VendorOpsJob.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return jobs.map(mapOpsJobForList);
}

async function countOpsJobsForEngineer(engineerId) {
  const base = { engineerId, status: { $nin: ['cancelled', 'rejected'] } };
  const [all, assigned, inProgress, completed] = await Promise.all([
    VendorOpsJob.countDocuments(base),
    VendorOpsJob.countDocuments({ engineerId, status: { $in: OPS_ASSIGNED } }),
    VendorOpsJob.countDocuments({ engineerId, status: { $in: OPS_IN_PROGRESS } }),
    VendorOpsJob.countDocuments({ engineerId, status: { $in: OPS_COMPLETED } })
  ]);
  return { all, assigned, in_progress: inProgress, completed };
}

module.exports = {
  mapOpsJobForList,
  fetchOpsJobsForEngineer,
  countOpsJobsForEngineer
};
