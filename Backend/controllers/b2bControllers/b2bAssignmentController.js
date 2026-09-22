const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const JobAssignment = require('../../models/JobAssignment');
const Vendor = require('../../models/Vendor');
const { viewFilter, viewOfJob } = require('../../services/b2bJobViews');

/**
 * B2B Assignments — who is holding the company's jobs.
 *
 *  - current vendor assignments: open jobs a vendor accepted (or is being offered)
 *  - current freelancer assignments: open jobs held by an independent engineer
 *  - history: every JobAssignment row (append-only) on the company's jobs
 *
 * Everything is scoped to req.companyId; nothing here can read another
 * company's jobs or assignments.
 */

const companyOid = (req) => new mongoose.Types.ObjectId(String(req.companyId || req.user.companyId || req.user.id));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageParams = (q) => {
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

/** Jobs still in play — not resolved, cancelled or failed. */
const openJobsClause = () => ({
  $nor: [viewFilter('resolved'), viewFilter('cancelled'), viewFilter('failed')]
});

const VENDOR_HELD = {
  $or: [
    { assignedVendorId: { $ne: null } },
    { assignmentType: { $in: ['vendor', 'vendor_engineer'] } }
  ]
};
const VENDOR_OFFERED = { assignedVendorId: null, 'notifiedVendors.0': { $exists: true } };
const FREELANCER_HELD = { assignmentType: 'freelancer', assignedTo: { $ne: null } };

const searchClause = (search) => {
  const s = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  if (!s) return null;
  const rx = { $regex: escapeRegex(s), $options: 'i' };
  return { $or: [{ jobId: rx }, { customerName: rx }, { city: rx }, { service: rx }, { assignedToName: rx }, { assignedVendorName: rx }] };
};

const JOB_FIELDS = 'jobId customerName service city pincode priority status lifecycleStatus trackingStatus ' +
  'assignmentType assignedVendorId assignedVendorName assignedTo assignedToName assignedAt acceptedAt ' +
  'notifiedVendors vendorOfferExpiresAt assignmentExpiresAt allocationStage allocationReason sla slaDueAt createdAt updatedAt';

/**
 * GET /api/b2b/assignments/summary
 */
const getSummary = async (req, res) => {
  try {
    const companyId = companyOid(req);
    const open = openJobsClause();
    const [vendorActive, vendorOffered, freelancerActive, unassigned, historyAgg] = await Promise.all([
      B2BJob.countDocuments({ companyId, $and: [open, VENDOR_HELD] }),
      B2BJob.countDocuments({ companyId, $and: [open, VENDOR_OFFERED] }),
      B2BJob.countDocuments({ companyId, $and: [open, FREELANCER_HELD] }),
      B2BJob.countDocuments({ companyId, $and: [viewFilter('pending')], assignedVendorId: null, 'notifiedVendors.0': { $exists: false } }),
      B2BJob.aggregate([
        { $match: { companyId } },
        { $project: { _id: 1 } },
        { $lookup: { from: JobAssignment.collection.name, localField: '_id', foreignField: 'jobId', as: 'a' } },
        { $unwind: '$a' },
        { $group: { _id: { type: '$a.assignmentType', status: '$a.status' }, count: { $sum: 1 } } }
      ])
    ]);

    const history = { total: 0, byStatus: {}, byType: {} };
    for (const r of historyAgg) {
      history.total += r.count;
      history.byStatus[r._id.status] = (history.byStatus[r._id.status] || 0) + r.count;
      history.byType[r._id.type] = (history.byType[r._id.type] || 0) + r.count;
    }
    const closedCount = (s) => history.byStatus[s] || 0;
    const decided = closedCount('completed') + closedCount('accepted') + closedCount('rejected') + closedCount('expired');
    history.acceptanceRate = decided
      ? Math.round(((closedCount('completed') + closedCount('accepted')) / decided) * 1000) / 10
      : null;

    return res.status(200).json({
      success: true,
      data: { vendorActive, vendorOffered, freelancerActive, unassigned, history }
    });
  } catch (error) {
    console.error('[B2B Assignments summary]', error);
    return res.status(500).json({ success: false, message: 'Failed to load assignment summary' });
  }
};

/**
 * GET /api/b2b/assignments/current?type=vendor|freelancer&stage=held|offered
 */
const getCurrent = async (req, res) => {
  try {
    const companyId = companyOid(req);
    const type = req.query.type === 'freelancer' ? 'freelancer' : 'vendor';
    const stage = req.query.stage === 'offered' ? 'offered' : 'held';
    const { page, limit, skip } = pageParams(req.query);

    const and = [openJobsClause()];
    if (type === 'freelancer') and.push(FREELANCER_HELD);
    else and.push(stage === 'offered' ? VENDOR_OFFERED : VENDOR_HELD);
    const search = searchClause(req.query.search);
    if (search) and.push(search);

    const filter = { companyId, $and: and };
    const [jobs, total] = await Promise.all([
      B2BJob.find(filter)
        .select(JOB_FIELDS)
        .populate('assignedTo', 'firstName lastName profilePic averageRating engineerType')
        .sort({ assignedAt: -1, updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      B2BJob.countDocuments(filter)
    ]);

    const now = Date.now();
    const data = jobs.map((j) => {
      const { notifiedVendors, ...rest } = j;
      return {
        ...rest,
        view: viewOfJob(j),
        // Companies see how many vendors hold the offer, not who they are.
        offeredVendorCount: Array.isArray(notifiedVendors) ? notifiedVendors.length : 0,
        engineerName: j.assignedTo
          ? [j.assignedTo.firstName, j.assignedTo.lastName].filter(Boolean).join(' ') || j.assignedToName
          : j.assignedToName || null,
        slaBreached: (j.sla?.breaches || []).length > 0,
        offerExpiresInMinutes: j.vendorOfferExpiresAt
          ? Math.round((new Date(j.vendorOfferExpiresAt).getTime() - now) / 60000)
          : null
      };
    });

    return res.status(200).json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('[B2B Assignments current]', error);
    return res.status(500).json({ success: false, message: 'Failed to load assignments' });
  }
};

/**
 * GET /api/b2b/assignments/history?type=vendor_engineer|freelancer|worker&status=&startDate&endDate&search
 */
const getHistory = async (req, res) => {
  try {
    const companyId = companyOid(req);
    const { page, limit, skip } = pageParams(req.query);

    const jobMatch = { companyId };
    const search = searchClause(req.query.search);
    if (search) Object.assign(jobMatch, search);

    const aMatch = {};
    if (['vendor_engineer', 'freelancer', 'worker'].includes(req.query.type)) aMatch['a.assignmentType'] = req.query.type;
    if (JobAssignment.OPEN_STATUSES.concat(JobAssignment.CLOSED_STATUSES).includes(req.query.status)) {
      aMatch['a.status'] = req.query.status;
    }
    if (req.query.startDate || req.query.endDate) {
      aMatch['a.assignedAt'] = {};
      if (req.query.startDate && !isNaN(Date.parse(req.query.startDate))) aMatch['a.assignedAt'].$gte = new Date(req.query.startDate);
      if (req.query.endDate && !isNaN(Date.parse(req.query.endDate))) {
        aMatch['a.assignedAt'].$lte = new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999));
      }
    }

    const [result] = await B2BJob.aggregate([
      { $match: jobMatch },
      { $project: { jobId: 1, customerName: 1, service: 1, city: 1 } },
      { $lookup: { from: JobAssignment.collection.name, localField: '_id', foreignField: 'jobId', as: 'a' } },
      { $unwind: '$a' },
      ...(Object.keys(aMatch).length ? [{ $match: aMatch }] : []),
      { $sort: { 'a.assignedAt': -1, 'a._id': -1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }]
        }
      }
    ]);

    const rows = result?.rows || [];
    const total = result?.total?.[0]?.count || 0;

    const vendorIds = [...new Set(rows.map((r) => r.a.vendorId).filter(Boolean).map(String))];
    const vendors = vendorIds.length
      ? await Vendor.find({ _id: { $in: vendorIds } }).select('businessName name').lean()
      : [];
    const vendorName = new Map(vendors.map((v) => [String(v._id), v.businessName || v.name]));

    const minutesBetween = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);
    const data = rows.map((r) => ({
      id: r.a._id,
      job: { _id: r._id, jobId: r.jobId, customerName: r.customerName, service: r.service, city: r.city },
      assignmentType: r.a.assignmentType,
      vendorName: r.a.vendorId ? vendorName.get(String(r.a.vendorId)) || null : null,
      engineerName: r.a.engineerName || null,
      assignedByRole: r.a.assignedBy?.role || null,
      routingMode: r.a.routingMode,
      status: r.a.status,
      isOpen: r.a.isOpen,
      assignedAt: r.a.assignedAt,
      acceptedAt: r.a.acceptedAt,
      closedAt: r.a.closedAt,
      closeReason: r.a.closeReason || r.a.reason || '',
      minutesToAccept: minutesBetween(r.a.assignedAt, r.a.acceptedAt),
      minutesHeld: minutesBetween(r.a.assignedAt, r.a.closedAt)
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('[B2B Assignments history]', error);
    return res.status(500).json({ success: false, message: 'Failed to load assignment history' });
  }
};

module.exports = { getSummary, getCurrent, getHistory };
