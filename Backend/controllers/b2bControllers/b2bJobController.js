const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const B2BJobStatusLog = require('../../models/B2BJobStatusLog');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BWallet = require('../../models/B2BWallet');
const B2BBatch = require('../../models/B2BBatch');
const Engineer = require('../../models/Engineer');
const EngineerRating = require('../../models/EngineerRating');
const QuoteApproval = require('../../models/QuoteApproval');
const B2BCompany = require('../../models/B2BCompany');

/** The signed-in actor, whatever the auth middleware called the field. */
const actorId = (req) => req.user?._id || req.user?.id || null;

/**
 * GET Stats (KPIs)
 */
const getStats = async (req, res) => {
  try {
    const rawId = req.companyId || req.user.companyId || req.user.id;
    const companyId = new mongoose.Types.ObjectId(rawId);
    
    const statsPipeline = [
      { $match: { companyId } },
      {
        $facet: {
          totalJobs: [{ $count: 'count' }],
          pending: [{ $match: { status: { $in: ['pending', 'searching_engineer'] } } }, { $count: 'count' }],
          pendingWallet: [{ $match: { status: 'pending_wallet' } }, { $count: 'count' }],
          searchingEngineer: [{ $match: { status: 'searching_engineer' } }, { $count: 'count' }],
          assigned: [{ $match: { status: 'assigned' } }, { $count: 'count' }],
          engineerOnWay: [{ $match: { trackingStatus: 'en_route' } }, { $count: 'count' }],
          inProgress: [{ $match: { status: 'in_progress' } }, { $count: 'count' }],
          onHold: [{ $match: { status: 'on_hold' } }, { $count: 'count' }],
          completed: [{ $match: { status: { $in: ['completed', 'closed'] } } }, { $count: 'count' }],
          cancelled: [{ $match: { status: 'cancelled' } }, { $count: 'count' }],
          rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
          escalated: [{ $match: { status: 'escalated' } }, { $count: 'count' }],
          failed: [{ $match: { status: 'failed' } }, { $count: 'count' }],
          lastMonthTotal: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
                  $lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
              }
            },
            { $count: 'count' }
          ],
          thisMonthCompleted: [
            {
              $match: {
                status: { $in: ['completed', 'closed'] },
                createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
              }
            },
            { $count: 'count' }
          ],
          lastMonthCompleted: [
            {
              $match: {
                status: { $in: ['completed', 'closed'] },
                createdAt: {
                  $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
                  $lt: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
              }
            },
            { $count: 'count' }
          ],
          todayJobs: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                  $lte: new Date(new Date().setHours(23, 59, 59, 999))
                }
              }
            },
            { $count: 'count' }
          ],
          thisMonthJobs: [
            {
              $match: {
                createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
              }
            },
            { $count: 'count' }
          ],
          totalSpend: [
            { $match: { paymentStatus: 'deducted' } },
            { $group: { _id: null, total: { $sum: '$charge' } } }
          ]
        }
      }
    ];

    // Panel views (Pending, Dispatched, …) counted in the same pass.
    // $facet cannot nest, so they sit beside the legacy counters, prefixed.
    const { viewCountFacets, VIEW_KEYS, VIEW_LABELS } = require('../../services/b2bJobViews');
    for (const [key, stages] of Object.entries(viewCountFacets())) {
      statsPipeline[1].$facet[`view_${key}`] = stages;
    }

    const result = await B2BJob.aggregate(statsPipeline);
    const data = result[0] || {};
    const views = VIEW_KEYS.map((key) => ({
      key,
      label: VIEW_LABELS[key],
      count: data[`view_${key}`]?.[0]?.count || 0
    }));

    const extractCount = (arr) => (arr && arr.length > 0 ? arr[0].count : 0);
    const extractTotal = (arr) => (arr && arr.length > 0 ? arr[0].total : 0);

    const thisMonth = extractCount(data.thisMonthJobs);
    const lastMonth = extractCount(data.lastMonthTotal);
    const thisMonthDone = extractCount(data.thisMonthCompleted);
    const lastMonthDone = extractCount(data.lastMonthCompleted);

    const pctChange = (curr, prev) => {
      if (!prev) return curr ? '+100% vs last month' : 'No prior month data';
      const pct = Math.round(((curr - prev) / prev) * 100);
      return `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs last month`;
    };

    const stats = {
      totalJobs: extractCount(data.totalJobs),
      pending: extractCount(data.pending),
      pendingWallet: extractCount(data.pendingWallet),
      searchingEngineer: extractCount(data.searchingEngineer),
      assigned: extractCount(data.assigned),
      engineerOnWay: extractCount(data.engineerOnWay),
      inProgress: extractCount(data.inProgress),
      onHold: extractCount(data.onHold),
      completed: extractCount(data.completed),
      cancelled: extractCount(data.cancelled),
      rejected: extractCount(data.rejected),
      escalated: extractCount(data.escalated),
      failed: extractCount(data.failed),
      todayJobs: extractCount(data.todayJobs),
      thisMonthJobs: thisMonth,
      totalSpend: extractTotal(data.totalSpend),
      walletDeduction: extractTotal(data.totalSpend),
      trends: {
        totalJobs: pctChange(thisMonth, lastMonth),
        completed: pctChange(thisMonthDone, lastMonthDone),
        totalJobsUp: thisMonth >= lastMonth,
        completedUp: thisMonthDone >= lastMonthDone
      }
    };

    const chartData = [
      { name: 'Pending', value: stats.pending + stats.pendingWallet, color: '#f59e0b' },
      { name: 'Assigned', value: stats.assigned, color: '#8b5cf6' },
      { name: 'In Progress', value: stats.inProgress, color: '#3b82f6' },
      { name: 'On Hold', value: stats.onHold, color: '#64748b' },
      { name: 'Completed', value: stats.completed, color: '#10b981' },
      { name: 'Escalated', value: stats.escalated, color: '#ea580c' },
      { name: 'Failed/Cancelled', value: stats.failed + stats.cancelled + stats.rejected, color: '#ef4444' }
    ];

    return res.status(200).json({ success: true, stats, chartData, views });
  } catch (error) {
    console.error('[MyJobs getStats]', error);
    return res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
};

/**
 * GET filter metadata (distinct services, cities, batches from company jobs)
 */
const getFilterMeta = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const companyOid = new mongoose.Types.ObjectId(companyId);

    const [services, cities, batches] = await Promise.all([
      B2BJob.distinct('service', { companyId: companyOid }),
      B2BJob.distinct('city', { companyId: companyOid }),
      B2BBatch.find({ companyId: companyOid })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('batchId fileName createdAt status')
        .lean()
    ]);

    // Prefer ServiceConfig catalog when available for services list
    let catalogServices = [];
    try {
      const ServiceConfig = require('../../models/ServiceConfig');
      const configs = await ServiceConfig.find({ isActive: { $ne: false } })
        .select('categoryName categoryCode')
        .lean();
      catalogServices = configs.map((c) => c.categoryName || c.categoryCode).filter(Boolean);
    } catch (_) { /* optional */ }

    const serviceSet = new Set([...(catalogServices || []), ...(services || [])].filter(Boolean));

    return res.status(200).json({
      success: true,
      data: {
        services: Array.from(serviceSet).sort(),
        cities: (cities || []).filter(Boolean).sort(),
        batches: batches || [],
        statuses: [
          'pending', 'pending_wallet', 'searching_engineer', 'assigned', 'in_progress',
          'on_hold', 'completed', 'cancelled', 'rejected', 'escalated', 'failed', 'closed'
        ]
      }
    });
  } catch (error) {
    console.error('[MyJobs getFilterMeta]', error);
    return res.status(500).json({ success: false, message: 'Failed to load filter metadata' });
  }
};

/**
 * GET recent job activity feed for company
 */
const getRecentActivity = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);
    const JobHistory = require('../../models/JobHistory');

    const companyJobs = await B2BJob.find({ companyId }).select('_id jobId').lean();
    const jobMap = new Map(companyJobs.map((j) => [String(j._id), j.jobId]));
    const jobIds = companyJobs.map((j) => j._id);

    if (!jobIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const history = await JobHistory.find({ jobId: { $in: jobIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const data = history.map((h) => ({
      id: h._id,
      jobId: jobMap.get(String(h.jobId)) || h.jobId,
      status: h.status,
      remark: h.remark || '',
      role: h.role,
      createdAt: h.createdAt
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[MyJobs getRecentActivity]', error);
    return res.status(500).json({ success: false, message: 'Failed to load recent activity' });
  }
};

/**
 * GET Jobs (List with pagination and filters)
 */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'preferredDate', 'priority', 'jobId', 'customerName', 'city', 'service', 'charge', 'slaDueAt'];

/**
 * The company's job filter from query params — shared by the list and the
 * CSV export so an export is always exactly what the screen showed.
 */
const buildJobsFilter = (companyId, q = {}) => {
  const { viewFilter } = require('../../services/b2bJobViews');
  const and = [];

  const view = viewFilter(q.view);
  if (view) and.push(view);

  const search = typeof q.search === 'string' ? q.search.trim().slice(0, 100) : '';
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    and.push({
      $or: [
        { jobId: rx }, { customerName: rx }, { phone: rx }, { assignedToName: rx },
        { assignedVendorName: rx }, { service: rx }, { address: rx }, { customerRef: rx }
      ]
    });
  }

  const filter = { companyId };
  // Legacy status filter — comma-separated statuses (e.g. failed,cancelled,rejected)
  if (q.status && q.status !== 'all') {
    const statuses = String(q.status).split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean);
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = { $in: statuses };
  }
  if (q.service && q.service !== 'all') filter.service = String(q.service);
  if (q.city && q.city !== 'all') filter.city = String(q.city);
  if (q.priority && q.priority !== 'all') filter.priority = String(q.priority);
  if (q.paymentStatus && q.paymentStatus !== 'all') filter.paymentStatus = String(q.paymentStatus);
  if (q.batchId && q.batchId !== 'all' && mongoose.Types.ObjectId.isValid(q.batchId)) filter.batchId = q.batchId;
  if (q.allocationStage && q.allocationStage !== 'all') filter.allocationStage = String(q.allocationStage);
  if (q.assignmentType && q.assignmentType !== 'all') filter.assignmentType = String(q.assignmentType);

  if (q.startDate || q.endDate) {
    filter.createdAt = {};
    if (q.startDate && !isNaN(Date.parse(q.startDate))) filter.createdAt.$gte = new Date(q.startDate);
    if (q.endDate && !isNaN(Date.parse(q.endDate))) {
      filter.createdAt.$lte = new Date(new Date(q.endDate).setHours(23, 59, 59, 999));
    }
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  }

  if (and.length) filter.$and = and;
  return filter;
};

const getJobs = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const filter = buildJobsFilter(companyId, req.query);

    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const sortField = SORTABLE_FIELDS.includes(req.query.sort) ? req.query.sort : 'createdAt';
    const sortParams = { [sortField]: req.query.order === 'asc' ? 1 : -1, _id: -1 };

    const { viewOfJob } = require('../../services/b2bJobViews');
    const [jobs, total] = await Promise.all([
      B2BJob.find(filter)
        .populate('batchId', 'batchId fileName')
        .populate('assignedTo', 'firstName lastName profilePic averageRating')
        .sort(sortParams)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      B2BJob.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: jobs.map((j) => ({
        ...j,
        view: viewOfJob(j),
        slaBreached: Array.isArray(j.sla?.breaches) && j.sla.breaches.length > 0
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('[MyJobs getJobs]', error);
    return res.status(500).json({ success: false, message: 'Server error fetching jobs' });
  }
};

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

/**
 * GET Export Jobs (CSV) — same filters as the list, including the view.
 */
const exportJobs = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const filter = buildJobsFilter(companyId, req.query);
    const { viewOfJob, VIEW_LABELS } = require('../../services/b2bJobViews');

    const EXPORT_CAP = 50000;
    const jobs = await B2BJob.find(filter).sort({ createdAt: -1 }).limit(EXPORT_CAP).lean();

    const header = ['Job ID', 'Customer Ref', 'Customer Name', 'Phone', 'Service', 'Address', 'City', 'Pincode',
      'Priority', 'View', 'Lifecycle Status', 'Status', 'Assignment', 'Vendor', 'Engineer',
      'Payment Status', 'Wallet Status', 'Amount', 'SLA Breaches', 'Created At', 'Updated At'];
    const lines = [header.map(csvCell).join(',')];
    for (const j of jobs) {
      lines.push([
        j.jobId, j.customerRef, j.customerName, j.phone, j.service, j.address, j.city, j.pincode,
        j.priority, VIEW_LABELS[viewOfJob(j)], j.lifecycleStatus, j.status, j.assignmentType,
        j.assignedVendorName, j.assignedToName, j.paymentStatus, j.walletStatus,
        j.pricing?.totalAmount || j.charge || 0,
        (j.sla?.breaches || []).map((b) => b.metric).join(' | '),
        j.createdAt ? new Date(j.createdAt).toISOString() : '',
        j.updatedAt ? new Date(j.updatedAt).toISOString() : ''
      ].map(csvCell).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`WBI_Jobs_Export_${Date.now()}.csv`);
    return res.send('﻿' + lines.join('\n'));

  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('[MyJobs exportJobs]', error);
    return res.status(500).json({ success: false, message: 'Failed to export' });
  }
};

/**
 * GET Job Details
 */
const getJobDetails = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const job = await B2BJob.findOne({ _id: req.params.id, companyId })
      .populate('batchId')
      .populate('assignedTo');
    
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    
    return res.status(200).json({ success: true, data: job });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * PATCH Update Job — company-editable job details only.
 * Status, assignment, money and routing fields are never writable here: they
 * change only through the lifecycle/assignment services.
 */
const B2B_EDITABLE_FIELDS = ['customerName', 'phone', 'email', 'preferredDate', 'preferredTime', 'priority', 'deviceId', 'siteId'];
const B2B_EDITABLE_BEFORE_ASSIGNMENT = ['address', 'city', 'state', 'pincode'];

const updateJob = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const existing = await B2BJob.findOne({ _id: req.params.id, companyId });
    if (!existing) return res.status(404).json({ success: false, message: 'Job not found' });

    if (existing.requiresNewJob || existing.reopenBlocked) {
      return res.status(400).json({
        success: false,
        message: 'This job is permanently closed (e.g. Spare Parts). Create a fresh job ticket.'
      });
    }

    const { lifecycleOf } = require('../../services/jobLifecycle.service');
    const { LIFECYCLE: S, TERMINAL_STATES } = require('../../services/jobStateMachine');
    const state = lifecycleOf(existing);
    if (TERMINAL_STATES.includes(state)) {
      return res.status(409).json({ success: false, message: `Job is ${state} and can no longer be edited` });
    }

    const body = req.body || {};
    const allowed = [...B2B_EDITABLE_FIELDS];
    const unassigned = !existing.assignedTo && [S.CREATED, S.VALIDATED, S.ROUTED, S.PENDING_ASSIGNMENT, S.UNASSIGNED, S.ON_HOLD].includes(state);
    if (unassigned) allowed.push(...B2B_EDITABLE_BEFORE_ASSIGNMENT);

    const rejected = Object.keys(body).filter((k) => !allowed.includes(k));
    if (rejected.length) {
      return res.status(400).json({
        success: false,
        message: `These fields cannot be changed here: ${rejected.join(', ')}` +
          (rejected.includes('status') ? '. Use cancel / approve-work to change a job\'s status.' : '')
      });
    }

    const update = {};
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    if (update.priority && !['Low', 'Medium', 'High'].includes(update.priority)) {
      return res.status(400).json({ success: false, message: 'priority must be Low, Medium or High' });
    }
    if (update.pincode !== undefined && update.pincode !== '' && !/^[1-9][0-9]{5}$/.test(String(update.pincode))) {
      return res.status(400).json({ success: false, message: 'pincode must be a valid 6-digit pincode' });
    }

    Object.assign(existing, update);
    await existing.save();

    const { recordJobEvent } = require('../../services/jobLifecycle.service');
    await recordJobEvent({
      jobId: existing._id,
      event: 'JOB_DETAILS_UPDATED',
      actor: { id: req.user.id, role: 'company' },
      remark: `Updated: ${Object.keys(update).join(', ') || 'nothing'}`,
      meta: { fields: Object.keys(update) }
    });

    return res.status(200).json({ success: true, data: existing });
  } catch (error) {
    console.error('[b2b updateJob]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * DELETE Cancel Job — allowed only before the engineer is on the way
 * (state machine: CANCELLED is reachable from ACCEPTED and earlier).
 */
const cancelJob = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const job = await B2BJob.findOne({ _id: req.params.id, companyId }).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const { transitionJob } = require('../../services/jobLifecycle.service');
    const { LIFECYCLE: S } = require('../../services/jobStateMachine');
    const actor = { id: req.user.id, role: 'company' };
    const reason = String(req.body?.reason || 'Cancelled by company').slice(0, 300);
    try {
      await transitionJob({
        jobId: job._id,
        to: S.CANCELLED,
        actor,
        reason,
        event: 'JOB_CANCELLED',
        patch: {
          allocationStage: 'not_started',
          allocationReason: reason,
          allocationUpdatedAt: new Date()
        },
        extraRooms: (job.notifiedVendors || []).map((v) => `vendor:${v}`)
      });
    } catch (err) {
      if (err.code === 'INVALID_TRANSITION') {
        return res.status(409).json({
          success: false,
          code: err.code,
          message: `This job is ${err.from} and can no longer be cancelled. Raise a support ticket to stop it.`
        });
      }
      throw err;
    }

    const { closeAssignmentForJob } = require('../../services/jobAssignment.service');
    await closeAssignmentForJob({ jobId: job._id, outcome: 'cancelled', actor, reason }).catch(() => {});

    // Stop the allocation engine and return any escrowed funds to the wallet.
    const Opportunity = require('../../models/Opportunity');
    const openOpportunities = await Opportunity.find({
      'assignment.b2bJobId': job._id,
      status: 'open'
    }).select('_id');
    for (const opp of openOpportunities) {
      try {
        const { cancelFreelancerPoolTimeout } = require('../../services/projectAssignmentEngine.service');
        await cancelFreelancerPoolTimeout(opp._id);
      } catch (_) {
        /* non-blocking */
      }
      await Opportunity.updateOne(
        { _id: opp._id },
        { $set: { status: 'cancelled', 'assignment.phase': 'expired' } }
      );
    }

    let refund = null;
    try {
      const { refundB2BJobEscrow } = require('../../services/escrowReleaseEngine.service');
      refund = await refundB2BJobEscrow({ jobId: job._id, reason: 'cancelled_by_company' });
    } catch (refundErr) {
      console.error('[MyJobs cancelJob] escrow refund failed:', refundErr.message);
    }

    await B2BJobStatusLog.create({
      jobId: job._id,
      status: 'cancelled',
      updatedBy: req.user.id
    });

    return res.status(200).json({
      success: true,
      message: refund?.ok
        ? 'Job cancelled and escrow returned to your wallet'
        : 'Job cancelled successfully'
    });
  } catch (error) {
    console.error('[b2b cancelJob]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
/**
 * POST Retry allocation for a job that stalled or was escalated to admin.
 */
const rematchJob = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const job = await B2BJob.findOne({ _id: req.params.id, companyId }).select('_id');
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const { rematchB2BJob } = require('../../services/b2bJobRematch.service');
    const result = await rematchB2BJob(job._id, {
      actorRole: 'b2b',
      actorId: req.user.id,
      note: String(req.body?.note || '').slice(0, 200)
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Matching restarted — engineers and vendors are being contacted again',
      data: { attempt: result.attempt }
    });
  } catch (error) {
    console.error('[MyJobs rematchJob]', error);
    return res.status(500).json({ success: false, message: 'Failed to restart matching' });
  }
};

/**
 * GET Job Timeline
 */
const getJobTimeline = async (req, res) => {
  try {
    // Only the owning company may read a job's history.
    const companyId = req.companyId || req.user.companyId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !(await B2BJob.exists({ _id: req.params.id, companyId }))) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const logs = await B2BJobStatusLog.find({ jobId: req.params.id }).sort({ timestamp: -1 }).limit(500);
    return res.status(200).json({ success: true, data: logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST Reassign Engineer
 */
const reassignEngineer = async (req, res) => {
  try {
    const { jobId, engineerId, reason } = req.body || {};
    const companyId = req.companyId || req.user.companyId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(jobId) || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'Valid jobId and engineerId are required' });
    }
    const job = await B2BJob.findOne({ _id: jobId, companyId }).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.requiresNewJob || job.reopenBlocked) {
      return res.status(400).json({
        success: false,
        message: 'This job is permanently closed. Create a fresh job ticket instead of reassigning.'
      });
    }
    // A vendor that holds a job chooses its own engineers; the company picks
    // the vendor (routing), not the vendor's staff.
    if (job.assignedVendorId) {
      return res.status(403).json({
        success: false,
        message: 'A vendor is handling this job and assigns its own engineers. Contact support to change the vendor.'
      });
    }

    const actor = { id: req.user.id, role: 'company' };
    const svc = require('../../services/jobAssignment.service');
    const result = job.assignedTo
      ? await svc.reassignEngineer({ jobId: job._id, newEngineerId: engineerId, actor, reason: reason || 'Reassigned by company' })
      : await svc.assignEngineer({ jobId: job._id, engineerId, actor, reason: reason || 'Assigned by company', routingMode: 'manual' });

    await B2BJobStatusLog.create({ jobId: job._id, status: 'assigned', updatedBy: req.user.id });
    return res.status(200).json({ success: true, message: 'Engineer reassigned', data: result.job, eligibility: result.eligibility });
  } catch (error) {
    const { sendJobError } = require('../../services/jobScope.service');
    return sendJobError(res, error, 'Failed to reassign engineer');
  }
};

/**
 * GET Live Tracking — the assigned engineer's last reported position, the
 * site, and the straight-line distance / ETA between them. Nothing is
 * estimated when there is no position: the fields are null and say why.
 */
const LOCATION_STALE_MINUTES = 10;
const CITY_SPEED_KMH = 25;

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getLiveTracking = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid job id' });
    }
    const job = await B2BJob.findOne({ _id: req.params.id, companyId })
      .select('jobId address city coordinates assignedTo assignedToName lifecycleStatus status trackingStatus eta')
      .populate('assignedTo', 'name firstName lastName phone profilePhoto profilePic')
      .lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const coords = job.coordinates?.coordinates;
    const destination = Array.isArray(coords) && coords.length === 2 && (coords[0] || coords[1])
      ? { lat: coords[1], lng: coords[0], address: job.address, city: job.city }
      : null;

    let engineerLocation = null;
    let reason = null;
    if (!job.assignedTo) {
      reason = 'No engineer is assigned yet.';
    } else {
      const EngineerLocationSession = require('../../models/EngineerLocationSession');
      const session = await EngineerLocationSession.findOne({ engineerId: job.assignedTo._id }).lean();
      const c = session?.currentLocation?.coordinates;
      if (Array.isArray(c) && c.length === 2) {
        const updatedAt = session.lastUpdatedAt || session.updatedAt || null;
        const ageMinutes = updatedAt ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000) : null;
        engineerLocation = {
          lat: c[1],
          lng: c[0],
          updatedAt,
          ageMinutes,
          stale: ageMinutes === null || ageMinutes > LOCATION_STALE_MINUTES,
          online: Boolean(session.isOnline),
          heading: session.heading ?? null,
          speed: session.speed ?? null
        };
      } else {
        reason = 'The engineer has not shared a location yet.';
      }
    }

    let distanceKm = null;
    let etaMinutes = null;
    if (engineerLocation && destination) {
      distanceKm = Math.round(haversineKm(engineerLocation.lat, engineerLocation.lng, destination.lat, destination.lng) * 10) / 10;
      etaMinutes = distanceKm <= 0.05 ? 0 : Math.ceil((distanceKm / CITY_SPEED_KMH) * 60);
    } else if (engineerLocation && !destination) {
      reason = 'The job site has no map coordinates.';
    }

    const { viewOfJob } = require('../../services/b2bJobViews');
    const eng = job.assignedTo;
    return res.status(200).json({
      success: true,
      data: {
        jobId: job.jobId,
        view: viewOfJob(job),
        lifecycleStatus: job.lifecycleStatus,
        engineer: eng ? {
          _id: eng._id,
          name: eng.name || [eng.firstName, eng.lastName].filter(Boolean).join(' ') || job.assignedToName,
          phone: eng.phone || null,
          photo: eng.profilePhoto || eng.profilePic || null
        } : null,
        engineerLocation,
        destination,
        distanceKm,
        etaMinutes,
        // Straight-line distance at average city speed; road routing lives on the Live Map.
        etaBasis: distanceKm !== null ? `straight-line distance at ${CITY_SPEED_KMH} km/h` : null,
        // Legacy display strings for older clients.
        eta: etaMinutes !== null ? `${etaMinutes} mins` : null,
        distance: distanceKm !== null ? `${distanceKm} km` : null,
        reason
      }
    });
  } catch (error) {
    console.error('[MyJobs getLiveTracking]', error);
    return res.status(500).json({ success: false, message: 'Failed to load live tracking' });
  }
};

/**
 * GET Job Logs
 */
const getJobLogs = async (req, res) => {
  try {
    // Only the owning company may read a job's history.
    const companyId = req.companyId || req.user.companyId || req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !(await B2BJob.exists({ _id: req.params.id, companyId }))) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const logs = await B2BJobStatusLog.find({ jobId: req.params.id }).sort({ timestamp: -1 }).limit(500);
    return res.status(200).json({ success: true, data: logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST Submit Engineer Rating
 */
const submitEngineerRating = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { behavior, slaAdherence, toolsCarried, ethics, reviewText } = req.body;
    const companyId = req.companyId || req.user.companyId || req.user.id;

    const job = await B2BJob.findOne({ _id: jobId, companyId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (!job.assignedTo) return res.status(400).json({ success: false, message: 'No engineer was assigned' });

    const existingRating = await EngineerRating.findOne({ jobId, companyId });
    if (existingRating) {
      return res.status(400).json({ success: false, message: 'You have already rated this job' });
    }

    const averageRating = (behavior + slaAdherence + toolsCarried + ethics) / 4;

    const rating = await EngineerRating.create({
      companyId,
      engineerId: job.assignedTo,
      jobId,
      metrics: { behavior, slaAdherence, toolsCarried, ethics },
      averageRating,
      reviewText
    });

    res.status(200).json({ success: true, message: 'Rating submitted successfully', data: rating });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to submit rating' });
  }
};

/**
 * GET Pending Quote Approvals for this company
 * GET /api/b2b/jobs/quotes/pending
 */
const getPendingQuotes = async (req, res) => {
  try {
    const rawId2 = req.companyId || req.user.companyId || req.user.id;
    const companyId = new mongoose.Types.ObjectId(rawId2);
    const quotes = await QuoteApproval.find({ companyId, status: 'pending' })
      .populate('jobId', 'jobId service address city charge status preferredDate')
      .populate('engineerId', 'name phone profilePhoto')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: quotes });
  } catch (error) {
    console.error('[QuoteApproval] getPendingQuotes error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending quotes' });
  }
};

/**
 * POST Approve a modified quote — activates the job
 * POST /api/b2b/jobs/quotes/:quoteId/approve
 */
const approveQuote = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const { quoteId } = req.params;
    const { clientRemarks } = req.body;

    if (!mongoose.Types.ObjectId.isValid(quoteId)) {
      return res.status(400).json({ success: false, message: 'Invalid quote ID' });
    }

    const quote = await QuoteApproval.findOne({ _id: quoteId, companyId, status: 'pending' });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Pending quote not found' });
    }

    // 1. Deduct the new approved amount from wallet
    const wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found. Please top-up first.' });
    }

    const amountDiff = quote.proposedAmount - quote.originalAmount;

    if (amountDiff > 0 && wallet.balance < amountDiff) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Need ₹${amountDiff} more for this revised quote.`,
        required: amountDiff,
        available: wallet.balance
      });
    }

    // 2. Update quote status
    quote.status = 'approved';
    quote.clientRemarks = clientRemarks || 'Approved';
    quote.decidedAt = new Date();
    await quote.save();

    // 3. Update the job charge and activate it
    const job = await B2BJob.findById(quote.jobId);
    if (job) {
      if (job.requiresNewJob || job.reopenBlocked) {
        return res.status(400).json({
          success: false,
          message: 'Associated job is permanently closed. Create a fresh job instead.'
        });
      }

      const prevCharge = job.charge;
      job.charge = quote.proposedAmount;
      job.status = 'searching_engineer'; // Activate job
      job.quoteApprovalId = quote._id;
      job.currentWave = 0;
      await job.save();

      // 4. Move the difference through the ledger: hold more when the quote
      //    went up, hand the difference back when it went down.
      if (amountDiff !== 0) {
        const walletLedger = require('../../services/b2bWalletLedger.service');
        const note = `Quote adjustment for job ${job.jobId} (${amountDiff > 0 ? '+' : ''}${amountDiff})`;
        try {
          if (amountDiff > 0) {
            await walletLedger.reserve({
              companyId,
              amount: amountDiff,
              reservationId: `JOB-${job._id}`,
              jobId: job._id,
              idempotencyKey: `quote-adjust:${quote._id}`,
              remark: note,
              actor: { actorId: actorId(req) || null, role: 'company' }
            });
          } else {
            await walletLedger.release({
              companyId,
              amount: Math.abs(amountDiff),
              reservationId: `JOB-${job._id}`,
              jobId: job._id,
              idempotencyKey: `quote-adjust:${quote._id}`,
              remark: note,
              actor: { actorId: actorId(req) || null, role: 'company' }
            });
          }
        } catch (walletErr) {
          if (walletErr.name === 'WalletError') {
            return res.status(walletErr.status || 400).json({
              success: false,
              message: walletErr.message,
              code: walletErr.code,
              ...walletErr.details
            });
          }
          throw walletErr;
        }
      }

      try {
        const { queueJobMatching } = require('../../services/b2bMatchingService');
        await queueJobMatching(job._id, req.app);
      } catch (matchErr) {
        console.error('[QuoteApproval] Matching queue failed:', matchErr.message);
      }
    }

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('quote_approved', {
        targets: { engineerId: quote.engineerId },
        data: {
          quoteId: quote._id,
          jobId: quote.jobId,
          proposedAmount: quote.proposedAmount,
          message: `Client approved your revised quote of ₹${Number(quote.proposedAmount).toLocaleString('en-IN')}.`
        },
        actorId: req.user?.id || req.user?._id
      });
    } catch (_) { /* non-blocking */ }

    return res.status(200).json({
      success: true,
      message: 'Quote approved. Job is now active in the queue.',
      data: quote
    });
  } catch (error) {
    console.error('[QuoteApproval] approveQuote error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve quote' });
  }
};

/**
 * POST Reject a modified quote — cancels the job
 * POST /api/b2b/jobs/quotes/:quoteId/reject
 */
const rejectQuote = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const { quoteId } = req.params;
    const { clientRemarks } = req.body;

    if (!mongoose.Types.ObjectId.isValid(quoteId)) {
      return res.status(400).json({ success: false, message: 'Invalid quote ID' });
    }

    const quote = await QuoteApproval.findOne({ _id: quoteId, companyId, status: 'pending' });
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Pending quote not found' });
    }

    // Update quote
    quote.status = 'rejected';
    quote.clientRemarks = clientRemarks || 'Rejected by client';
    quote.decidedAt = new Date();
    await quote.save();

    // Cancel the associated job
    const job = await B2BJob.findById(quote.jobId);
    if (job) {
      job.status = 'cancelled';
      job.quoteApprovalId = quote._id;
      await job.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Quote rejected. Job has been cancelled.',
      data: quote
    });
  } catch (error) {
    console.error('[QuoteApproval] rejectQuote error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reject quote' });
  }
};

const approveJobWork = async (req, res) => {
  try {
    const rawId = req.companyId || req.user.companyId || req.user.id;
    const companyId = new mongoose.Types.ObjectId(rawId);
    const { approved = true } = req.body || {};
    const { approveB2BJobWork } = require('../../services/enterpriseB2BOrchestrator.service');
    const result = await approveB2BJobWork(req.params.id, companyId, { party: 'b2b', approved });
    if (!result.ok && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[approveJobWork]', error);
    res.status(500).json({ success: false, message: 'Failed to record approval' });
  }
};

const approveProjectMilestoneB2b = async (req, res) => {
  try {
    const rawId = req.companyId || req.user.companyId || req.user.id;
    const companyId = new mongoose.Types.ObjectId(rawId);
    const { projectId, milestoneId } = req.params;
    const { approved = true } = req.body || {};

    const EnterpriseProjectFlow = require('../../models/EnterpriseProjectFlow');
    const flow = await EnterpriseProjectFlow.findOne({
      vendorOpsProjectId: projectId,
      b2bCompanyId: companyId
    }).lean();
    if (!flow) {
      return res.status(404).json({ success: false, message: 'Project not linked to your company' });
    }

    const { onMilestoneB2bSignoff } = require('../../services/enterpriseB2BOrchestrator.service');
    const result = await onMilestoneB2bSignoff({
      projectId,
      milestoneId,
      approved: approved !== false
    });
    if (result?.pending || result?.code === 'APPROVAL_PENDING') {
      return res.status(200).json({ success: true, pending: true, data: result });
    }
    if (result?.ok === false && result.status) {
      return res.status(result.status).json({ success: false, message: result.message, data: result });
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[approveProjectMilestoneB2b]', error);
    res.status(500).json({ success: false, message: 'Failed to record milestone approval' });
  }
};

const getJobEnterpriseFlow = async (req, res) => {
  try {
    const rawId = req.companyId || req.user.companyId || req.user.id;
    const companyId = new mongoose.Types.ObjectId(rawId);
    const job = await B2BJob.findOne({ _id: req.params.id, companyId }).lean();
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    const { getFlowStatus } = require('../../services/enterpriseB2BOrchestrator.service');
    const flow = await getFlowStatus({ b2bJobId: job._id });

    let pendingB2bMilestones = [];
    if (flow?.vendorOpsProjectId) {
      const VendorOpsMilestone = require('../../models/VendorOpsMilestone');
      pendingB2bMilestones = await VendorOpsMilestone.find({
        projectId: flow.vendorOpsProjectId,
        b2bSignoff: 'pending'
      })
        .select('_id title milestoneCode sequence qaStatus customerSignoff b2bSignoff status')
        .sort({ sequence: 1 })
        .lean();
    }

    res.status(200).json({
      success: true,
      data: {
        flow,
        jobStatus: job.status,
        pendingB2bMilestones,
        vendorOpsProjectId: flow?.vendorOpsProjectId || null
      }
    });
  } catch (error) {
    console.error('[getJobEnterpriseFlow]', error);
    res.status(500).json({ success: false, message: 'Failed to load enterprise flow' });
  }
};

module.exports = {
  getStats,
  getFilterMeta,
  getRecentActivity,
  getJobs,
  exportJobs,
  getJobDetails,
  approveJobWork,
  approveProjectMilestoneB2b,
  getJobEnterpriseFlow,
  updateJob,
  cancelJob,
  rematchJob,
  getJobTimeline,
  reassignEngineer,
  getLiveTracking,
  getJobLogs,
  submitEngineerRating,
  getPendingQuotes,
  approveQuote,
  rejectQuote
};
