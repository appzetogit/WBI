const mongoose = require('mongoose');
const VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
const VendorWorkforceLeave = require('../../models/VendorWorkforceLeave');
const VendorOpsJob = require('../../models/VendorOpsJob');
const VendorOpsProject = require('../../models/VendorOpsProject');
const B2BJob = require('../../models/B2BJob');
const Booking = require('../../models/Booking');
const Engineer = require('../../models/Engineer');
const Vendor = require('../../models/Vendor');
const { syncLinkedEngineers } = require('../../services/vendorWorkforceSync.service');
const { getIO } = require('../../sockets');

const getVendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);

/**
 * Ensures linked engineers are synchronized from Engineer -> VendorWorkforceEngineer
 */
const ensureSynced = async (vendorId) => {
  try {
    await syncLinkedEngineers(vendorId);
  } catch (err) {
    console.warn('[vendorEngineers sync error]:', err.message);
  }
};

/**
 * Finds the current active job for an engineer across VendorOpsJob, B2BJob, and Booking
 */
const findActiveJobForEngineer = async (vendorId, engineerDocId, linkedEngineerId) => {
  const ids = [engineerDocId, linkedEngineerId].filter(Boolean);
  if (!ids.length) return null;

  // 1. Check VendorOpsJob
  const opsJob = await VendorOpsJob.findOne({
    vendorId,
    engineerId: { $in: ids },
    status: { $in: ['pending_acceptance', 'accepted', 'in_progress', 'on_site', 'en_route'] }
  })
    .select('title jobCode status priority category service scheduledAt clientLocation createdAt')
    .lean();

  if (opsJob) {
    return {
      id: opsJob._id,
      jobCode: opsJob.jobCode || `OPS-${opsJob._id.toString().slice(-6)}`,
      type: 'ops_job',
      source: 'User Project',
      title: opsJob.title || 'User Project Job',
      service: opsJob.service || opsJob.category || 'Service Request',
      status: opsJob.status,
      priority: opsJob.priority || 'normal',
      location: opsJob.clientLocation?.address || opsJob.clientLocation?.city || '',
      date: opsJob.scheduledAt || opsJob.createdAt
    };
  }

  // 2. Check B2BJob
  const b2bJob = await B2BJob.findOne({
    assignedVendorId: vendorId,
    assignedTo: { $in: ids },
    status: { $in: ['assigned', 'accepted', 'in_progress', 'travelling', 'arrived', 'revision_required', 'on_hold'] }
  })
    .select('jobId service customerName status trackingStatus lifecycleStatus priority city address preferredDate')
    .lean();

  if (b2bJob) {
    return {
      id: b2bJob._id,
      jobCode: b2bJob.jobId,
      type: 'b2b_job',
      source: 'B2B Job',
      title: `${b2bJob.customerName || 'B2B Client'} - ${b2bJob.service || 'Job'}`,
      service: b2bJob.service || 'B2B Service',
      status: b2bJob.trackingStatus || b2bJob.status,
      lifecycleStatus: b2bJob.lifecycleStatus || null,
      priority: b2bJob.priority || 'medium',
      location: b2bJob.city || '',
      date: b2bJob.preferredDate
    };
  }

  // 3. Check Booking
  const booking = await Booking.findOne({
    vendorId,
    engineerId: { $in: ids },
    status: { $in: ['assigned', 'journey_started', 'arrived', 'in_progress', 'service_started'] }
  })
    .select('bookingNumber serviceName status scheduledDate timeSlot address')
    .lean();

  if (booking) {
    return {
      id: booking._id,
      jobCode: booking.bookingNumber || `BK-${booking._id.toString().slice(-6)}`,
      type: 'booking',
      source: 'Client Booking',
      title: booking.serviceName || 'Direct Booking',
      service: booking.serviceName || 'Service',
      status: booking.status,
      priority: 'normal',
      location: booking.address?.city || '',
      date: booking.scheduledDate
    };
  }

  return null;
};

/**
 * GET /api/vendor/engineers
 * List all vendor engineers with real-time availability, active job detection, and badge counts
 */
exports.getEngineers = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureSynced(vendorId);

    const { status, search, category, page = 1, limit = 50 } = req.query;

    const baseFilter = {
      vendorId,
      demoTag: null
    };

    if (category) {
      baseFilter.serviceCategoryCode = String(category).toUpperCase();
    }

    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      baseFilter.$or = [
        { name: rx },
        { employeeId: rx },
        { role: rx },
        { primarySkill: rx },
        { 'skills.name': rx },
        { phone: rx },
        { email: rx },
        { city: rx }
      ];
    }

    const allEngineers = await VendorWorkforceEngineer.find(baseFilter)
      .sort({ updatedAt: -1 })
      .lean();

    const now = new Date();

    // Fetch active leaves for this vendor to accurately reflect leave status
    const activeLeaves = await VendorWorkforceLeave.find({
      vendorId,
      status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now },
      demoTag: null
    }).select('engineerId').lean();

    const leaveEngIds = new Set(activeLeaves.map((l) => l.engineerId.toString()));

    const linkedIds = allEngineers.map((e) => e.linkedEngineerId).filter(Boolean);
    const linkedDocs = linkedIds.length
      ? await Engineer.find({ _id: { $in: linkedIds } }).select('rating completedJobs totalJobs').lean()
      : [];
    const linkedById = new Map(linkedDocs.map((d) => [String(d._id), d]));

    // Enrich each engineer with real-time active job and calculated availability
    const enriched = await Promise.all(
      allEngineers.map(async (eng) => {
        const isOnLeave = leaveEngIds.has(eng._id.toString());
        const activeJob = await findActiveJobForEngineer(vendorId, eng._id, eng.linkedEngineerId);

        let calculatedAvailability = 'available';
        if (eng.status === 'suspended' || eng.status === 'deactivated') {
          calculatedAvailability = 'offline';
        } else if (isOnLeave) {
          calculatedAvailability = 'leave';
        } else if (activeJob) {
          calculatedAvailability = 'busy';
        }

        return {
          _id: eng._id,
          employeeId: eng.employeeId || `ENG-${eng._id.toString().slice(-4)}`,
          name: eng.name,
          photo: eng.photo || '',
          email: eng.email || '',
          phone: eng.phone || '',
          role: eng.role || 'Field Engineer',
          department: eng.department || 'Operations',
          serviceCategoryCode: eng.serviceCategoryCode || '',
          serviceCategoryName: eng.serviceCategoryName || '',
          primarySkill: eng.primarySkill || (eng.skills?.[0]?.name) || 'General',
          skills: eng.skills || [],
          experienceYears: eng.experienceYears || 0,
          certificationLevel: eng.certificationLevel || 'mid',
          // Ratings come from real customer reviews on the linked engineer
          // profile; null means "not rated yet", never an invented score.
          rating: eng.linkedEngineerId ? (linkedById.get(String(eng.linkedEngineerId))?.rating ?? null) : null,
          completedJobs: eng.linkedEngineerId ? (linkedById.get(String(eng.linkedEngineerId))?.completedJobs ?? 0) : 0,
          performanceScore: null,
          city: eng.city || '',
          currentLocation: eng.currentLocation || '',
          gps: eng.gps || null,
          status: eng.status || 'active',
          availability: calculatedAvailability,
          activeJob: activeJob || null,
          linkedEngineerId: eng.linkedEngineerId || null,
          walletBalance: eng.walletBalance || 0,
          attendanceStatus: eng.attendanceStatus || 'checked_out',
          createdAt: eng.createdAt,
          updatedAt: eng.updatedAt
        };
      })
    );

    // Compute global counts
    const counts = {
      total: enriched.length,
      available: enriched.filter((e) => e.availability === 'available' && e.status === 'active').length,
      busy: enriched.filter((e) => e.availability === 'busy').length,
      onLeave: enriched.filter((e) => e.availability === 'leave').length,
      offline: enriched.filter((e) => e.availability === 'offline' || e.status !== 'active').length
    };

    // Filter by tab/status if requested
    let filtered = enriched;
    if (status && status !== 'all') {
      if (status === 'available') {
        filtered = enriched.filter((e) => e.availability === 'available' && e.status === 'active');
      } else if (status === 'busy') {
        filtered = enriched.filter((e) => e.availability === 'busy');
      } else if (status === 'leave') {
        filtered = enriched.filter((e) => e.availability === 'leave');
      } else if (status === 'offline') {
        filtered = enriched.filter((e) => e.availability === 'offline' || e.status !== 'active');
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      counts,
      data: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filtered.length,
        pages: Math.ceil(filtered.length / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('getEngineers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch engineers' });
  }
};

/**
 * GET /api/vendor/engineers/:id
 * Get full detailed profile, skills breakdown, active job details, and recent work history
 */
exports.getEngineerDetails = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Engineer ID' });
    }

    const engObjId = new mongoose.Types.ObjectId(id);

    // Look in VendorWorkforceEngineer first
    let eng = await VendorWorkforceEngineer.findOne({
      _id: engObjId,
      vendorId,
      demoTag: null
    }).lean();

    // Fallback: look up by linkedEngineerId
    if (!eng) {
      eng = await VendorWorkforceEngineer.findOne({
        linkedEngineerId: engObjId,
        vendorId,
        demoTag: null
      }).lean();
    }

    if (!eng) {
      return res.status(404).json({ success: false, message: 'Engineer not found in your workforce' });
    }

    // Also pull linked Engineer record if available for rich verification & registration details
    let linkedData = null;
    if (eng.linkedEngineerId) {
      linkedData = await Engineer.findById(eng.linkedEngineerId)
        .select('phone whatsappNumber address documents emergencyContactNumber registrationType experienceLevel totalExperienceYears rating totalJobs completedJobs')
        .lean();
    }

    const now = new Date();
    const isOnLeave = await VendorWorkforceLeave.exists({
      vendorId,
      engineerId: eng._id,
      status: 'approved',
      startDate: { $lte: now },
      endDate: { $gte: now },
      demoTag: null
    });

    const activeJob = await findActiveJobForEngineer(vendorId, eng._id, eng.linkedEngineerId);

    let calculatedAvailability = 'available';
    if (eng.status === 'suspended' || eng.status === 'deactivated') {
      calculatedAvailability = 'offline';
    } else if (isOnLeave) {
      calculatedAvailability = 'leave';
    } else if (activeJob) {
      calculatedAvailability = 'busy';
    }

    // Fetch recent completed or historical jobs
    const ids = [eng._id, eng.linkedEngineerId].filter(Boolean);
    const [recentOps, recentB2B] = await Promise.all([
      VendorOpsJob.find({ vendorId, engineerId: { $in: ids } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('title jobCode status priority service scheduledAt createdAt completedAt')
        .lean(),
      B2BJob.find({ assignedVendorId: vendorId, assignedTo: { $in: ids } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('jobId service clientName companyName status trackingStatus completedAt createdAt')
        .lean()
    ]);

    const recentHistory = [
      ...recentOps.map((j) => ({
        id: j._id,
        code: j.jobCode || `OPS-${j._id.toString().slice(-6)}`,
        title: j.title || 'User Project Job',
        source: 'User Project',
        status: j.status,
        date: j.completedAt || j.updatedAt || j.createdAt
      })),
      ...recentB2B.map((j) => ({
        id: j._id,
        code: j.jobId,
        title: `${j.clientName || j.companyName || 'B2B Client'} - ${j.service || 'Job'}`,
        source: 'B2B Job',
        status: j.trackingStatus || j.status,
        date: j.completedAt || j.updatedAt || j.createdAt
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

    return res.status(200).json({
      success: true,
      data: {
        ...eng,
        availability: calculatedAvailability,
        activeJob,
        linkedData,
        recentHistory,
        stats: {
          totalAssigned: (await B2BJob.countDocuments({ assignedVendorId: vendorId, assignedTo: { $in: ids } })) +
            (await VendorOpsJob.countDocuments({ vendorId, engineerId: { $in: ids } })),
          completedCount: (await B2BJob.countDocuments({ assignedVendorId: vendorId, assignedTo: { $in: ids }, status: { $in: ['completed', 'closed'] } })) +
            (await VendorOpsJob.countDocuments({ vendorId, engineerId: { $in: ids }, status: 'completed' })),
          rating: linkedData?.rating ?? null,
          score: null
        }
      }
    });
  } catch (error) {
    console.error('getEngineerDetails error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch engineer details' });
  }
};

/**
 * GET /api/vendor/engineers/assignable-jobs
 * Fetches all accepted, unassigned (or reassignable) jobs across User Projects, B2B Jobs, and Bookings
 */
exports.getAssignableJobs = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { search } = req.query;

    const [opsJobs, b2bJobs, bookings] = await Promise.all([
      // 1. VendorOpsJob: accepted or pending assignment
      VendorOpsJob.find({
        vendorId,
        status: { $in: ['accepted', 'pending_acceptance'] }
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select('title jobCode status priority category service scheduledAt clientLocation createdAt engineerName')
        .lean(),

      // 2. B2BJob: accepted by vendor or looking for engineer
      B2BJob.find({
        assignedVendorId: vendorId,
        lifecycleStatus: { $in: ['PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ON_HOLD'] }
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select('jobId service customerName status lifecycleStatus trackingStatus priority city preferredDate assignedToName')
        .lean(),

      // 3. Booking: accepted/assigned
      Booking.find({
        vendorId,
        status: { $in: ['accepted', 'confirmed', 'scheduled', 'assigned'] }
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select('bookingNumber serviceName status scheduledDate timeSlot address')
        .lean()
    ]);

    let list = [
      ...opsJobs.map((j) => ({
        id: j._id,
        jobType: 'ops_job',
        source: 'User Project',
        jobCode: j.jobCode || `OPS-${j._id.toString().slice(-6)}`,
        title: j.title || 'User Project Job',
        service: j.service || j.category || 'General Service',
        status: j.status,
        priority: j.priority || 'normal',
        location: j.clientLocation?.city || j.clientLocation?.address || 'Site Location',
        date: j.scheduledAt || j.createdAt,
        currentlyAssignedTo: j.engineerName || null
      })),
      ...b2bJobs.map((j) => ({
        id: j._id,
        jobType: 'b2b_job',
        source: 'B2B Job',
        jobCode: j.jobId,
        title: `${j.customerName || 'B2B Client'} - ${j.service || 'Job'}`,
        service: j.service || 'B2B Service',
        status: j.trackingStatus || j.status,
        lifecycleStatus: j.lifecycleStatus,
        priority: j.priority || 'medium',
        location: j.city || 'Site Location',
        date: j.preferredDate,
        currentlyAssignedTo: j.assignedToName || null
      })),
      ...bookings.map((j) => ({
        id: j._id,
        jobType: 'booking',
        source: 'Client Booking',
        jobCode: j.bookingNumber || `BK-${j._id.toString().slice(-6)}`,
        title: j.serviceName || 'Direct Booking',
        service: j.serviceName || 'Service',
        status: j.status,
        priority: 'normal',
        location: j.address?.city || 'Client Address',
        date: j.scheduledDate,
        currentlyAssignedTo: null
      }))
    ];

    if (search?.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      list = list.filter((j) => rx.test(j.title) || rx.test(j.jobCode) || rx.test(j.service) || rx.test(j.location));
    }

    return res.status(200).json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('getAssignableJobs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch assignable jobs' });
  }
};

/**
 * POST /api/vendor/engineers/:id/assign-job
 * Assigns an eligible job to this engineer
 */
exports.assignJobToEngineer = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { jobId, jobType, notes = '', priority } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Valid Engineer ID and Job ID are required' });
    }

    const engObjId = new mongoose.Types.ObjectId(id);
    const jobObjId = new mongoose.Types.ObjectId(jobId);

    // Verify engineer belongs to vendor workforce
    let workforceEng = await VendorWorkforceEngineer.findOne({
      _id: engObjId,
      vendorId: vid,
      demoTag: null
    });

    if (!workforceEng) {
      workforceEng = await VendorWorkforceEngineer.findOne({
        linkedEngineerId: engObjId,
        vendorId: vid,
        demoTag: null
      });
    }

    if (!workforceEng) {
      return res.status(403).json({ success: false, message: 'Engineer does not belong to your workforce' });
    }

    if (workforceEng.status === 'suspended' || workforceEng.status === 'deactivated') {
      return res.status(400).json({ success: false, message: 'Cannot assign job to a suspended or inactive engineer' });
    }

    const targetEngineerId = workforceEng.linkedEngineerId || workforceEng._id;
    const engineerName = workforceEng.name;

    // 1. Handle VendorOpsJob
    if (jobType === 'ops_job' || !jobType) {
      const opsJob = await VendorOpsJob.findOne({ _id: jobObjId, vendorId: vid });
      if (opsJob) {
        opsJob.engineerId = targetEngineerId;
        opsJob.engineerName = engineerName;
        opsJob.status = 'pending_acceptance';
        opsJob.assignedAt = new Date();
        if (notes) opsJob.notes = notes;
        if (priority) opsJob.priority = priority;
        await opsJob.save();

        await VendorOpsProject.updateOne(
          { _id: opsJob.projectId },
          {
            $set: {
              'assignedEngineers.0.engineerId': targetEngineerId,
              'assignedEngineers.0.name': engineerName,
              'assignedEngineers.0.status': 'assigned',
              currentStage: 'Engineer Assigned'
            }
          }
        ).catch(() => {});

        workforceEng.availability = 'on_project';
        workforceEng.todayTask = opsJob.title || 'Assigned Job';
        await workforceEng.save();

        try {
          const io = getIO();
          if (io) {
            io.to(`engineer:${targetEngineerId.toString()}`).emit('ops:job_assigned', {
              jobId: opsJob._id,
              jobCode: opsJob.jobCode,
              title: opsJob.title,
              vendorId: vid
            });
            io.to(`vendor:${vid.toString()}`).emit('engineer:assigned', {
              engineerId: workforceEng._id,
              jobId: opsJob._id
            });
          }
        } catch (_) {}

        return res.status(200).json({
          success: true,
          message: `Job ${opsJob.jobCode || ''} assigned to ${engineerName} successfully`,
          data: opsJob
        });
      }
    }

    // 2. Handle B2BJob — central assignment service (eligibility + history)
    if (jobType === 'b2b_job' || !jobType) {
      const b2bJob = await B2BJob.findOne({ _id: jobObjId, assignedVendorId: vid }).select('assignedTo').lean();
      if (b2bJob) {
        if (!workforceEng.linkedEngineerId) {
          return res.status(422).json({ success: false, message: 'This roster entry is not linked to an engineer account' });
        }
        const svc = require('../../services/jobAssignment.service');
        const actor = { id: vid, role: 'vendor' };
        const result = b2bJob.assignedTo
          ? await svc.reassignEngineer({ jobId: jobObjId, newEngineerId: workforceEng.linkedEngineerId, actor, vendorScopeId: vid, reason: req.body?.reason || notes })
          : await svc.assignEngineer({ jobId: jobObjId, engineerId: workforceEng.linkedEngineerId, actor, vendorScopeId: vid, reason: notes || 'Assigned by vendor' });
        return res.status(200).json({
          success: true,
          message: `B2B Job ${result.job.jobId} assigned to ${engineerName} successfully`,
          data: result.job,
          eligibility: result.eligibility
        });
      }
    }

    // 3. Handle Booking
    if (jobType === 'booking' || !jobType) {
      const booking = await Booking.findOne({ _id: jobObjId, vendorId: vid });
      if (booking) {
        if (!['accepted', 'confirmed', 'scheduled', 'assigned'].includes(booking.status)) {
          return res.status(409).json({ success: false, message: `A booking in status "${booking.status}" cannot be assigned` });
        }
        booking.engineerId = targetEngineerId;
        booking.status = 'assigned';
        booking.assignedAt = new Date();
        await booking.save();

        workforceEng.availability = 'on_project';
        await workforceEng.save();

        try {
          const io = getIO();
          if (io) {
            io.to(`engineer:${targetEngineerId.toString()}`).emit('booking:assigned', {
              bookingId: booking._id,
              serviceName: booking.serviceName
            });
            io.to(`vendor:${vid.toString()}`).emit('engineer:assigned', {
              engineerId: workforceEng._id,
              jobId: booking._id
            });
          }
        } catch (_) {}

        return res.status(200).json({
          success: true,
          message: `Booking assigned to ${engineerName} successfully`,
          data: booking
        });
      }
    }

    return res.status(404).json({ success: false, message: 'Eligible job not found for assignment' });
  } catch (error) {
    const { sendJobError } = require('../../services/jobScope.service');
    return sendJobError(res, error, 'Failed to assign job to engineer');
  }
};

/**
 * PATCH /api/vendor/engineers/:id/status
 * Updates engineer status (active/suspended) or manual availability
 */
exports.updateEngineerStatus = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { action, status, availability } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Engineer ID' });
    }

    const eng = await VendorWorkforceEngineer.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendorId: vid,
      demoTag: null
    });

    if (!eng) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    const requested = action || ({ active: 'activate', suspended: 'suspend', deactivated: 'deactivate' })[status];
    if (requested && !['activate', 'suspend', 'deactivate'].includes(requested)) {
      return res.status(400).json({ success: false, message: 'action must be activate, suspend or deactivate' });
    }
    const ROSTER_AVAILABILITY = ['available', 'busy', 'on_project', 'traveling', 'leave', 'offline'];
    if (availability && !ROSTER_AVAILABILITY.includes(availability)) {
      return res.status(400).json({ success: false, message: `availability must be one of ${ROSTER_AVAILABILITY.join(', ')}` });
    }

    if (requested && eng.linkedEngineerId) {
      // Real engineers go through the team rules routing relies on (no
      // deactivation while holding a job, WBI suspensions stay WBI's).
      const { setTeamActive } = require('../../services/vendorEngineers.service');
      await setTeamActive({
        vid,
        engineerId: eng.linkedEngineerId,
        active: requested === 'activate',
        mode: requested === 'suspend' ? 'suspended' : 'deactivated',
        reason: req.body?.reason || `${requested === 'suspend' ? 'Suspended' : 'Deactivated'} from the roster`,
        actor: { id: vid, role: 'vendor' }
      });
    } else if (requested) {
      eng.status = requested === 'activate' ? 'active' : requested === 'suspend' ? 'suspended' : 'deactivated';
    }
    if (availability) eng.availability = availability;
    // Only paths changed on this instance are written, so a team status set
    // above by setTeamActive is not overwritten here.
    if (eng.isModified()) await eng.save();

    return res.status(200).json({
      success: true,
      message: `Engineer status updated successfully`,
      data: await VendorWorkforceEngineer.findById(eng._id).lean()
    });
  } catch (error) {
    if (Number.isInteger(error.status) && error.status < 500) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) });
    }
    console.error('updateEngineerStatus error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update engineer status' });
  }
};

/**
 * POST /api/vendor/engineers/sync
 * Manually trigger workforce sync with linked engineers
 */
exports.syncEngineers = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const result = await syncLinkedEngineers(vid);
    return res.status(200).json({ success: true, message: 'Engineers synced successfully', data: result });
  } catch (error) {
    console.error('syncEngineers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to sync engineers' });
  }
};

const PHONE_RX = /^[6-9][0-9]{9}$/;
const cleanList = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((s) => String(s).trim())
  .filter(Boolean)
  .slice(0, 30);

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Working days as full day names; unknown values are refused, not stored. */
const cleanDays = (v) => {
  const days = cleanList(v).map((d) => DAY_NAMES.find((n) => n.toLowerCase().startsWith(d.toLowerCase().slice(0, 3))));
  if (days.some((d) => !d)) {
    const err = new Error('workingDays must be day names (Monday … Sunday)');
    err.status = 400;
    throw err;
  }
  return DAY_NAMES.filter((d) => days.includes(d));
};
/** "18:30" or "06:30 PM" → "06:30 PM" (the stored format). */
const toClock = (v) => {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) < 60) return `${m[1].padStart(2, '0')}:${m[2]} ${m[3].toUpperCase()}`;
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
    const h = Number(m[1]);
    return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }
  const err = new Error('Working hours must be times like 09:00 or 06:30 PM');
  err.status = 400;
  throw err;
};
/** Schedule fields from a request body (only those present). */
const scheduleFrom = (b) => {
  const out = {};
  if (b.workingDays !== undefined) out.workingDays = cleanDays(b.workingDays);
  if (b.workingHours !== undefined && b.workingHours !== null) {
    out.workingHours = { start: toClock(b.workingHours.start), end: toClock(b.workingHours.end) };
  }
  if (b.emergencyService !== undefined) out.emergencyService = Boolean(b.emergencyService);
  if (b.experienceYears !== undefined) out.totalExperienceYears = Math.min(60, Math.max(0, Number(b.experienceYears) || 0));
  return out;
};

/**
 * POST /api/vendor/engineers
 * Add an engineer to this vendor. The engineer is linked to the vendor and
 * vendor-approved, but stays PENDING until WBI verifies their documents —
 * routing never offers work to an unverified engineer.
 */
exports.createEngineer = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const phone = String(b.phone || '').replace(/[^0-9]/g, '').slice(-10);
    if (name.length < 2) return res.status(400).json({ success: false, message: 'Engineer name is required' });
    if (!PHONE_RX.test(phone)) return res.status(400).json({ success: false, message: 'A valid 10-digit mobile number is required' });
    const email = b.email ? String(b.email).trim().toLowerCase() : undefined;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Email is invalid' });
    }
    const skills = cleanList(b.skills);
    if (!skills.length) return res.status(400).json({ success: false, message: 'At least one skill / service is required' });

    const existing = await Engineer.findOne({ $or: [{ phone }, ...(email ? [{ email }] : [])] }).select('vendorId').lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: String(existing.vendorId || '') === String(vid)
          ? 'This engineer is already in your team'
          : 'An engineer account already exists for this phone/email. Share your company invite link so they can join your team.'
      });
    }

    const cities = cleanList(b.cities);
    const city = b.city ? String(b.city).trim() : cities[0] || '';
    if (!city) return res.status(400).json({ success: false, message: 'A base city is required so routing knows where the engineer works' });
    const schedule = scheduleFrom(b);
    const engineer = await Engineer.create({
      name,
      phone,
      ...(email ? { email } : {}),
      roleType: 'Engineer',
      engineerType: 'vendor_engineer',
      registrationType: 'Company / Firm Employee',
      vendorId: vid,
      vendorApprovalStatus: 'approved',
      approvalStatus: 'pending',
      verificationStatus: 'pending',
      isActive: true,
      primarySkill: skills[0],
      secondarySkills: skills.slice(1),
      serviceCategories: cleanList(b.serviceCategories).length ? cleanList(b.serviceCategories) : skills,
      address: { city },
      workLocations: {
        primaryArea: city,
        availableCities: cities,
        serviceRadius: Math.min(200, Math.max(1, Number(b.serviceRadiusKm) || 10))
      },
      workingDays: [],
      ...schedule
    });

    await syncLinkedEngineers(vid).catch(() => {});
    const { logAudit } = require('../../utils/auditLogger');
    await logAudit({
      actionType: 'VENDOR_ENGINEER_ADDED',
      eventMessage: `Vendor ${vid} added engineer ${engineer.name}`,
      actorId: vid,
      actorRole: 'vendor',
      targetId: engineer._id,
      targetType: 'Engineer',
      changes: { name, phone, skills }
    });

    return res.status(201).json({
      success: true,
      message: 'Engineer added. They can start receiving jobs once WBI verifies their documents.',
      data: { id: String(engineer._id), name: engineer.name, phone: engineer.phone, status: 'PENDING' }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'An engineer with this phone or email already exists' });
    }
    if (error?.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('createEngineer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add engineer' });
  }
};

/**
 * PATCH /api/vendor/engineers/:id
 * Update the operational profile of one of THIS vendor's engineers:
 * skills, coverage and working days. Identity fields are locked once WBI
 * has verified the engineer.
 */
exports.updateEngineerProfile = async (req, res) => {
  try {
    const vid = getVendorId(req);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid engineer id' });
    }
    // Accept an Engineer id or this vendor's roster id.
    let engineer = await Engineer.findById(req.params.id);
    if (!engineer) {
      const roster = await VendorWorkforceEngineer.findOne({ _id: req.params.id, vendorId: vid }).select('linkedEngineerId').lean();
      if (roster?.linkedEngineerId) engineer = await Engineer.findById(roster.linkedEngineerId);
    }
    if (!engineer) return res.status(404).json({ success: false, message: 'Engineer not found' });
    if (String(engineer.vendorId || '') !== String(vid)) {
      return res.status(403).json({ success: false, message: 'This engineer does not belong to your organisation' });
    }

    const b = req.body || {};
    const changes = {};
    if (b.skills !== undefined) {
      const skills = cleanList(b.skills);
      if (!skills.length) return res.status(400).json({ success: false, message: 'At least one skill is required' });
      engineer.primarySkill = skills[0];
      engineer.secondarySkills = skills.slice(1);
      // Same rule as create: without explicit categories the skill list is the
      // service list, so removing a skill also stops matching jobs for it.
      if (b.serviceCategories === undefined) engineer.serviceCategories = skills;
      changes.skills = skills;
    }
    if (b.serviceCategories !== undefined) {
      engineer.serviceCategories = cleanList(b.serviceCategories);
      changes.serviceCategories = engineer.serviceCategories;
    }
    if (b.cities !== undefined || b.serviceRadiusKm !== undefined || b.city !== undefined) {
      if (b.cities !== undefined) engineer.set('workLocations.availableCities', cleanList(b.cities));
      if (b.city !== undefined) {
        engineer.set('workLocations.primaryArea', String(b.city).trim());
        engineer.set('address.city', String(b.city).trim());
      }
      if (b.serviceRadiusKm !== undefined) {
        engineer.set('workLocations.serviceRadius', Math.min(200, Math.max(1, Number(b.serviceRadiusKm) || 10)));
      }
      changes.coverage = {
        cities: engineer.workLocations?.availableCities,
        city: engineer.workLocations?.primaryArea,
        radiusKm: engineer.workLocations?.serviceRadius
      };
    }
    const schedule = scheduleFrom(b);
    Object.entries(schedule).forEach(([k, v]) => {
      engineer.set(k, v);
      changes[k] = v;
    });
    if (b.name !== undefined || b.email !== undefined) {
      if (engineer.approvalStatus === 'approved') {
        return res.status(409).json({ success: false, message: 'Name and email of a verified engineer can only be changed by WBI support' });
      }
      if (b.name !== undefined) engineer.name = String(b.name).trim();
      if (b.email !== undefined) engineer.email = String(b.email).trim().toLowerCase() || undefined;
      changes.identity = { name: engineer.name, email: engineer.email };
    }
    if (!Object.keys(changes).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }
    await engineer.save();
    await syncLinkedEngineers(vid).catch(() => {});

    const { logAudit } = require('../../utils/auditLogger');
    await logAudit({
      actionType: 'VENDOR_ENGINEER_UPDATED',
      eventMessage: `Vendor ${vid} updated engineer ${engineer.name}`,
      actorId: vid,
      actorRole: 'vendor',
      targetId: engineer._id,
      targetType: 'Engineer',
      changes
    });
    return res.status(200).json({ success: true, message: 'Engineer updated', data: { id: String(engineer._id), ...changes } });
  } catch (error) {
    if (error?.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('updateEngineerProfile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update engineer' });
  }
};
