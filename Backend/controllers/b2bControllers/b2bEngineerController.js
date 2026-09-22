const mongoose = require('mongoose');
const Engineer = require('../../models/Engineer');
const B2BJob = require('../../models/B2BJob');
const B2BEngineerAssignment = require('../../models/B2BEngineerAssignment');
const B2BJobStatusLog = require('../../models/B2BJobStatusLog');
const { WORKER_STATUS } = require('../../utils/constants');
const { viewFilter } = require('../../services/b2bJobViews');

/** A job an engineer is holding right now (dispatched, en route or on site). */
const activeJobClause = () => viewFilter('active');
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to get authoritative B2B companyId from request
const getCompanyId = (req) => req.companyId || req.user.companyId || req.user.id;

// Helper to get distinct engineer IDs assigned to a company's jobs
const getCompanyEngineerIds = async (companyId) => {
  const jobEngineers = await B2BJob.distinct('assignedTo', { companyId, assignedTo: { $ne: null } });
  const assignmentEngineers = await B2BEngineerAssignment.distinct('engineerId', { companyId });
  
  // Merge and deduplicate
  const allIds = [...jobEngineers, ...assignmentEngineers].map(id => id.toString());
  const validIds = allIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  return [...new Set(validIds)].map(id => new mongoose.Types.ObjectId(id));
};

/**
 * GET Stats (KPIs)
 */
const getStats = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const engineerIds = await getCompanyEngineerIds(companyId);
    
    const totalEngineers = engineerIds.length;
    const available = await Engineer.countDocuments({ _id: { $in: engineerIds }, status: { $in: ['ONLINE', 'active'] } });
    const busy = await Engineer.countDocuments({ _id: { $in: engineerIds }, status: 'BUSY' });
    
    // On job means they have an active B2B job in progress or on the way
    const activeJobs = await B2BJob.find({
      companyId,
      assignedTo: { $in: engineerIds },
      ...activeJobClause()
    }).distinct('assignedTo');
    const onJob = activeJobs.length;

    const offline = await Engineer.countDocuments({ _id: { $in: engineerIds }, status: 'OFFLINE' });
    const onLeave = await Engineer.countDocuments({ _id: { $in: engineerIds }, status: { $in: ['suspended', 'inactive'] } });
    
    // Average rating
    const ratingResult = await Engineer.aggregate([
      { $match: { _id: { $in: engineerIds } } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);
    const averageRating = ratingResult.length > 0 ? Number(ratingResult[0].avg.toFixed(1)) : 0.0;

    const stats = {
      totalEngineers,
      available,
      busy,
      onJob,
      offline,
      onLeave,
      averageRating
    };

    // Filter options come from the engineers actually on this company's jobs.
    const [skills, cities] = await Promise.all([
      Engineer.distinct('serviceCategories', { _id: { $in: engineerIds } }),
      Engineer.distinct('address.city', { _id: { $in: engineerIds } })
    ]);

    // This month's performance on this company's jobs — real figures only.
    const cOid = new mongoose.Types.ObjectId(String(companyId));
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    const resolved = viewFilter('resolved');

    const [monthAgg, dailyAgg, assignmentAgg, newThisMonth] = await Promise.all([
      B2BJob.aggregate([
        { $match: { companyId: cOid, assignedTo: { $ne: null }, updatedAt: { $gte: monthStart }, ...resolved } },
        {
          $group: {
            _id: null,
            completed: { $sum: 1 },
            withSla: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$sla.resolutionDueAt', null] }, null] }, 1, 0] } },
            resolutionBreached: {
              $sum: {
                $cond: [{
                  $gt: [{ $size: { $filter: { input: { $ifNull: ['$sla.breaches', []] }, cond: { $eq: ['$$this.metric', 'resolution'] } } } }, 0]
                }, 1, 0]
              }
            }
          }
        }
      ]),
      B2BJob.aggregate([
        { $match: { companyId: cOid, assignedTo: { $ne: null }, updatedAt: { $gte: weekStart }, ...resolved } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt', timezone: 'Asia/Kolkata' } }, jobs: { $sum: 1 } } }
      ]),
      B2BJob.aggregate([
        { $match: { companyId: cOid } },
        { $project: { _id: 1 } },
        { $lookup: { from: 'jobassignments', localField: '_id', foreignField: 'jobId', as: 'a' } },
        { $unwind: '$a' },
        { $match: { 'a.assignedAt': { $gte: monthStart } } },
        { $group: { _id: '$a.status', count: { $sum: 1 } } }
      ]),
      B2BEngineerAssignment.distinct('engineerId', { companyId, createdAt: { $gte: monthStart } })
    ]);

    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      daily.push({
        day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        jobs: dailyAgg.find((r) => r._id === key)?.jobs || 0
      });
    }
    const byStatus = Object.fromEntries(assignmentAgg.map((r) => [r._id, r.count]));
    const accepted = (byStatus.accepted || 0) + (byStatus.completed || 0);
    const decided = accepted + (byStatus.rejected || 0) + (byStatus.expired || 0);
    const m = monthAgg[0] || {};

    return res.status(200).json({
      success: true,
      stats,
      filters: {
        skills: skills.filter(Boolean).sort(),
        cities: cities.filter(Boolean).sort()
      },
      performance: {
        completedThisMonth: m.completed || 0,
        daily,
        acceptanceRate: decided ? Math.round((accepted / decided) * 1000) / 10 : null,
        onTimeRate: m.withSla ? Math.round(((m.withSla - m.resolutionBreached) / m.withSla) * 1000) / 10 : null,
        newEngineersThisMonth: newThisMonth.length
      }
    });
  } catch (error) {
    console.error('[MyEngineers getStats]', error);
    return res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
};

/**
 * GET Engineers List
 */
const getEngineers = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const engineerIds = await getCompanyEngineerIds(companyId);
    
    const { 
      page = 1, limit = 10, search, status, skill, city, rating, experience
    } = req.query;

    const filter = { _id: { $in: engineerIds } };

    if (search) {
      const searchRegex = { $regex: escapeRegex(String(search).slice(0, 100)), $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { 'engineerDetails.qualification': searchRegex }
      ];
    }

    if (status && status !== 'all') {
      const normalized = status.toLowerCase();
      if (normalized === 'available') {
        filter.status = { $in: ['ONLINE', 'active'] };
      } else if (normalized === 'busy' || normalized === 'on job' || normalized === 'onjob') {
        filter.status = 'BUSY';
      } else if (normalized === 'offline') {
        filter.status = 'OFFLINE';
      } else if (normalized === 'on leave' || normalized === 'onleave' || normalized === 'suspended') {
        filter.status = { $in: ['suspended', 'inactive'] };
      }
    }
    
    if (skill && skill !== 'all') filter.serviceCategories = { $in: [skill] };
    if (city && city !== 'all') filter['address.city'] = { $regex: `^${escapeRegex(city)}$`, $options: 'i' };
    if (rating && rating !== 'all') filter.rating = { $gte: parseFloat(rating) };
    if (experience && experience !== 'all') filter.experienceLevel = { $regex: escapeRegex(experience), $options: 'i' };

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [engineers, total] = await Promise.all([
      Engineer.find(filter)
        .select('name phone status rating totalJobs completedJobs address profilePhoto experienceLevel serviceCategories primaryCategory updatedAt createdAt')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Engineer.countDocuments(filter)
    ]);

    // For each engineer, fetch their current active job for this company
    const enrichedEngineers = await Promise.all(engineers.map(async (eng) => {
      const currentJob = await B2BJob.findOne({
        companyId,
        assignedTo: eng._id,
        ...activeJobClause()
      }).select('jobId service city status lifecycleStatus').lean();

      // Map DB status to frontend expected status
      let frontendStatus = 'offline';
      if (eng.status === 'ONLINE' || eng.status === 'active') {
        frontendStatus = 'available';
      } else if (eng.status === 'BUSY') {
        if (currentJob) {
          if (currentJob.lifecycleStatus === 'EN_ROUTE' || currentJob.status === 'travelling') frontendStatus = 'on_the_way';
          else if (currentJob.status === 'in_progress') frontendStatus = 'in_progress';
          else frontendStatus = 'assigned';
        } else {
          frontendStatus = 'assigned';
        }
      } else if (eng.status === 'suspended' || eng.status === 'inactive') {
        frontendStatus = 'suspended';
      }

      return {
        ...eng,
        status: frontendStatus,
        currentJob: currentJob || null,
        lastActive: eng.updatedAt || eng.createdAt
      };
    }));

    return res.status(200).json({
      success: true,
      data: enrichedEngineers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[MyEngineers getEngineers]', error);
    return res.status(500).json({ success: false, message: 'Server error fetching engineers' });
  }
};

/**
 * GET Engineer Details
 */
const getEngineerDetails = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const engineerIds = await getCompanyEngineerIds(companyId);
    const engId = req.params.engineerId;
    
    if (!engineerIds.some(id => id.toString() === engId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this engineer' });
    }

    const engineer = await Engineer.findById(engId)
      .select('-password -bankDetails -fcmTokens -fcmTokenMobile')
      .lean();
      
    if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found' });

    // Fetch current job
    const currentJob = await B2BJob.findOne({
      companyId,
      assignedTo: engId,
      ...activeJobClause()
    }).select('jobId service status lifecycleStatus city address charge').lean();

    // Fetch jobs completed for this company
    const completedForCompany = await B2BJob.countDocuments({
      companyId,
      assignedTo: engId,
      status: 'completed'
    });

    return res.status(200).json({
      success: true,
      data: {
        ...engineer,
        currentJob,
        b2bCompletedJobs: completedForCompany
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Current Job
 */
const getCurrentJob = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const currentJob = await B2BJob.findOne({
      companyId,
      assignedTo: req.params.engineerId,
      ...activeJobClause()
    }).lean();
    return res.status(200).json({ success: true, data: currentJob });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Performance
 */
const getPerformance = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const engineerIds = await getCompanyEngineerIds(companyId);
    const engId = req.params.engineerId;
    
    if (!engineerIds.some(id => id.toString() === engId)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Performance specifically for this B2B company's jobs
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0,0,0,0);

    const { viewOfJob } = require('../../services/b2bJobViews');
    const JobAssignment = require('../../models/JobAssignment');

    const jobs = await B2BJob.find({ companyId, assignedTo: engId })
      .select('_id status lifecycleStatus assignedTo updatedAt sla')
      .lean();

    const views = jobs.map((j) => viewOfJob(j));
    const completed = jobs.filter((_, i) => views[i] === 'resolved');
    const failed = jobs.filter((_, i) => views[i] === 'failed' || views[i] === 'cancelled');
    const completedThisMonth = completed.filter((j) => new Date(j.updatedAt) >= currentMonthStart);

    // Acceptance and response time from this engineer's assignment rows on this company's jobs.
    const allCompanyJobIds = await B2BJob.distinct('_id', { companyId });
    const assignments = await JobAssignment.find({ engineerId: engId, jobId: { $in: allCompanyJobIds } })
      .select('status assignedAt acceptedAt')
      .lean();
    const accepted = assignments.filter((a) => a.acceptedAt || ['accepted', 'completed'].includes(a.status));
    const decided = assignments.filter((a) => a.acceptedAt || ['accepted', 'completed', 'rejected', 'expired'].includes(a.status));
    const responseMins = accepted
      .filter((a) => a.acceptedAt && a.assignedAt)
      .map((a) => (new Date(a.acceptedAt) - new Date(a.assignedAt)) / 60000);

    const withSla = completed.filter((j) => j.sla?.resolutionDueAt);
    const onTime = withSla.filter((j) => !(j.sla?.breaches || []).some((b) => b.metric === 'resolution'));
    const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : 'N/A');

    return res.status(200).json({
      success: true,
      data: {
        totalAssigned: jobs.length,
        completed: completed.length,
        completedThisMonth: completedThisMonth.length,
        failed: failed.length,
        acceptanceRate: pct(accepted.length, decided.length),
        // Resolved within the SLA resolution time, of resolved jobs that had one.
        completionRate: pct(onTime.length, withSla.length),
        avgResponseTime: responseMins.length
          ? `${Math.round(responseMins.reduce((a, b) => a + b, 0) / responseMins.length)} mins`
          : 'N/A'
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Timeline (Recent Activity across their assigned jobs for this company)
 */
const getTimeline = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const jobs = await B2BJob.find({ companyId, assignedTo: req.params.engineerId }).select('_id jobId').lean();
    const jobIds = jobs.map(j => j._id);
    
    const logs = await B2BJobStatusLog.find({ jobId: { $in: jobIds } })
      .populate('jobId', 'jobId')
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();
      
    return res.status(200).json({ success: true, data: logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Live Tracking (Map)
 */
const getLiveTracking = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const engineerIds = await getCompanyEngineerIds(companyId);
    
    // Get live coordinates of engineers who are currently active/busy/online
    const activeEngineers = await Engineer.find({
      _id: { $in: engineerIds },
      status: { $in: ['ONLINE', 'active', 'BUSY'] },
      location: { $exists: true, $ne: null }
    }).select('name location status').lean();

    // Map DB status to frontend expected status
    const mappedActiveEngineers = activeEngineers.map(eng => {
      let frontendStatus = 'offline';
      if (eng.status === 'ONLINE' || eng.status === 'active') {
        frontendStatus = 'available';
      } else if (eng.status === 'BUSY') {
        frontendStatus = 'assigned';
      }
      return {
        ...eng,
        status: frontendStatus
      };
    });

    return res.status(200).json({ success: true, data: mappedActiveEngineers });
  } catch (error) {
    console.error('[MyEngineers getLiveTracking]', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Export
 */
const exportEngineers = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const engineerIds = await getCompanyEngineerIds(companyId);
    const engineers = await Engineer.find({ _id: { $in: engineerIds } }).lean();
    
    let csv = 'Engineer ID,Name,Phone,Experience,City,Status,Rating\n';
    engineers.forEach(eng => {
      csv += `${eng._id},"${eng.name}",${eng.phone},"${eng.experienceLevel}","${eng.address?.city || ''}",${eng.status},${eng.rating}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`WBI_Assigned_Engineers_${Date.now()}.csv`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

module.exports = {
  getStats,
  getEngineers,
  getEngineerDetails,
  getCurrentJob,
  getPerformance,
  getTimeline,
  getLiveTracking,
  exportEngineers
};
