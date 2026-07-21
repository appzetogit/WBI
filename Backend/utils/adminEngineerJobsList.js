const VendorOpsJob = require('../models/VendorOpsJob');
const B2BJob = require('../models/B2BJob');
const Engineer = require('../models/Engineer');

const ADMIN_STATUS_MAP = {
  pending: {
    ops: ['pending_acceptance'],
    b2b: ['pending', 'searching_engineer', 'assigned']
  },
  confirmed: {
    ops: ['accepted'],
    b2b: ['assigned']
  },
  ongoing: {
    ops: ['en_route', 'on_site', 'in_progress'],
    b2b: ['in_progress']
  },
  completed: {
    ops: ['completed'],
    b2b: ['completed']
  },
  cancelled: {
    ops: ['cancelled', 'rejected'],
    b2b: ['cancelled', 'failed']
  }
};

function mapOpsJob(job) {
  return {
    _id: job._id,
    jobType: 'vendor_ops',
    isOpsJob: true,
    status: job.status,
    displayStatus: job.status,
    serviceId: { title: job.title || 'Vendor ops job' },
    engineerId: job.engineerId,
    userId: { name: job.clientName || 'Client' },
    finalAmount: job.budget || 0,
    bookingDate: job.scheduledAt || job.createdAt,
    bookingTime: job.scheduledAt
      ? new Date(job.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '—',
    createdAt: job.createdAt,
    jobCode: job.jobCode,
    city: job.city,
    addressLine: job.address
  };
}

function mapB2BJob(job) {
  return {
    _id: job._id,
    jobType: 'b2b',
    isOpsJob: false,
    status: job.status,
    displayStatus: job.status,
    serviceId: { title: job.service || job.jobId || 'B2B job' },
    engineerId: job.assignedTo,
    userId: { name: job.customerName || 'Customer' },
    finalAmount: job.amount || job.price || 0,
    bookingDate: job.preferredDate || job.createdAt,
    bookingTime: job.preferredTime || '—',
    createdAt: job.createdAt,
    jobCode: job.jobId,
    city: job.city,
    addressLine: job.address
  };
}

async function resolveEngineerIds(search) {
  if (!search || !String(search).trim()) return null;
  const q = String(search).trim();
  const engineers = await Engineer.find({
    $or: [{ name: { $regex: q, $options: 'i' } }, { phone: { $regex: q, $options: 'i' } }]
  })
    .select('_id')
    .lean();
  return engineers.map((e) => e._id);
}

async function fetchAllEngineerJobsForAdmin({ status, page = 1, limit = 20, search }) {
  const engineerIds = await resolveEngineerIds(search);
  if (search && engineerIds && engineerIds.length === 0) {
    return { jobs: [], total: 0, page: parseInt(page, 10), limit: parseInt(limit, 10) };
  }

  const opsQuery = {};
  const b2bQuery = { assignedTo: { $exists: true, $ne: null } };

  if (engineerIds) {
    opsQuery.engineerId = { $in: engineerIds };
    b2bQuery.assignedTo = { $in: engineerIds };
  }

  if (status && status !== 'all' && ADMIN_STATUS_MAP[status]) {
    opsQuery.status = { $in: ADMIN_STATUS_MAP[status].ops };
    b2bQuery.status = { $in: ADMIN_STATUS_MAP[status].b2b };
  }

  const [opsJobs, b2bJobs] = await Promise.all([
    VendorOpsJob.find(opsQuery)
      .populate('engineerId', 'name phone profilePhoto')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    B2BJob.find(b2bQuery)
      .populate('assignedTo', 'name phone profilePhoto')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
  ]);

  const unified = [
    ...opsJobs.map(mapOpsJob),
    ...b2bJobs.map((j) => {
      const row = mapB2BJob(j);
      row.engineerId = j.assignedTo;
      return row;
    })
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = unified.length;
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, parseInt(limit, 10));
  const skip = (p - 1) * l;
  const jobs = unified.slice(skip, skip + l);

  return { jobs, total, page: p, limit: l };
}

module.exports = {
  fetchAllEngineerJobsForAdmin
};
