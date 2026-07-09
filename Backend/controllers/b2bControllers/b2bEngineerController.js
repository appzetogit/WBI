const mongoose = require('mongoose');
const Engineer = require('../../models/Engineer');
const B2BJob = require('../../models/B2BJob');
const B2BEngineerAssignment = require('../../models/B2BEngineerAssignment');
const B2BJobStatusLog = require('../../models/B2BJobStatusLog');
const { WORKER_STATUS } = require('../../utils/constants');

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
      status: { $in: ['in_progress', 'engineer_on_way', 'assigned'] }
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

    return res.status(200).json({ success: true, stats });
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
      const searchRegex = { $regex: search, $options: 'i' };
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
    if (city && city !== 'all') filter['address.city'] = { $regex: city, $options: 'i' };
    if (rating && rating !== 'all') filter.rating = { $gte: parseFloat(rating) };
    if (experience && experience !== 'all') filter.experienceLevel = { $regex: experience, $options: 'i' };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
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
        status: { $in: ['assigned', 'searching_engineer', 'in_progress', 'engineer_on_way'] }
      }).select('jobId service city status').lean();

      // Map DB status to frontend expected status
      let frontendStatus = 'offline';
      if (eng.status === 'ONLINE' || eng.status === 'active') {
        frontendStatus = 'available';
      } else if (eng.status === 'BUSY') {
        if (currentJob) {
          if (currentJob.status === 'engineer_on_way') frontendStatus = 'on_the_way';
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
      status: { $in: ['assigned', 'in_progress'] }
    }).select('jobId service status city address charge').lean();

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
      status: { $in: ['assigned', 'in_progress'] }
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

    const jobs = await B2BJob.find({
      companyId,
      assignedTo: engId
    }).lean();

    const completed = jobs.filter(j => j.status === 'completed');
    const failed = jobs.filter(j => j.status === 'failed' || j.status === 'cancelled');
    const completedThisMonth = completed.filter(j => new Date(j.createdAt) >= currentMonthStart);

    // Mock SLAs for UI
    const acceptanceRate = '92%';
    const completionRate = '89%';
    const avgResponseTime = '12 mins';
    
    return res.status(200).json({
      success: true,
      data: {
        totalAssigned: jobs.length,
        completed: completed.length,
        completedThisMonth: completedThisMonth.length,
        failed: failed.length,
        acceptanceRate,
        completionRate,
        avgResponseTime
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
