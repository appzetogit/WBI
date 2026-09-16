const mongoose = require('mongoose');
const { TXN_OPTS } = require('../../utils/txnOptions');
const B2BJob = require('../../models/B2BJob');
const JobStatusTimeline = require('../../models/JobStatusTimeline');
const JobHistory = require('../../models/JobHistory');
const DeductionLedger = require('../../models/DeductionLedger');
const DeviceHistory = require('../../models/DeviceHistory');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BWallet = require('../../models/B2BWallet');
const Wallet = require('../../models/Wallet');
const WalletTransaction = require('../../models/WalletTransaction');
const Engineer = require('../../models/Engineer');
const B2BCompany = require('../../models/B2BCompany');
const EnterpriseProjectFlow = require('../../models/EnterpriseProjectFlow');
const { sendB2BJobCompletionEmail } = require('../../services/emailService');
const { sendSMS } = require('../../services/smsService');
const { getIO } = require('../../sockets');
const { syncEngineerLocationSession } = require('../../utils/engineerLocationSession.util');

const SPARE_PARTS_REASONS = ['Spare Parts', 'Spare Parts Required', 'Parts Unavailable'];
const CLIENT_DEPENDENCY_REASONS = ['Customer Dependency', 'Site Closed', 'No Access'];
const VISIT_FEE_SPARE_PARTS = parseFloat(process.env.B2B_SPARE_PARTS_VISIT_FEE || '250');
const CLIENT_DEPENDENCY_PENALTY = parseFloat(process.env.B2B_CLIENT_DEPENDENCY_PENALTY || '250');

const generateOtp = () => {
  if (process.env.NODE_ENV !== 'production' && process.env.USE_DEFAULT_OTP === 'true') return '123456';
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Optimized daily task queue: greedy nearest-neighbor sequencing.
 * Starting from the engineer's current position, repeatedly pick the
 * nearest not-yet-visited job. This is the standard heuristic used by
 * field-service routing (not an exact TSP solve, which is impractical at
 * request time) — it materially cuts total travel versus a flat
 * priority/date sort. Jobs without coordinates are appended at the end,
 * ordered by preferred date, since distance can't be computed for them.
 */
const sequenceJobsByProximity = (jobs, startCoords) => {
  const withCoords = [];
  const withoutCoords = [];

  for (const job of jobs) {
    const coords = job.coordinates?.coordinates;
    if (Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      withCoords.push({ job, lat: coords[1], lng: coords[0] });
    } else {
      withoutCoords.push(job);
    }
  }

  withoutCoords.sort((a, b) => new Date(a.preferredDate || a.createdAt) - new Date(b.preferredDate || b.createdAt));

  if (!startCoords || withCoords.length === 0) {
    return [...withCoords.map((w) => w.job), ...withoutCoords];
  }

  const remaining = [...withCoords];
  const ordered = [];
  let cursor = startCoords;

  while (remaining.length) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor.lat, cursor.lng, remaining[i].lat, remaining[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push({ ...next.job, routeDistanceKm: Number(nearestDist.toFixed(2)) });
    cursor = { lat: next.lat, lng: next.lng };
  }

  return [...ordered, ...withoutCoords];
};

const emitRealtimeStatusUpdate = (job, statusStr, trackingStatusStr) => {
  try {
    const io = getIO();
    if (!io) return;
    const companyRoom = `b2b:${job.companyId.toString()}`;
    const payload = {
      jobId: job._id.toString(),
      jobCode: job.jobId,
      status: statusStr,
      trackingStatus: trackingStatusStr,
      engineerId: job.assignedTo?.toString() || null,
      updatedAt: new Date()
    };
    io.to(companyRoom).emit('b2b:jobStatusUpdated', payload);
    io.to('admin').emit('b2b:jobStatusUpdated', payload);
    if (job.assignedVendorId) {
      io.to(`vendor:${job.assignedVendorId.toString()}`).emit('b2b:jobStatusUpdated', payload);
    }
  } catch (err) {
    console.warn('[Socket Warning] emitRealtimeStatusUpdate error:', err.message);
  }
};

/**
 * GET /api/engineers/b2b-jobs
 * Fetch assigned or offered B2B jobs for engineer with filtering, search, sorting and metrics
 */
exports.getAssignedB2BJobs = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { status, search, sortBy, page: pageReq, limit: limitReq } = req.query;

    const page = Math.max(1, parseInt(pageReq, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitReq, 10) || 50));
    const skip = (page - 1) * limit;

    const baseFilter = {
      $or: [{ assignedTo: engineerId }, { notifiedEngineers: engineerId }]
    };

    if (status && status !== 'all') {
      if (status === 'assigned') {
        baseFilter.status = 'assigned';
      } else if (status === 'active') {
        baseFilter.status = { $in: ['accepted', 'travelling', 'arrived', 'in_progress'] };
      } else {
        baseFilter.status = status;
      }
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      const regex = new RegExp(q, 'i');
      baseFilter.$and = baseFilter.$and || [];
      baseFilter.$and.push({
        $or: [
          { jobId: regex },
          { customerName: regex },
          { service: regex },
          { city: regex },
          { address: regex }
        ]
      });
    }

    let sortOptions = { preferredDate: 1, createdAt: -1 };
    if (sortBy === 'priority') {
      sortOptions = { priority: -1, preferredDate: 1 };
    } else if (sortBy === 'latest') {
      sortOptions = { createdAt: -1 };
    }

    let jobs;
    if (sortBy === 'route') {
      // Optimized daily task queue: nearest-neighbor sequencing from the
      // engineer's current position, minimizing total travel distance
      // across today's open jobs instead of a flat priority/date sort.
      const allMatching = await B2BJob.find(baseFilter)
        .populate('companyId', 'companyName')
        .populate('assignedVendorId', 'vendorName businessName')
        .select('-startOtp -endOtp')
        .lean();

      const engineer = await Engineer.findById(engineerId).select('geoLocation location').lean();
      const startCoords = engineer?.geoLocation?.coordinates?.length === 2
        ? { lat: engineer.geoLocation.coordinates[1], lng: engineer.geoLocation.coordinates[0] }
        : (engineer?.location?.lat && engineer?.location?.lng
          ? { lat: engineer.location.lat, lng: engineer.location.lng }
          : null);

      jobs = sequenceJobsByProximity(allMatching, startCoords).slice(skip, skip + limit);
    } else {
      jobs = await B2BJob.find(baseFilter)
        .populate('companyId', 'companyName')
        .populate('assignedVendorId', 'vendorName businessName')
        .select('-startOtp -endOtp')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // Summary counts for filter bar
    const allAssignedJobs = await B2BJob.find({
      $or: [{ assignedTo: engineerId }, { notifiedEngineers: engineerId }]
    }).select('status preferredDate').lean();

    const counts = {
      all: allAssignedJobs.length,
      assigned: allAssignedJobs.filter(j => j.status === 'assigned').length,
      accepted: allAssignedJobs.filter(j => j.status === 'accepted').length,
      travelling: allAssignedJobs.filter(j => j.status === 'travelling').length,
      arrived: allAssignedJobs.filter(j => j.status === 'arrived').length,
      in_progress: allAssignedJobs.filter(j => j.status === 'in_progress').length,
      completion_submitted: allAssignedJobs.filter(j => j.status === 'completion_submitted' || j.status === 'admin_review').length,
      completed: allAssignedJobs.filter(j => j.status === 'completed').length,
      rejected: allAssignedJobs.filter(j => j.status === 'rejected').length
    };

    res.status(200).json({
      success: true,
      jobs,
      counts,
      page,
      limit
    });
  } catch (error) {
    console.error('[getAssignedB2BJobs]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch B2B jobs' });
  }
};

/**
 * GET /api/engineers/b2b-jobs/summary
 * Dashboard status counter metrics for engineer home screen
 */
exports.getB2BJobDashboardSummary = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const jobs = await B2BJob.find({ assignedTo: engineerId }).select('status preferredDate date charge payoutStatus createdAt').lean();

    const todayAssigned = jobs.filter(j => new Date(j.preferredDate || j.createdAt) >= startOfToday && j.status === 'assigned').length;
    const travellingCount = jobs.filter(j => j.status === 'travelling').length;
    const inProgressCount = jobs.filter(j => j.status === 'in_progress').length;
    const completedCount = jobs.filter(j => j.status === 'completed').length;
    const pendingCompletion = jobs.filter(j => j.status === 'completion_submitted' || j.status === 'admin_review').length;
    const payoutPending = jobs.filter(j => j.payoutStatus === 'pending_review' || j.payoutStatus === 'held').length;

    res.status(200).json({
      success: true,
      summary: {
        todayAssigned,
        travellingCount,
        inProgressCount,
        completedCount,
        pendingCompletion,
        payoutPending,
        totalJobs: jobs.length
      }
    });
  } catch (error) {
    console.error('[getB2BJobDashboardSummary]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard summary' });
  }
};

/**
 * GET /api/engineers/b2b-jobs/:jobId
 * Comprehensive details of a specific B2B Job for job execution
 */
exports.getB2BJobById = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;

    const job = await B2BJob.findOne({
      _id: req.params.jobId,
      $or: [{ assignedTo: engineerId }, { notifiedEngineers: engineerId }]
    })
      .populate('companyId', 'companyName email phone')
      .populate('assignedVendorId', 'vendorName businessName phone')
      .select('-startOtp -endOtp')
      .lean();

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const isAssigned = String(job.assignedTo || '') === String(engineerId);

    // Fetch timeline history for audit section
    const timeline = await JobStatusTimeline.find({ jobId: job._id })
      .sort({ createdAt: 1 })
      .lean();

    const payload = isAssigned
      ? job
      : {
          ...job,
          phone: undefined,
          email: undefined,
          address: job.address,
          offerOnly: true
        };

    res.status(200).json({
      success: true,
      job: {
        ...payload,
        isAssignedToMe: isAssigned,
        hasStartOtp: isAssigned,
        timeline,
        workElapsedMs: job.startedAt ? Date.now() - new Date(job.startedAt).getTime() : null,
        isDemoPayment: process.env.ENABLE_DEMO_PAYMENTS === 'true' || process.env.NODE_ENV !== 'production'
      }
    });
  } catch (error) {
    console.error('[getB2BJobById]', error);
    res.status(500).json({ success: false, message: 'Failed to fetch job' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/accept
 * Accept job offer / assignment
 */
exports.acceptB2BJobOffer = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { location } = req.body;

    const job = await B2BJob.findOne({
      _id: jobId,
      $or: [{ assignedTo: engineerId }, { notifiedEngineers: engineerId }]
    });

    if (!job) return res.status(404).json({ success: false, message: 'Job offer not found' });

    if (['accepted', 'travelling', 'arrived', 'in_progress', 'completed'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Job is already in status '${job.status}'` });
    }

    const engineer = await Engineer.findById(engineerId).select('name phone engineerType vendorId').lean();

    job.assignedTo = engineerId;
    job.assignedToName = engineer?.name || 'Assigned Engineer';
    job.assignmentType = engineer?.engineerType === 'vendor_engineer' ? 'vendor_engineer' : 'freelancer';
    if (engineer?.vendorId) {
      job.assignedVendorId = engineer.vendorId;
    }

    job.status = 'accepted';
    job.trackingStatus = 'accepted';
    job.acceptedAt = new Date();
    job.assignedAt = job.assignedAt || new Date();
    job.allocationStage = 'allocated';

    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'accepted',
      remarks: 'Engineer accepted the job offer',
      location: location || { type: 'Point', coordinates: [0, 0] }
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'accepted',
      remark: 'Engineer confirmed acceptance of job assignment',
      role: 'engineer',
      changedBy: engineerId
    });

    emitRealtimeStatusUpdate(job, 'accepted', 'accepted');
    syncEngineerLocationSession(engineerId, { location, status: 'assigned', isOnline: true });

    res.status(200).json({ success: true, message: 'Job accepted successfully', job });
  } catch (error) {
    console.error('[acceptB2BJobOffer]', error);
    res.status(500).json({ success: false, message: 'Failed to accept job offer' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/reject
 * Reject job offer / assignment with mandatory rejection reason
 */
exports.rejectB2BJobOffer = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { rejectionReason, rejectionRemarks } = req.body;

    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is mandatory' });
    }

    const job = await B2BJob.findOne({
      _id: jobId,
      $or: [{ assignedTo: engineerId }, { notifiedEngineers: engineerId }]
    });

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (['travelling', 'arrived', 'in_progress', 'completed'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Cannot reject job when status is '${job.status}'` });
    }

    const now = new Date();
    job.status = 'rejected';
    job.trackingStatus = 'rejected';
    job.rejectionReason = rejectionReason;
    job.rejectionRemarks = rejectionRemarks || '';
    job.rejectedAt = now;
    job.rejectedBy = engineerId;
    job.assignedTo = null;
    job.assignedToName = null;
    job.allocationStage = 'freelancer_pool';

    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'rejected',
      remarks: `Engineer rejected job: ${rejectionReason} ${rejectionRemarks ? `(${rejectionRemarks})` : ''}`
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'rejected',
      remark: `Engineer rejected job assignment. Reason: ${rejectionReason}`,
      role: 'engineer',
      changedBy: engineerId
    });

    emitRealtimeStatusUpdate(job, 'rejected', 'rejected');

    res.status(200).json({ success: true, message: 'Job rejected. Admin/Vendor notified for re-assignment.' });
  } catch (error) {
    console.error('[rejectB2BJobOffer]', error);
    res.status(500).json({ success: false, message: 'Failed to reject job' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/start-travel
 * Engineer starts travel to customer site
 */
exports.startTravel = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { location } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.status === 'travelling') {
      return res.status(200).json({ success: true, message: 'Already travelling', job });
    }

    if (!['accepted', 'assigned'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Cannot start travel from status '${job.status}'` });
    }

    const now = new Date();
    job.status = 'travelling';
    job.trackingStatus = 'en_route';
    job.travelStartedAt = now;
    if (location?.lat && location?.lng) {
      job.travelStartLocation = { lat: location.lat, lng: location.lng };
    }

    await job.save();

    if (location?.lat && location?.lng) {
      await Engineer.findByIdAndUpdate(engineerId, {
        'location.lat': location.lat,
        'location.lng': location.lng,
        'location.updatedAt': now,
        'geoLocation.coordinates': [location.lng, location.lat]
      });
    }

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'travelling',
      remarks: 'Engineer started travel to site',
      location: location ? { type: 'Point', coordinates: [location.lng || 0, location.lat || 0] } : { type: 'Point', coordinates: [0, 0] }
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'travelling',
      remark: 'Engineer is travelling to customer site',
      role: 'engineer',
      changedBy: engineerId
    });

    emitRealtimeStatusUpdate(job, 'travelling', 'en_route');
    syncEngineerLocationSession(engineerId, { location, status: 'en_route', isOnline: true });

    res.status(200).json({ success: true, message: 'Travel started', job });
  } catch (error) {
    console.error('[startTravel]', error);
    res.status(500).json({ success: false, message: 'Failed to start travel' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/update-location
 * Realtime GPS coordinate updates during travel / active job
 */
exports.updateLocation = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { lat, lng, eta, heading, speed, battery } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng coordinates are required' });
    }

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (eta && !Number.isNaN(parseFloat(eta))) {
      job.eta = parseFloat(eta);
      await job.save();
    }

    const now = new Date();
    await Engineer.findByIdAndUpdate(engineerId, {
      'location.lat': lat,
      'location.lng': lng,
      'location.updatedAt': now,
      'geoLocation.coordinates': [lng, lat]
    });

    // Keep the live-tracking dashboard's data source current. Status is left
    // untouched here (accept/start-travel/arrive/start/complete own status
    // transitions) — this is purely the breadcrumb position ping.
    syncEngineerLocationSession(engineerId, { location: { lat, lng }, isOnline: true, heading, speed, battery });

    try {
      const io = getIO();
      if (io) {
        const payload = {
          jobId: job._id.toString(),
          engineerId: engineerId.toString(),
          lat,
          lng,
          heading: Number.isFinite(Number(heading)) ? Number(heading) : undefined,
          speed: Number.isFinite(Number(speed)) ? Number(speed) : undefined,
          battery: Number.isFinite(Number(battery)) ? Number(battery) : undefined,
          eta: job.eta,
          updatedAt: now
        };
        io.to(`b2b:${job.companyId.toString()}`).emit('b2b:engineerLocationUpdated', payload);
        io.to('admin').emit('b2b:engineerLocationUpdated', payload);
      }
    } catch (e) {
      /* ignore socket emit warning */
    }

    res.status(200).json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('[updateLocation]', error);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/arrive
 * Confirm arrival at customer service location
 */
exports.arriveAtSite = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { location } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.status === 'arrived') {
      return res.status(200).json({ success: true, message: 'Already marked as arrived', job });
    }

    if (!['travelling', 'accepted', 'assigned'].includes(job.status)) {
      return res.status(400).json({ success: false, message: `Cannot mark arrival from status '${job.status}'` });
    }

    const now = new Date();
    job.status = 'arrived';
    job.trackingStatus = 'reached_location';
    job.arrivedAt = now;
    if (location?.lat && location?.lng) {
      job.arrivalLocation = { lat: location.lat, lng: location.lng };
    }

    // Generate Customer Start OTP automatically upon arrival
    const otp = generateOtp();
    job.startOtp = otp;
    job.startOtpSentAt = now;
    job.startOtpAttempts = 0;

    await job.save();

    console.log(`\n========================================\n🔑 [B2B CUSTOMER START OTP GENERATED]\nJob ID: ${job.jobId}\nCustomer Phone: ${job.phone}\nOTP CODE: ${otp}\n========================================\n`);

    if (job.phone) {
      try {
        await sendSMS(
          job.phone,
          `WBIPVTLTD: Your B2B service engineer has arrived. Share OTP ${otp} with engineer to start service.`
        );
      } catch (e) {
        console.warn('[B2B OTP] SMS failed:', e.message);
      }
    }

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'arrived',
      remarks: 'Engineer arrived at site. Customer Start OTP sent.',
      location: location ? { type: 'Point', coordinates: [location.lng || 0, location.lat || 0] } : { type: 'Point', coordinates: [0, 0] }
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'arrived',
      remark: 'Engineer arrived at service site',
      role: 'engineer',
      changedBy: engineerId
    });

    emitRealtimeStatusUpdate(job, 'arrived', 'reached_location');
    syncEngineerLocationSession(engineerId, { location, status: 'at_location', isOnline: true });

    const safeJob = job.toObject();
    delete safeJob.startOtp;

    res.status(200).json({
      success: true,
      message: 'Arrival confirmed. Customer Start OTP has been sent.',
      job: safeJob
    });
  } catch (error) {
    console.error('[arriveAtSite]', error);
    res.status(500).json({ success: false, message: 'Failed to record arrival' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/resend-otp
 * Resend Customer Start OTP
 */
exports.resendStartOtp = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const job = await B2BJob.findOne({ _id: req.params.jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.status === 'in_progress') {
      return res.status(400).json({ success: false, message: 'Job already started' });
    }

    if (job.startOtpSentAt) {
      const secondsSinceLast = (Date.now() - new Date(job.startOtpSentAt).getTime()) / 1000;
      if (secondsSinceLast < 45) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil(45 - secondsSinceLast)} seconds before requesting a new OTP.`
        });
      }
    }

    const otp = generateOtp();
    job.startOtp = otp;
    job.startOtpSentAt = new Date();
    job.startOtpAttempts = 0;
    await job.save();

    console.log(`\n========================================\n🔑 [B2B CUSTOMER START OTP RESENT]\nJob ID: ${job.jobId}\nCustomer Phone: ${job.phone}\nOTP CODE: ${otp}\n========================================\n`);

    if (job.phone) {
      try {
        await sendSMS(
          job.phone,
          `WBIPVTLTD: Your service start OTP for job ${job.jobId} is ${otp}. Share only with the engineer on site.`
        );
      } catch (e) {
        console.warn('[B2B OTP] Resend SMS failed:', e.message);
      }
    }

    res.status(200).json({
      success: true,
      message: process.env.NODE_ENV !== 'production'
        ? `Start OTP sent to customer phone. (DEV OTP: ${otp})`
        : 'Start OTP sent to customer phone',
      debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/start
 * Verify Customer OTP + Require Before Photo + Start Job
 */
exports.startB2BJob = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { startOtp, location, beforePhotos } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    if (job.reopenBlocked || job.requiresNewJob) {
      return res.status(400).json({
        success: false,
        message: 'This job is closed and requires a new job ticket. It cannot be restarted.'
      });
    }

    if (job.status === 'in_progress') {
      const safeJob = job.toObject();
      delete safeJob.startOtp;
      return res.status(200).json({ success: true, message: 'Job already in progress', job: safeJob });
    }

    if (!['arrived', 'assigned', 'accepted', 'travelling'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot start job in status '${job.status}'`
      });
    }

    if (!startOtp || String(startOtp).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Customer 6-digit Start OTP is required' });
    }

    if (!job.startOtp) {
      const newOtp = generateOtp();
      job.startOtp = newOtp;
      job.startOtpSentAt = new Date();
      await job.save();
      return res.status(400).json({
        success: false,
        message: 'No OTP generated yet. Resending OTP to customer now.'
      });
    }

    // Security Check: Attempt Limits
    const MAX_OTP_ATTEMPTS = 5;
    if ((job.startOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please tap "Resend OTP" to send a fresh OTP to the customer.'
      });
    }

    if (String(startOtp).trim() !== String(job.startOtp).trim()) {
      job.startOtpAttempts = (job.startOtpAttempts || 0) + 1;
      job.startOtpLastAttemptAt = new Date();
      await job.save();

      const remaining = MAX_OTP_ATTEMPTS - job.startOtpAttempts;
      return res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Invalid OTP. ${remaining} attempt(s) remaining.`
          : 'Too many incorrect attempts. Please request a new OTP.'
      });
    }

    const photos = Array.isArray(beforePhotos) ? beforePhotos.filter(Boolean) : [];
    if (photos.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'At least one before-work photo is required to start the job'
      });
    }

    const now = new Date();
    job.status = 'in_progress';
    job.trackingStatus = 'work_started';
    job.startedAt = now;
    job.startOtpVerifiedAt = now;
    job.beforePhotos = photos;
    job.startOtp = null;
    job.startOtpAttempts = 0;
    if (location?.lat && location?.lng) {
      job.startLocation = { lat: location.lat, lng: location.lng };
    }

    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'in_progress',
      remarks: 'Work started — OTP verified, before photos captured, timer started',
      location: location ? { type: 'Point', coordinates: [location.lng || 0, location.lat || 0] } : { type: 'Point', coordinates: [0, 0] }
    });

    await JobHistory.create({
      jobId: job._id,
      status: 'in_progress',
      remark: 'Engineer started job with OTP + before photos. Work timer running.',
      role: 'engineer',
      changedBy: engineerId
    });

    emitRealtimeStatusUpdate(job, 'in_progress', 'work_started');
    syncEngineerLocationSession(engineerId, { location, status: 'working', isOnline: true });

    const safeJob = job.toObject();
    delete safeJob.startOtp;

    res.status(200).json({
      success: true,
      message: 'Job started successfully. Work timer is running.',
      job: safeJob,
      workTimerStartedAt: now
    });
  } catch (error) {
    console.error('[startB2BJob]', error);
    res.status(500).json({ success: false, message: 'Failed to start job' });
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/customer-unavailable
 * Mark Customer/Site Contact Unavailable
 */
exports.markCustomerUnavailable = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { remarks, photos } = req.body;

    const job = await B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const now = new Date();
    job.customerUnavailableAt = now;
    job.customerUnavailableRemarks = remarks || 'Customer unavailable at site';
    if (Array.isArray(photos)) {
      job.customerUnavailablePhotos = photos.filter(Boolean);
    }

    await job.save();

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: job.status,
      remarks: `CUSTOMER_UNAVAILABLE: ${remarks || 'Site contact not reachable'}`
    });

    res.status(200).json({
      success: true,
      message: 'Recorded customer unavailable notice. Admin/Company notified.',
      job
    });
  } catch (error) {
    console.error('[markCustomerUnavailable]', error);
    res.status(500).json({ success: false, message: 'Failed to record notice' });
  }
};

async function applyWalletAdjustment({ companyId, job, engineerId, amount, reasonCode, remarks, session }) {
  const q = B2BWallet.findOne({ companyId });
  if (session) q.session(session);
  const wallet = await q;
  if (!wallet) return { success: false, error: 'Wallet not found' };

  const absAmount = Math.abs(amount);
  if (amount < 0 && wallet.balance < absAmount) {
    return { success: false, error: 'Insufficient wallet balance', available: wallet.balance, required: absAmount };
  }

  wallet.balance = parseFloat((wallet.balance + amount).toFixed(2));
  if (amount < 0) {
    wallet.totalSpent = parseFloat((wallet.totalSpent + absAmount).toFixed(2));
  }
  wallet.lastUpdatedAt = new Date();
  await wallet.save(session ? { session } : undefined);

  await B2BCompany.findByIdAndUpdate(
    companyId,
    { walletBalance: wallet.balance },
    session ? { session } : undefined
  );

  const dedOpts = session ? { session } : undefined;
  const deductionDocs = await DeductionLedger.create([{
    companyId,
    jobId: job._id,
    engineerId,
    amount: absAmount,
    reasonCode,
    remarks
  }], dedOpts);

  const deduction = Array.isArray(deductionDocs) ? deductionDocs[0] : deductionDocs;

  await B2BWalletTransaction.create([{
    companyId,
    walletId: wallet._id,
    transactionId: `DED-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: amount < 0 ? 'job_deduction' : 'adjustment',
    amount,
    totalAmount: amount,
    status: 'success',
    deductionId: deduction._id,
    remark: remarks
  }], dedOpts);

  return { success: true, wallet, deduction };
}

/**
 * POST /api/engineers/b2b-jobs/:jobId/complete
 * Submit Job Completion for Admin/QA Review
 */
exports.completeB2BJob = async (req, res) => {
  let session = null;
  let useTxn = false;

  try {
    session = await mongoose.startSession();
    session.startTransaction(TXN_OPTS);
    useTxn = true;
  } catch (txnStartErr) {
    console.warn('[completeB2BJob] Transactions unavailable, continuing without session:', txnStartErr.message);
    session = null;
    useTxn = false;
  }

  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const {
      status = 'completed',
      incompleteReason,
      incompleteRemarks,
      beforePhotos,
      afterPhotos,
      workNotes,
      partsReplaced,
      checklist,
      customerSignature,
      customerSignoffMethod,
      location,
      quoteAdjustmentAmount
    } = req.body;

    if (!['completed', 'failed'].includes(status)) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: 'status must be completed or failed' });
    }

    let jobQuery = B2BJob.findOne({ _id: jobId, assignedTo: engineerId });
    if (useTxn) jobQuery = jobQuery.session(session);
    const job = await jobQuery;
    if (!job) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({ success: false, message: `Job already ${job.status}` });
    }

    if (job.reopenBlocked) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({
        success: false,
        message: 'Job is permanently closed. Create a fresh job ticket.'
      });
    }

    if (job.status !== 'in_progress' && job.status !== 'revision_required') {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(400).json({
        success: false,
        message: 'Job must be in progress before submitting completion'
      });
    }

    const now = new Date();
    if (beforePhotos?.length) job.beforePhotos = beforePhotos;
    if (afterPhotos?.length) job.afterPhotos = afterPhotos;
    if (workNotes) job.workNotes = workNotes;
    if (partsReplaced) job.partsReplaced = partsReplaced;
    if (Array.isArray(checklist)) job.checklist = checklist;
    if (customerSignature) job.customerSignature = customerSignature;
    if (customerSignoffMethod) job.customerSignoffMethod = customerSignoffMethod;
    if (location?.lat && location?.lng) {
      job.completionLocation = { lat: location.lat, lng: location.lng };
    }

    if (status === 'failed') {
      if (!incompleteReason) {
        if (useTxn) { await session.abortTransaction(); session.endSession(); }
        return res.status(400).json({ success: false, message: 'incompleteReason is required when marking failed' });
      }

      job.status = 'failed';
      job.trackingStatus = 'failed';
      job.completedAt = now;
      job.incompleteReason = incompleteReason;
      job.incompleteRemarks = incompleteRemarks || '';

      const isSpareParts = SPARE_PARTS_REASONS.includes(incompleteReason);
      const isClientDep = CLIENT_DEPENDENCY_REASONS.includes(incompleteReason);

      if (isSpareParts) {
        if (!incompleteRemarks || String(incompleteRemarks).trim().length < 5) {
          if (useTxn) { await session.abortTransaction(); session.endSession(); }
          return res.status(400).json({
            success: false,
            message: 'Spare Parts closure requires remarks describing parts needed'
          });
        }

        const visitFee = Math.min(VISIT_FEE_SPARE_PARTS, job.charge > 0 ? job.charge : VISIT_FEE_SPARE_PARTS);
        let walletDelta = 0;
        let adjustmentNote = '';

        if (job.paymentStatus === 'deducted' && job.charge > visitFee) {
          const refund = parseFloat((job.charge - visitFee).toFixed(2));
          walletDelta = refund;
          job.quoteAdjustmentAmount = -refund;
          adjustmentNote = `Spare Parts: kept visit fee ₹${visitFee}, refunded ₹${refund}`;
        } else if (job.paymentStatus !== 'deducted') {
          walletDelta = -visitFee;
          job.quoteAdjustmentAmount = visitFee;
          adjustmentNote = `Spare Parts: visit fee ₹${visitFee} deducted`;
        } else {
          adjustmentNote = `Spare Parts: visit fee already covered in deducted charge ₹${job.charge}`;
        }

        const extraAdj = parseFloat(quoteAdjustmentAmount || 0);
        if (!Number.isNaN(extraAdj) && extraAdj !== 0) {
          walletDelta -= extraAdj;
          job.quoteAdjustmentAmount = parseFloat(((job.quoteAdjustmentAmount || 0) + extraAdj).toFixed(2));
          adjustmentNote += `; extra adjustment ₹${extraAdj}`;
        }

        if (walletDelta !== 0) {
          const result = await applyWalletAdjustment({
            companyId: job.companyId,
            job,
            engineerId,
            amount: walletDelta,
            reasonCode: 'Spare Parts Required',
            remarks: `${adjustmentNote}. ${incompleteRemarks}`,
            session: useTxn ? session : null
          });
          if (!result.success) {
            if (useTxn) { await session.abortTransaction(); session.endSession(); }
            return res.status(400).json({
              success: false,
              message: result.error || 'Wallet adjustment failed',
              available: result.available,
              required: result.required
            });
          }
        }

        job.paymentStatus = 'adjusted';
        job.requiresNewJob = true;
        job.reopenBlocked = true;
        job.charge = visitFee;
      } else if (isClientDep) {
        const result = await applyWalletAdjustment({
          companyId: job.companyId,
          job,
          engineerId,
          amount: -CLIENT_DEPENDENCY_PENALTY,
          reasonCode: incompleteReason,
          remarks: incompleteRemarks || `Auto-deduction for aborted job visit (${incompleteReason})`,
          session: useTxn ? session : null
        });
        if (!result.success && result.error === 'Insufficient wallet balance') {
          let wq = B2BWallet.findOne({ companyId: job.companyId });
          if (useTxn) wq = wq.session(session);
          const wallet = await wq;
          if (wallet) {
            wallet.pendingDeductions = parseFloat(
              ((wallet.pendingDeductions || 0) + CLIENT_DEPENDENCY_PENALTY).toFixed(2)
            );
            await wallet.save(useTxn ? { session } : undefined);
          }
        }
      }
    } else if (status === 'completed') {
      const after = Array.isArray(afterPhotos) ? afterPhotos.filter(Boolean) : [];
      if (after.length < 1) {
        if (useTxn) { await session.abortTransaction(); session.endSession(); }
        return res.status(400).json({
          success: false,
          message: 'At least one after-work photo is required to complete the job'
        });
      }

      // Transition to COMPLETION_SUBMITTED (admin_review)
      job.status = 'completion_submitted';
      job.trackingStatus = 'completion_submitted';
      job.completionSubmittedAt = now;
      job.payoutStatus = 'pending_review';
    }

    await job.save(useTxn ? { session } : undefined);

    if (job.deviceId && (status === 'completed' || partsReplaced)) {
      let dq = DeviceHistory.findOne({ deviceId: job.deviceId, companyId: job.companyId });
      if (useTxn) dq = dq.session(session);
      let device = await dq;
      if (!device) {
        device = new DeviceHistory({ companyId: job.companyId, deviceId: job.deviceId, siteId: job.siteId });
      }
      device.jobHistory.push({
        jobId: job._id,
        engineerId,
        engineerName: job.assignedToName,
        issueReported: job.service,
        partsReplaced: partsReplaced || 'None'
      });
      await device.save(useTxn ? { session } : undefined);
    }

    const timelinePayload = {
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: job.status,
      remarks: status === 'failed'
        ? `Job failed: ${incompleteReason}${incompleteRemarks ? ` — ${incompleteRemarks}` : ''}`
        : 'Completion submitted for Admin/QA review',
      location: location ? { type: 'Point', coordinates: [location.lng || 0, location.lat || 0] } : { type: 'Point', coordinates: [0, 0] }
    };
    if (useTxn) {
      await JobStatusTimeline.create([timelinePayload], { session });
    } else {
      await JobStatusTimeline.create(timelinePayload);
    }

    const historyPayload = {
      jobId: job._id,
      status: job.status,
      remark: status === 'failed'
        ? `Incomplete: ${incompleteReason}. requiresNewJob=${!!job.requiresNewJob}`
        : 'Completion submitted for admin approval',
      role: 'engineer',
      changedBy: engineerId
    };
    if (useTxn) {
      await JobHistory.create([historyPayload], { session });
    } else {
      await JobHistory.create(historyPayload);
    }

    if (useTxn) {
      await session.commitTransaction();
      session.endSession();
    }

    try {
      const { onB2BJobCompleted } = require('../../services/enterpriseB2BOrchestrator.service');
      await onB2BJobCompleted(job._id, { status: job.status });
    } catch (flowErr) {
      console.warn('[completeB2BJob] enterprise flow:', flowErr.message);
    }

    if (status === 'completed' && job.charge > 0) {
      try {
        const company = await B2BCompany.findById(job.companyId).select('email companyName');
        if (company && company.email) {
          const engineer = await Engineer.findById(engineerId).select('name');
          sendB2BJobCompletionEmail(company.email, company.companyName, job, engineer?.name);
        }
      } catch (emailErr) {
        console.error('[B2B Email] Thank-you email failed (non-blocking):', emailErr.message);
      }
    }

    emitRealtimeStatusUpdate(job, job.status, job.trackingStatus);
    syncEngineerLocationSession(engineerId, { location, status: 'available', isOnline: true });

    const safeJob = job.toObject();
    delete safeJob.startOtp;

    res.status(200).json({
      success: true,
      message: status === 'failed' && job.requiresNewJob
        ? 'Job closed as Spare Parts Required. Create a fresh job when parts are available.'
        : 'Service completion submitted. Waiting for admin verification.',
      job: safeJob
    });
  } catch (error) {
    if (useTxn && session) {
      await session.abortTransaction().catch(() => {});
      session.endSession();
    }
    console.error('[completeB2BJob]', error);
    res.status(500).json({ success: false, message: 'Failed to submit job completion' });
  }
};
