const mongoose = require('mongoose');
const B2BCompany = require('../../models/B2BCompany');
const B2BJob = require('../../models/B2BJob');
const Engineer = require('../../models/Engineer');
const EngineerLocationSession = require('../../models/EngineerLocationSession');
const EngineerAssignment = require('../../models/EngineerAssignment');
const JobStatusLog = require('../../models/JobStatusLog');

// Helper to calculate Haversine distance
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper to estimate ETA based on distance in km
const estimateETA = (distanceKm) => {
  if (distanceKm <= 0.05) return 0; // Already there
  const averageSpeedKmh = 25; // Average speed in city traffic
  const durationMins = (distanceKm / averageSpeedKmh) * 60;
  return Math.ceil(durationMins);
};

// Helper to interpolate points between start and end coordinates
const interpolateRoute = (startLat, startLng, endLat, endLng, pointsCount = 15) => {
  const points = [];
  for (let i = 0; i <= pointsCount; i++) {
    const fraction = i / pointsCount;
    let lat = startLat + (endLat - startLat) * fraction;
    let lng = startLng + (endLng - startLng) * fraction;
    
    // Add small curvature offset to make it look like a road route
    if (i > 0 && i < pointsCount) {
      const perpFactor = Math.sin(fraction * Math.PI) * 0.002;
      lat += (endLng - startLng) * perpFactor;
      lng += -(endLat - startLat) * perpFactor;
    }
    
    points.push({ lat, lng });
  }
  return points;
};

// Helper to get distinct engineer IDs assigned to a company's jobs
const getCompanyEngineerIds = async (companyId) => {
  const jobEngineers = await B2BJob.distinct('assignedTo', { companyId, assignedTo: { $ne: null } });
  const assignmentEngineers = await EngineerAssignment.distinct('engineerId', { companyId });
  
  const allIds = [...jobEngineers, ...assignmentEngineers].map(id => id.toString());
  const validIds = allIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  return [...new Set(validIds)].map(id => new mongoose.Types.ObjectId(id));
};

/**
 * GET Live Tracking Summary (KPI Cards)
 */
exports.getSummary = async (req, res) => {
  try {
    const isAdminUser = ['ADMIN', 'super_admin', 'admin'].includes(req.userRole);
    let companyId = req.query.companyId;

    if (!isAdminUser) {
      companyId = req.companyId || req.user.companyId || req.user.id;
    }

    let engineerIds = [];
    let jobQuery = {};

    if (companyId) {
      const compId = new mongoose.Types.ObjectId(companyId);
      engineerIds = await getCompanyEngineerIds(compId);
      jobQuery = { companyId: compId };
    } else {
      // Admin viewing all
      engineerIds = await Engineer.distinct('_id');
    }

    // Today's jobsCompleted count
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const completedTodayCount = await B2BJob.countDocuments({
      ...jobQuery,
      status: 'completed',
      updatedAt: { $gte: startOfToday, $lte: endOfToday }
    });

    // Count engineer location sessions by status
    const sessions = await EngineerLocationSession.find({
      engineerId: { $in: engineerIds }
    }).lean();

    let onDutyCount = 0;
    let enRouteCount = 0;
    let atLocationCount = 0;
    let offlineCount = 0;

    sessions.forEach(sess => {
      if (sess.isOnline) {
        onDutyCount++;
        if (sess.status === 'en_route') enRouteCount++;
        else if (sess.status === 'at_location' || sess.status === 'working') atLocationCount++;
      } else {
        offlineCount++;
      }
    });

    // In case some engineers don't have location sessions yet, consider them offline
    const totalEngineers = engineerIds.length;
    const recordedEngineers = sessions.length;
    const unrecordedCount = Math.max(0, totalEngineers - recordedEngineers);
    offlineCount += unrecordedCount;

    res.status(200).json({
      success: true,
      summary: {
        onDuty: onDutyCount,
        enRoute: enRouteCount,
        atLocation: atLocationCount,
        completedToday: completedTodayCount,
        offline: offlineCount
      }
    });
  } catch (error) {
    console.error('Error fetching live tracking summary:', error);
    res.status(500).json({ success: false, message: 'Server error fetching summary details' });
  }
};

/**
 * GET Assigned Engineers with Current Job and Location details
 */
exports.getEngineersList = async (req, res) => {
  try {
    const isAdminUser = ['ADMIN', 'super_admin', 'admin'].includes(req.userRole);
    let companyId = req.query.companyId;

    if (!isAdminUser) {
      companyId = req.companyId || req.user.companyId || req.user.id;
    }

    let engineerIds = [];
    if (companyId) {
      engineerIds = await getCompanyEngineerIds(new mongoose.Types.ObjectId(companyId));
    } else {
      engineerIds = await Engineer.distinct('_id');
    }

    const { page = 1, limit = 100, search, status } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Filter engineers
    const engineerFilter = { _id: { $in: engineerIds } };
    if (search) {
      engineerFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    let engineers = await Engineer.find(engineerFilter)
      .select('name email phone rating profilePhoto availability status createdAt')
      .lean();

    // Fetch tracking sessions for these engineers
    const trackingSessions = await EngineerLocationSession.find({
      engineerId: { $in: engineerIds }
    }).lean();

    // Map sessions by engineerId
    const sessionMap = {};
    trackingSessions.forEach(sess => {
      sessionMap[sess.engineerId.toString()] = sess;
    });

    // Fetch active B2B job for each engineer
    const activeJobs = await B2BJob.find({
      assignedTo: { $in: engineerIds },
      status: { $in: ['assigned', 'in_progress'] }
    }).lean();

    const jobsMap = {};
    activeJobs.forEach(job => {
      jobsMap[job.assignedTo.toString()] = job;
    });

    // Enrich engineers
    let enrichedList = engineers.map(eng => {
      const engIdStr = eng._id.toString();
      const session = sessionMap[engIdStr];
      const job = jobsMap[engIdStr];

      // Resolve dynamic status
      let currentStatus = 'offline';
      if (session) {
        currentStatus = session.isOnline ? session.status : 'offline';
      } else if (eng.status === 'ONLINE' || eng.status === 'active') {
        currentStatus = 'available';
      }

      return {
        _id: eng._id,
        name: eng.name,
        phone: eng.phone,
        email: eng.email,
        rating: eng.rating || 4.5,
        profilePhoto: eng.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(eng.name)}&background=10AFA5&color=fff`,
        status: currentStatus,
        battery: session ? session.battery : 85,
        lastUpdatedAt: session ? session.lastUpdatedAt : eng.createdAt,
        location: session ? {
          lat: session.currentLocation.coordinates[1],
          lng: session.currentLocation.coordinates[0],
          heading: session.heading,
          speed: session.speed
        } : null,
        currentJob: job ? {
          _id: job._id,
          jobId: job.jobId,
          customerName: job.customerName,
          serviceName: job.service || 'Technical Support',
          address: job.address,
          coordinates: job.coordinates ? {
            lat: job.coordinates.coordinates[1],
            lng: job.coordinates.coordinates[0]
          } : null,
          status: job.status,
          trackingStatus: job.trackingStatus,
          eta: job.eta
        } : null
      };
    });

    // Status filter (on-the-fly filtering to keep sync)
    if (status && status !== 'all') {
      enrichedList = enrichedList.filter(eng => eng.status === status);
    }

    // Pagination
    const total = enrichedList.length;
    const paginatedData = enrichedList.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      data: paginatedData,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching tracking engineers:', error);
    res.status(500).json({ success: false, message: 'Server error fetching engineers list' });
  }
};

/**
 * GET Specific Engineer Details
 */
exports.getEngineerDetails = async (req, res) => {
  try {
    const isAdminUser = ['ADMIN', 'super_admin', 'admin'].includes(req.userRole);
    const { engineerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'Invalid Engineer ID' });
    }

    if (!isAdminUser) {
      const rawId = req.companyId || req.user.companyId || req.user.id;
      const companyId = new mongoose.Types.ObjectId(rawId);
      const authorizedIds = await getCompanyEngineerIds(companyId);
      if (!authorizedIds.some(id => id.toString() === engineerId)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this engineer details' });
      }
    }

    const engineer = await Engineer.findById(engineerId)
      .select('name email phone rating profilePhoto createdAt')
      .lean();

    if (!engineer) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    const session = await EngineerLocationSession.findOne({ engineerId }).lean();
    const currentJob = await B2BJob.findOne({
      assignedTo: engineerId,
      status: { $in: ['assigned', 'in_progress'] }
    }).lean();

    // Count today's jobs for engineer
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const todayJobsCount = await B2BJob.countDocuments({
      assignedTo: engineerId,
      createdAt: { $gte: startOfToday }
    });

    const data = {
      _id: engineer._id,
      name: engineer.name,
      phone: engineer.phone,
      email: engineer.email,
      rating: engineer.rating || 4.5,
      profilePhoto: engineer.profilePhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(engineer.name)}&background=10AFA5&color=fff`,
      status: session ? (session.isOnline ? session.status : 'offline') : 'offline',
      battery: session ? session.battery : 90,
      lastActive: session ? session.lastUpdatedAt : engineer.createdAt,
      todayJobs: todayJobsCount,
      currentJob: currentJob ? {
        _id: currentJob._id,
        jobId: currentJob.jobId,
        customerName: currentJob.customerName,
        serviceName: currentJob.service,
        address: currentJob.address,
        eta: currentJob.eta,
        status: currentJob.status,
        trackingStatus: currentJob.trackingStatus,
        coordinates: currentJob.coordinates ? {
          lat: currentJob.coordinates.coordinates[1],
          lng: currentJob.coordinates.coordinates[0]
        } : null
      } : null
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching engineer details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Location details of an engineer
 */
exports.getEngineerLocation = async (req, res) => {
  try {
    const isAdminUser = ['ADMIN', 'super_admin', 'admin'].includes(req.userRole);
    const { engineerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'Invalid Engineer ID' });
    }

    if (!isAdminUser) {
      const rawId = req.companyId || req.user.companyId || req.user.id;
      const companyId = new mongoose.Types.ObjectId(rawId);
      const authorizedIds = await getCompanyEngineerIds(companyId);
      if (!authorizedIds.some(id => id.toString() === engineerId)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    const session = await EngineerLocationSession.findOne({ engineerId }).lean();
    if (!session) {
      return res.status(404).json({ success: false, message: 'Live location not available yet' });
    }

    res.status(200).json({
      success: true,
      location: {
        lat: session.currentLocation.coordinates[1],
        lng: session.currentLocation.coordinates[0],
        heading: session.heading,
        speed: session.speed,
        battery: session.battery,
        lastUpdatedAt: session.lastUpdatedAt,
        isOnline: session.isOnline,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Error getting location details:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Activity Timeline for engineer
 */
exports.getEngineerTimeline = async (req, res) => {
  try {
    const isAdminUser = ['ADMIN', 'super_admin', 'admin'].includes(req.userRole);
    const { engineerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'Invalid Engineer ID' });
    }

    if (!isAdminUser) {
      const rawId = req.companyId || req.user.companyId || req.user.id;
      const companyId = new mongoose.Types.ObjectId(rawId);
      const authorizedIds = await getCompanyEngineerIds(companyId);
      if (!authorizedIds.some(id => id.toString() === engineerId)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    // Find current active job
    const activeJob = await B2BJob.findOne({
      assignedTo: engineerId,
      status: { $in: ['assigned', 'in_progress', 'completed'] }
    })
    .sort({ updatedAt: -1 })
    .lean();

    if (!activeJob) {
      return res.status(200).json({ success: true, data: [] });
    }

    const logs = await JobStatusLog.find({ jobId: activeJob._id })
      .sort({ timestamp: 1 })
      .lean();

    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching job timeline:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * GET Route to a Job customer location
 */
exports.getJobRoute = async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid Job ID' });
    }

    const job = await B2BJob.findById(jobId).lean();
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Security check
    if (!['ADMIN', 'super_admin', 'admin'].includes(req.userRole)) {
      const authCompanyId = req.companyId || req.user.companyId || req.user.id;
      if (job.companyId.toString() !== authCompanyId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    if (!job.assignedTo) {
      return res.status(400).json({ success: false, message: 'No engineer is assigned to this job' });
    }

    const session = await EngineerLocationSession.findOne({ engineerId: job.assignedTo }).lean();
    if (!session) {
      return res.status(404).json({ success: false, message: 'Live engineer location not available yet' });
    }

    const startLat = session.currentLocation.coordinates[1];
    const startLng = session.currentLocation.coordinates[0];
    const endLat = job.coordinates.coordinates[1];
    const endLng = job.coordinates.coordinates[0];

    const distance = calculateHaversineDistance(startLat, startLng, endLat, endLng);
    const eta = estimateETA(distance);

    // Dynamic routing fallback interpolation
    const routePath = interpolateRoute(startLat, startLng, endLat, endLng);

    res.status(200).json({
      success: true,
      route: {
        distanceKm: Number(distance.toFixed(2)),
        etaMins: eta,
        path: routePath
      }
    });
  } catch (error) {
    console.error('Error getting route:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * POST Force refresh simulation / triggers
 */
exports.refreshTracking = async (req, res) => {
  try {
    // This can trigger an ETA recalculation across all active tracking sessions.
    // For demo/sim, we ensure all offline sessions update timestamps or mock statuses.
    const sessions = await EngineerLocationSession.find({ isOnline: true }).lean();
    
    for (const sess of sessions) {
      const activeJob = await B2BJob.findOne({
        assignedTo: sess.engineerId,
        status: { $in: ['assigned', 'in_progress'] }
      });
      
      if (activeJob && activeJob.coordinates && sess.currentLocation) {
        const distance = calculateHaversineDistance(
          sess.currentLocation.coordinates[1],
          sess.currentLocation.coordinates[0],
          activeJob.coordinates.coordinates[1],
          activeJob.coordinates.coordinates[0]
        );
        const eta = estimateETA(distance);
        
        await B2BJob.findByIdAndUpdate(activeJob._id, { eta });
      }
    }

    res.status(200).json({ success: true, message: 'Live tracking refresh triggered successfully' });
  } catch (error) {
    console.error('Error in refresh tracking:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
