const mongoose = require('mongoose');
const { TXN_OPTS } = require('../../utils/txnOptions');
const B2BJob = require('../../models/B2BJob');
const JobStatusTimeline = require('../../models/JobStatusTimeline');
const DeductionLedger = require('../../models/DeductionLedger');
const DeviceHistory = require('../../models/DeviceHistory');
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
const { LIFECYCLE: S } = require('../../services/jobStateMachine');
const { transitionJobPath, lifecycleOf, emitJobStatus } = require('../../services/jobLifecycle.service');
const { sendJobError } = require('../../services/jobScope.service');

const engineerActor = (engineerId) => ({ id: engineerId, role: 'engineer' });

/**
 * An offer is only visible while it is still open to this engineer: nobody has
 * taken the job, no vendor holds it, and the engineer has not declined it.
 */
const openOfferFilter = (engineerId) => ({
  notifiedEngineers: engineerId,
  declinedEngineers: { $ne: engineerId },
  assignedTo: null,
  assignedVendorId: null,
  status: { $in: ['pending', 'searching_engineer'] }
});

const { advanceEngineerJob: advanceFieldJob } = require('../../services/jobAssignment.service');

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
      $or: [{ assignedTo: engineerId }, openOfferFilter(engineerId)]
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
      $or: [{ assignedTo: engineerId }, openOfferFilter(engineerId)]
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
      $or: [{ assignedTo: engineerId }, openOfferFilter(engineerId)]
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
 * Accept an assignment, or claim an open broadcast offer (first wins).
 * Validated by the job state machine; ASSIGNED → ACCEPTED only.
 */
exports.acceptB2BJobOffer = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { location } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid job id' });
    }

    const { acceptAssignment } = require('../../services/jobAssignment.service');
    const updated = await acceptAssignment({ jobId, engineerId, location });

    await JobStatusTimeline.create({
      jobId: updated._id,
      companyId: updated.companyId,
      engineerId,
      status: 'accepted',
      remarks: 'Engineer accepted the job',
      location: location?.lat && location?.lng
        ? { type: 'Point', coordinates: [location.lng, location.lat] }
        : { type: 'Point', coordinates: [0, 0] }
    });
    syncEngineerLocationSession(engineerId, { location, status: 'assigned', isOnline: true });

    const job = await B2BJob.findById(updated._id).select('-startOtp -endOtp').lean();
    res.status(200).json({ success: true, message: 'Job accepted successfully', job });
  } catch (error) {
    return sendJobError(res, error, 'Failed to accept job offer');
  }
};

/**
 * POST /api/engineers/b2b-jobs/:jobId/reject
 * Reject an assignment (only before accepting) or decline an offer.
 * The assignment is closed as REJECTED in history; a vendor-held job returns
 * to the vendor's queue, an unowned job is routed again.
 */
exports.rejectB2BJobOffer = async (req, res) => {
  try {
    const engineerId = req.user.id || req.user._id;
    const { jobId } = req.params;
    const { rejectionReason, rejectionRemarks } = req.body || {};

    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is mandatory' });
    }
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid job id' });
    }

    const before = await B2BJob.findById(jobId).select('assignedTo assignedVendorId companyId').lean();
    const { rejectAssignment } = require('../../services/jobAssignment.service');
    await rejectAssignment({ jobId, engineerId, reason: rejectionReason, remarks: rejectionRemarks || '' });

    if (before && String(before.assignedTo || '') === String(engineerId)) {
      await JobStatusTimeline.create({
        jobId,
        companyId: before.companyId,
        engineerId,
        status: 'rejected',
        remarks: `Engineer rejected job: ${rejectionReason}${rejectionRemarks ? ` (${rejectionRemarks})` : ''}`
      });
    }

    res.status(200).json({
      success: true,
      message: before?.assignedVendorId
        ? 'Job rejected. Your vendor has been notified to reassign it.'
        : 'Job declined. It will be offered to other engineers.'
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to reject job');
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

    if (lifecycleOf(job) === S.EN_ROUTE) {
      return res.status(200).json({ success: true, message: 'Already travelling', job });
    }

    const now = new Date();
    const updated = await advanceFieldJob({
      job,
      engineerId,
      target: S.EN_ROUTE,
      reason: 'Engineer started travel to site',
      event: 'ENGINEER_EN_ROUTE',
      location,
      patch: {
        travelStartedAt: now,
        ...(location?.lat && location?.lng ? { travelStartLocation: { lat: location.lat, lng: location.lng } } : {})
      }
    });

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

    syncEngineerLocationSession(engineerId, { location, status: 'en_route', isOnline: true });

    const { startOtp, endOtp, ...safe } = updated;
    res.status(200).json({ success: true, message: 'Travel started', job: safe });
  } catch (error) {
    return sendJobError(res, error, 'Failed to start travel');
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

    if (lifecycleOf(job) === S.ARRIVED) {
      const { startOtp, endOtp, ...safe } = job.toObject();
      return res.status(200).json({ success: true, message: 'Already marked as arrived', job: safe });
    }

    const now = new Date();
    // Generate Customer Start OTP automatically upon arrival
    const otp = generateOtp();
    await advanceFieldJob({
      job,
      engineerId,
      target: S.ARRIVED,
      reason: 'Engineer arrived at site. Customer start OTP sent.',
      event: 'ENGINEER_ARRIVED',
      location,
      patch: {
        arrivedAt: now,
        startOtp: otp,
        startOtpSentAt: now,
        startOtpAttempts: 0,
        ...(location?.lat && location?.lng ? { arrivalLocation: { lat: location.lat, lng: location.lng } } : {})
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[B2B start OTP][dev] job=${job.jobId} otp=${otp}`);
    }

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

    syncEngineerLocationSession(engineerId, { location, status: 'at_location', isOnline: true });

    const safeJob = await B2BJob.findById(job._id).select('-startOtp -endOtp').lean();
    res.status(200).json({
      success: true,
      message: 'Arrival confirmed. Customer Start OTP has been sent.',
      job: safeJob
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to record arrival');
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

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[B2B start OTP resent][dev] job=${job.jobId} otp=${otp}`);
    }

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

    const state = lifecycleOf(job);
    if (state === S.IN_PROGRESS) {
      const safeJob = job.toObject();
      delete safeJob.startOtp;
      return res.status(200).json({ success: true, message: 'Job already in progress', job: safeJob });
    }

    if (![S.ASSIGNED, S.ACCEPTED, S.EN_ROUTE, S.ARRIVED].includes(state)) {
      return res.status(409).json({
        success: false,
        code: 'INVALID_TRANSITION',
        message: `Cannot start work while the job is ${state}`
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
      if (job.phone) {
        sendSMS(
          job.phone,
          `WBIPVTLTD: Your service start OTP for job ${job.jobId} is ${newOtp}. Share only with the engineer on site.`
        ).catch((e) => console.warn('[B2B OTP] SMS failed:', e.message));
      }
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
    await advanceFieldJob({
      job,
      engineerId,
      target: S.IN_PROGRESS,
      reason: 'Work started — customer OTP verified, before photos captured',
      event: 'WORK_STARTED',
      location,
      patch: {
        startedAt: now,
        startOtpVerifiedAt: now,
        beforePhotos: photos,
        startOtp: null,
        startOtpAttempts: 0,
        ...(location?.lat && location?.lng ? { startLocation: { lat: location.lat, lng: location.lng } } : {})
      }
    });

    await JobStatusTimeline.create({
      jobId: job._id,
      companyId: job.companyId,
      engineerId,
      status: 'in_progress',
      remarks: 'Work started — OTP verified, before photos captured, timer started',
      location: location ? { type: 'Point', coordinates: [location.lng || 0, location.lat || 0] } : { type: 'Point', coordinates: [0, 0] }
    });

    syncEngineerLocationSession(engineerId, { location, status: 'working', isOnline: true });

    const safeJob = await B2BJob.findById(job._id).select('-startOtp -endOtp').lean();
    res.status(200).json({
      success: true,
      message: 'Job started successfully. Work timer is running.',
      job: safeJob,
      workTimerStartedAt: now
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to start job');
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
  const walletLedger = require('../../services/b2bWalletLedger.service');
  const wallet = await walletLedger.ensureWallet(companyId, session);
  const absAmount = Math.abs(amount);

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

  // The ledger applies the balance change and writes its row together; it
  // refuses rather than letting the wallet go short.
  try {
    await walletLedger.postEntry({
      companyId,
      ledgerType: 'ADJUSTMENT',
      amount,
      jobId: job._id,
      deductionId: deduction._id,
      reason: remarks || reasonCode,
      remark: remarks || reasonCode,
      actor: { actorId: engineerId, role: 'engineer' },
      session
    });
  } catch (err) {
    if (err.name === 'WalletError' && err.code === 'INSUFFICIENT_FUNDS') {
      return {
        success: false,
        error: 'Insufficient wallet balance',
        available: err.details?.available,
        required: absAmount
      };
    }
    throw err;
  }

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

    if (lifecycleOf(job) !== S.IN_PROGRESS) {
      if (useTxn) { await session.abortTransaction(); session.endSession(); }
      return res.status(409).json({
        success: false,
        code: 'INVALID_TRANSITION',
        message: `Job must be in progress before submitting completion (currently ${lifecycleOf(job)})`
      });
    }
    // Canonical transition(s) applied after the field updates below.
    let lifecycleSteps = [];

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

      lifecycleSteps = [{
        to: S.FAILED,
        reason: `Closed incomplete: ${incompleteReason}${incompleteRemarks ? ` — ${incompleteRemarks}` : ''}`,
        event: 'WORK_FAILED'
      }];
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

      // Work done → COMPLETED, then VERIFICATION (admin QA / B2B sign-off
      // gate the escrow release, so verification is always required here).
      job.completionSubmittedAt = now;
      job.payoutStatus = 'pending_review';
      lifecycleSteps = [
        { to: S.COMPLETED, reason: 'Engineer submitted completion with after-work photos', event: 'WORK_COMPLETED' },
        { to: S.VERIFICATION, reason: 'Awaiting verification before payout', event: 'VERIFICATION_STARTED' }
      ];
    }

    await job.save(useTxn ? { session } : undefined);
    const finalJob = await transitionJobPath({
      jobId: job._id,
      actor: engineerActor(engineerId),
      session: useTxn ? session : null,
      steps: lifecycleSteps.map((st) => ({ ...st, emit: false }))
    });
    job.status = finalJob.status;
    job.trackingStatus = finalJob.trackingStatus;

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

    if (useTxn) {
      await session.commitTransaction();
      session.endSession();
    }

    if (status === 'failed') {
      // Parts still reserved for this job go back to the vendor's stock.
      require('../../services/jobParts.service').releaseJobParts(job._id, 'Job closed as failed')
        .catch((err) => console.warn('[completeB2BJob] parts release:', err.message));
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

    emitJobStatus(finalJob, {
      from: S.IN_PROGRESS,
      to: finalJob.lifecycleStatus,
      actor: engineerActor(engineerId)
    });
    if (status === 'failed') {
      const { closeAssignmentForJob } = require('../../services/jobAssignment.service');
      await closeAssignmentForJob({
        jobId: job._id,
        outcome: 'released',
        actor: engineerActor(engineerId),
        reason: `Job closed incomplete: ${incompleteReason}`
      }).catch((e) => console.warn('[completeB2BJob] assignment close:', e.message));
    }
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
    return sendJobError(res, error, 'Failed to submit job completion');
  }
};
