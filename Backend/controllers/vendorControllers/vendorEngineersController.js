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
    status: { $in: ['assigned', 'in_progress', 'travelling', 'arrived'] }
  })
    .select('jobId service clientName companyName status trackingStatus priority address scheduledDate')
    .lean();

  if (b2bJob) {
    return {
      id: b2bJob._id,
      jobCode: b2bJob.jobId,
      type: 'b2b_job',
      source: 'B2B Job',
      title: `${b2bJob.clientName || b2bJob.companyName || 'B2B Client'} - ${b2bJob.service || 'Job'}`,
      service: b2bJob.service || 'B2B Service',
      status: b2bJob.trackingStatus || b2bJob.status,
      priority: b2bJob.priority || 'medium',
      location: b2bJob.address?.city || b2bJob.address?.fullAddress || '',
      date: b2bJob.scheduledDate
    };
  }

  // 3. Check Booking
  const booking = await Booking.findOne({
    vendor: vendorId,
    engineer: { $in: ids },
    status: { $in: ['assigned', 'journey_started', 'in_progress', 'service_started'] }
  })
    .select('bookingId serviceName status date timeSlot address')
    .lean();

  if (booking) {
    return {
      id: booking._id,
      jobCode: booking.bookingId || `BK-${booking._id.toString().slice(-6)}`,
      type: 'booking',
      source: 'Client Booking',
      title: booking.serviceName || 'Direct Booking',
      service: booking.serviceName || 'Service',
      status: booking.status,
      priority: 'normal',
      location: booking.address?.city || booking.address?.fullAddress || '',
      date: booking.date
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
          rating: eng.rating || 4.5,
          performanceScore: eng.performanceScore || 85,
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
          totalAssigned: recentHistory.length,
          completedCount: recentHistory.filter((h) => h.status === 'completed').length,
          rating: eng.rating || 4.5,
          score: eng.performanceScore || 85
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
        status: { $in: ['accepted', 'assigned', 'searching_engineer'] }
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select('jobId service clientName companyName status trackingStatus priority address scheduledDate assignedToName')
        .lean(),

      // 3. Booking: accepted/assigned
      Booking.find({
        vendor: vendorId,
        status: { $in: ['accepted', 'assigned'] }
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select('bookingId serviceName status date timeSlot address')
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
        title: `${j.clientName || j.companyName || 'B2B Client'} - ${j.service || 'Job'}`,
        service: j.service || 'B2B Service',
        status: j.trackingStatus || j.status,
        priority: j.priority || 'medium',
        location: j.address?.city || j.address?.fullAddress || 'Site Location',
        date: j.scheduledDate,
        currentlyAssignedTo: j.assignedToName || null
      })),
      ...bookings.map((j) => ({
        id: j._id,
        jobType: 'booking',
        source: 'Client Booking',
        jobCode: j.bookingId || `BK-${j._id.toString().slice(-6)}`,
        title: j.serviceName || 'Direct Booking',
        service: j.serviceName || 'Service',
        status: j.status,
        priority: 'normal',
        location: j.address?.city || j.address?.fullAddress || 'Client Address',
        date: j.date,
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

    // 2. Handle B2BJob
    if (jobType === 'b2b_job' || !jobType) {
      const b2bJob = await B2BJob.findOne({ _id: jobObjId, assignedVendorId: vid });
      if (b2bJob) {
        b2bJob.assignedTo = targetEngineerId;
        b2bJob.assignedToName = engineerName;
        b2bJob.assignmentType = 'vendor_engineer';
        b2bJob.status = 'assigned';
        b2bJob.trackingStatus = 'assigned';
        b2bJob.assignedAt = new Date();
        await b2bJob.save();

        workforceEng.availability = 'on_project';
        workforceEng.todayTask = b2bJob.service || 'B2B Job Execution';
        await workforceEng.save();

        try {
          const io = getIO();
          if (io) {
            io.to(`engineer:${targetEngineerId.toString()}`).emit('b2b:job_assigned', {
              jobId: b2bJob._id,
              jobCode: b2bJob.jobId,
              service: b2bJob.service
            });
            if (b2bJob.companyId) {
              io.to(`b2b:${b2bJob.companyId.toString()}`).emit('b2b:jobStatusUpdated', {
                jobId: b2bJob._id,
                status: 'assigned',
                engineerName
              });
            }
            io.to(`vendor:${vid.toString()}`).emit('engineer:assigned', {
              engineerId: workforceEng._id,
              jobId: b2bJob._id
            });
          }
        } catch (_) {}

        return res.status(200).json({
          success: true,
          message: `B2B Job ${b2bJob.jobId} assigned to ${engineerName} successfully`,
          data: b2bJob
        });
      }
    }

    // 3. Handle Booking
    if (jobType === 'booking' || !jobType) {
      const booking = await Booking.findOne({ _id: jobObjId, vendor: vid });
      if (booking) {
        booking.engineer = targetEngineerId;
        booking.status = 'assigned';
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
    console.error('assignJobToEngineer error:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign job to engineer' });
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

    if (action === 'suspend') eng.status = 'suspended';
    else if (action === 'activate') eng.status = 'active';
    else if (action === 'deactivate') eng.status = 'deactivated';

    if (status) eng.status = status;
    if (availability) eng.availability = availability;

    await eng.save();

    return res.status(200).json({
      success: true,
      message: `Engineer status updated successfully`,
      data: eng
    });
  } catch (error) {
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
