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

    const result = await B2BJob.aggregate(statsPipeline);
    const data = result[0] || {};

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

    return res.status(200).json({ success: true, stats, chartData });
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
const getJobs = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const { 
      page = 1, limit = 10, search, status, service, city, priority, 
      paymentStatus, startDate, endDate, batchId, sort = 'createdAt', order = 'desc' 
    } = req.query;

    const filter = { companyId };

    // Text search on multiple fields
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { jobId: searchRegex },
        { customerName: searchRegex },
        { phone: searchRegex },
        { assignedToName: searchRegex },
        { service: searchRegex },
        { address: searchRegex }
      ];
    }

    // Direct filters — support comma-separated statuses (e.g. failed,cancelled,rejected)
    if (status && status !== 'all') {
      const statuses = String(status).split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean);
      if (statuses.length === 1) filter.status = statuses[0];
      else if (statuses.length > 1) filter.status = { $in: statuses };
    }
    if (service && service !== 'all') filter.service = service;
    if (city && city !== 'all') filter.city = city;
    if (priority && priority !== 'all') filter.priority = priority;
    if (paymentStatus && paymentStatus !== 'all') filter.paymentStatus = paymentStatus;
    if (batchId && batchId !== 'all') filter.batchId = batchId;
    if (req.query.allocationStage && req.query.allocationStage !== 'all') {
      filter.allocationStage = req.query.allocationStage;
    }

    // Date range
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23,59,59,999))
      };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const sortParams = { [sort]: order === 'desc' ? -1 : 1 };

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
      data: jobs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('[MyJobs getJobs]', error);
    return res.status(500).json({ success: false, message: 'Server error fetching jobs' });
  }
};

/**
 * GET Export Jobs (CSV)
 */
const exportJobs = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const filter = { companyId };
    
    // Apply same filters as GET (simplified for brevity)
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

    const jobs = await B2BJob.find(filter).lean();
    
    // Build CSV
    let csv = 'Job ID,Customer Name,Phone,Service,City,Priority,Status,Payment Status,Charge,Created Date\n';
    jobs.forEach(j => {
      csv += `${j.jobId},"${j.customerName}",${j.phone},"${j.service}","${j.city}",${j.priority},${j.status},${j.paymentStatus},${j.charge},${j.createdAt}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`WBI_Jobs_Export_${Date.now()}.csv`);
    return res.send(csv);

  } catch (error) {
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
 * PATCH Update Job
 */
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

    const job = await B2BJob.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { $set: req.body },
      { new: true }
    );
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    
    // Log status change if status was updated
    if (req.body.status) {
      await B2BJobStatusLog.create({
        jobId: job._id,
        status: req.body.status,
        updatedBy: req.user.id
      });
      // Emit socket event globally
      const io = req.app.get('io');
      if (io) io.emit('job_updated', { jobId: job._id, status: req.body.status });
    }

    return res.status(200).json({ success: true, data: job });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * DELETE Cancel Job
 */
const cancelJob = async (req, res) => {
  try {
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const job = await B2BJob.findOne({ _id: req.params.id, companyId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (['completed', 'closed', 'cancelled'].includes(job.status)) {
      return res
        .status(400)
        .json({ success: false, message: `Job is already ${job.status} and cannot be cancelled` });
    }
    if (['in_progress'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: 'Work has already started. Raise a support ticket to stop this job.'
      });
    }

    job.status = 'cancelled';
    job.allocationStage = 'not_started';
    job.allocationReason = 'Cancelled by company';
    job.allocationUpdatedAt = new Date();
    await job.save();

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

    const io = req.app.get('io');
    if (io) io.emit('job_cancelled', { jobId: job._id });

    return res.status(200).json({
      success: true,
      message: refund?.ok
        ? 'Job cancelled and escrow returned to your wallet'
        : 'Job cancelled successfully'
    });
  } catch (error) {
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

    const io = req.app.get('io');
    if (io) io.emit('job_updated', { jobId: job._id, status: 'pending' });

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
    const logs = await B2BJobStatusLog.find({ jobId: req.params.id }).sort({ timestamp: -1 });
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
    const { jobId, engineerId } = req.body;
    const companyId = req.companyId || req.user.companyId || req.user.id;
    const job = await B2BJob.findOne({ _id: jobId, companyId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.requiresNewJob || job.reopenBlocked) {
      return res.status(400).json({
        success: false,
        message: 'This job is permanently closed. Create a fresh job ticket instead of reassigning.'
      });
    }

    const engineer = await Engineer.findById(engineerId);
    if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found' });

    job.assignedTo = engineer._id;
    job.assignedToName = engineer.name || `${engineer.firstName || ''} ${engineer.lastName || ''}`.trim();
    job.status = 'assigned';
    // Issue fresh start OTP on reassign
    const otp = (process.env.NODE_ENV !== 'production' && process.env.USE_DEFAULT_OTP === 'true')
      ? '123456'
      : Math.floor(100000 + Math.random() * 900000).toString();
    job.startOtp = otp;
    job.startOtpSentAt = new Date();
    job.startOtpVerifiedAt = null;
    job.startedAt = null;
    await job.save();

    await B2BJobStatusLog.create({
      jobId: job._id,
      status: 'assigned',
      updatedBy: req.user.id
    });

    const io = req.app.get('io');
    if (io) io.emit('engineer_assigned', { jobId: job._id, engineerId: engineer._id });

    return res.status(200).json({ success: true, message: 'Engineer reassigned', data: job });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Live Tracking Placeholder
 */
const getLiveTracking = async (req, res) => {
  // In production, this would query a Redis cache or a Location Tracking collection.
  // For now, we return mock live data assuming the engineer is moving towards the job location.
  try {
    const job = await B2BJob.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Mock response
    return res.status(200).json({
      success: true,
      data: {
        eta: '15 mins',
        distance: '4.2 km',
        engineerLocation: { lat: 19.0760, lng: 72.8777 },
        destination: job.coordinates?.coordinates || [72.8777, 19.0760] // lng, lat
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Job Logs
 */
const getJobLogs = async (req, res) => {
  try {
    const logs = await B2BJobStatusLog.find({ jobId: req.params.id }).sort({ timestamp: -1 });
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

      // 4. Deduct extra if proposed > original, or refund if less
      if (amountDiff !== 0) {
        wallet.balance -= amountDiff;
        await wallet.save();

        await B2BWalletTransaction.create({
          companyId,
          walletId: wallet._id,
          transactionId: `QA-${Date.now()}`,
          type: 'job_deduction',
          amount: -amountDiff,
          totalAmount: -amountDiff,
          status: 'success',
          remark: `Quote adjustment for Job ${job.jobId} (${amountDiff > 0 ? '+' : ''}${amountDiff})`
        });
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
