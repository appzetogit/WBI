const mongoose = require('mongoose');
const VendorOpsProject = require('../../models/VendorOpsProject');
const VendorOpsJob = require('../../models/VendorOpsJob');
const B2BJob = require('../../models/B2BJob');
const Booking = require('../../models/Booking');
const Opportunity = require('../../models/Opportunity');
const ServiceRequest = require('../../models/ServiceRequest');
const VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
const Engineer = require('../../models/Engineer');
const VendorQualityProof = require('../../models/VendorQualityProof');
const { getIO } = require('../../sockets');

const getVendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);

/**
 * Normalizes status across different underlying models into the standard 7-stage lifecycle:
 * 'new' | 'accepted' | 'assigned' | 'dispatched' | 'en_route' | 'in_progress' | 'completed' | 'cancelled'
 */
const normalizeJobStatus = (itemType, item) => {
  if (itemType === 'ops_job') {
    const s = item.status;
    if (s === 'pending_acceptance') return 'assigned';
    if (s === 'accepted') return 'accepted';
    if (s === 'en_route') return 'en_route';
    if (s === 'on_site') return 'in_progress';
    if (s === 'in_progress') return 'in_progress';
    if (s === 'completed') return 'completed';
    if (s === 'rejected' || s === 'cancelled') return 'cancelled';
    return 'accepted';
  }

  if (itemType === 'ops_project') {
    const s = item.status;
    if (s === 'draft' || s === 'planning') {
      return item.assignedEngineers?.length ? 'assigned' : 'accepted';
    }
    if (s === 'in_progress') return 'in_progress';
    if (s === 'completed') return 'completed';
    if (s === 'on_hold' || s === 'at_risk') return 'in_progress';
    return 'accepted';
  }

  if (itemType === 'b2b_job') {
    const s = item.status;
    const ts = item.trackingStatus;
    if (s === 'completed' || s === 'closed' || s === 'completion_submitted' || ts === 'completed') return 'completed';
    if (s === 'in_progress' || ts === 'work_started' || s === 'arrived' || ts === 'reached_location') return 'in_progress';
    if (s === 'travelling' || ts === 'en_route') return 'en_route';
    // 'assigned' status (vendor explicitly assigned an engineer) and a
    // self-accept that already carries an engineer both mean "someone is
    // lined up but hasn't started traveling yet" — that is what "Dispatched"
    // is for. Previously nothing ever produced 'dispatched', so that tab
    // was permanently stuck at 0 regardless of real data.
    if (s === 'assigned') return 'dispatched';
    if (s === 'accepted') return item.assignedTo ? 'dispatched' : 'accepted';
    // Freshly offered to engineers/vendors (wave dispatch just started) and
    // nobody has acted on it yet — this is a live, pending request, not
    // something already "accepted".
    if (ts === 'assigned' && !item.assignedTo) return 'new';
    if (['pending', 'searching_engineer'].includes(s)) return 'new';
    if (['cancelled', 'rejected', 'failed'].includes(s)) return 'cancelled';
    return 'accepted';
  }

  if (itemType === 'booking') {
    const s = item.status;
    if (['completed', 'closed', 'work_done', 'paid'].includes(s)) return 'completed';
    if (['in_progress', 'service_started', 'arrived', 'visited'].includes(s)) return 'in_progress';
    if (['journey_started'].includes(s)) return 'en_route';
    if (['assigned', 'worker_assigned'].includes(s)) return 'assigned';
    if (['accepted', 'confirmed', 'scheduled'].includes(s)) return 'accepted';
    if (['pending', 'requested', 'searching'].includes(s)) return 'new';
    if (['cancelled', 'rejected'].includes(s)) return 'cancelled';
    return 'accepted';
  }

  return 'accepted';
};

/**
 * Builds chronological timeline stages for the job
 */
const buildJobTimeline = (normalizedStatus, item, itemType) => {
  const STAGES = [
    { key: 'new', label: 'New Request' },
    { key: 'accepted', label: 'Vendor Accepted' },
    { key: 'assigned', label: 'Engineer Assigned' },
    { key: 'dispatched', label: 'Dispatched' },
    { key: 'en_route', label: 'En Route' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' }
  ];

  const order = ['new', 'accepted', 'assigned', 'dispatched', 'en_route', 'in_progress', 'completed'];
  const curIdx = order.indexOf(normalizedStatus);

  return STAGES.map((st, i) => {
    let timestamp = null;
    if (st.key === 'new') timestamp = item.createdAt || item.date;
    if (st.key === 'accepted') timestamp = item.acceptedAt || item.createdAt;
    if (st.key === 'assigned') timestamp = item.assignedAt || (item.assignedTo ? item.updatedAt : null);
    if (st.key === 'dispatched') timestamp = item.assignedAt || item.updatedAt;
    if (st.key === 'en_route') timestamp = item.travelStartedAt || item.journeyStartedAt || null;
    if (st.key === 'in_progress') timestamp = item.startedAt || item.startOtpVerifiedAt || null;
    if (st.key === 'completed') timestamp = item.completedAt || item.completionSubmittedAt || null;

    return {
      key: st.key,
      label: st.label,
      completed: curIdx !== -1 && i < curIdx,
      current: curIdx !== -1 && i === curIdx,
      upcoming: curIdx === -1 || i > curIdx,
      timestamp
    };
  });
};

/**
 * GET /api/vendor/my-jobs
 * Comprehensive aggregation across VendorOpsJobs/Projects, B2BJobs, and Bookings
 */
exports.getMyJobs = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const {
      source = 'all', // 'all' | 'user' | 'b2b'
      status = 'all', // 'all' | 'new' | 'accepted' | 'assigned' | 'dispatched' | 'en_route' | 'in_progress' | 'completed'
      search = '',
      priority = '',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // ── 1. Fetch Vendor Ops Projects & Jobs ──
    const [opsProjects, opsJobs, b2bJobs, directBookings] = await Promise.all([
      VendorOpsProject.find({ vendorId: vid })
        .populate('assignedEngineers.engineerId', 'name phone email avatar skills')
        .sort({ updatedAt: -1 })
        .lean()
        .catch(() => []),

      VendorOpsJob.find({ vendorId: vid })
        .populate('engineerId', 'name phone email avatar skills')
        .populate('projectId', 'projectCode title budget clientName city status')
        .sort({ updatedAt: -1 })
        .lean()
        .catch(() => []),

      B2BJob.find({ assignedVendorId: vid })
        .populate('companyId', 'companyName name')
        .populate('assignedTo', 'name phone email avatar skills')
        .sort({ updatedAt: -1 })
        .lean()
        .catch(() => []),

      Booking.find({ vendorId: vid })
        .populate('engineerId', 'name phone email avatar skills')
        .populate('workerId', 'name phone avatar')
        .sort({ updatedAt: -1 })
        .lean()
        .catch(() => [])
    ]);

    // ── 2. Unified Item Transformation ──
    let unifiedJobs = [];

    // Transform VendorOpsJob / VendorOpsProject
    // Prioritize concrete OpsJobs, fall back to parent Project if no sub-jobs
    const projectIdsWithJobs = new Set(opsJobs.map((j) => j.projectId?._id?.toString() || j.projectId?.toString()).filter(Boolean));

    opsJobs.forEach((job) => {
      const normStatus = normalizeJobStatus('ops_job', job);
      const isUser = job.projectId?.clientType === 'individual' || !job.projectId?.clientType;
      
      unifiedJobs.push({
        id: job._id.toString(),
        jobCode: job.jobCode || `JOB-${job._id.toString().slice(-6).toUpperCase()}`,
        rawId: job._id,
        itemType: 'ops_job',
        source: isUser ? 'USER PROJECT' : 'B2B JOB',
        sourceType: isUser ? 'user' : 'b2b',
        title: job.title || job.projectId?.title || 'Operational Project Job',
        categoryName: job.serviceCategoryName || 'Operations',
        categoryCode: job.serviceCategoryCode || 'ops',
        customerName: job.clientName || job.projectId?.clientName || 'Client',
        customerPhone: job.clientPhone || '',
        companyName: !isUser ? (job.clientName || 'Enterprise Partner') : '',
        city: job.city || job.projectId?.city || 'Local',
        address: job.address || '',
        budget: job.budget || job.projectId?.budget || 0,
        priority: job.priority || 'normal',
        status: normStatus,
        rawStatus: job.status,
        assignedEngineer: job.engineerId ? {
          id: job.engineerId._id,
          name: job.engineerName || job.engineerId.name || 'Engineer',
          phone: job.engineerId.phone || '',
          avatar: job.engineerId.avatar || null
        } : null,
        scheduledDate: job.scheduledAt || job.createdAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        notes: job.notes || '',
        photos: [],
        otpVerified: false,
        signatureCaptured: false
      });
    });

    // Parent projects without child jobs yet
    opsProjects.forEach((prj) => {
      if (projectIdsWithJobs.has(prj._id.toString())) return; // Avoid duplicate listings
      const normStatus = normalizeJobStatus('ops_project', prj);
      const isUser = prj.clientType === 'individual';
      const assignedEng = prj.assignedEngineers?.[0]?.engineerId;

      unifiedJobs.push({
        id: prj._id.toString(),
        jobCode: prj.projectCode || `PRJ-${prj._id.toString().slice(-6).toUpperCase()}`,
        rawId: prj._id,
        itemType: 'ops_project',
        source: isUser ? 'USER PROJECT' : 'B2B JOB',
        sourceType: isUser ? 'user' : 'b2b',
        title: prj.title,
        categoryName: prj.serviceCategoryName || prj.serviceCategoryCode,
        categoryCode: prj.serviceCategoryCode,
        customerName: prj.clientName || 'Client',
        customerPhone: '',
        companyName: !isUser ? (prj.clientName || 'Enterprise Partner') : '',
        city: prj.city || 'Local',
        address: '',
        budget: prj.budget || 0,
        priority: prj.priority || 'normal',
        status: normStatus,
        rawStatus: prj.status,
        assignedEngineer: assignedEng ? {
          id: assignedEng._id,
          name: assignedEng.name || prj.assignedEngineers[0].name,
          phone: assignedEng.phone || '',
          avatar: assignedEng.avatar || null
        } : null,
        scheduledDate: prj.startDate || prj.createdAt,
        createdAt: prj.createdAt,
        updatedAt: prj.updatedAt,
        notes: prj.currentStage || '',
        photos: [],
        otpVerified: false,
        signatureCaptured: false
      });
    });

    // Transform B2B Jobs
    b2bJobs.forEach((job) => {
      const normStatus = normalizeJobStatus('b2b_job', job);
      const hasProof = Boolean(job.afterPhotos?.length || job.customerSignature || job.endOtp);

      unifiedJobs.push({
        id: job._id.toString(),
        jobCode: job.jobId || `B2B-${job._id.toString().slice(-6).toUpperCase()}`,
        rawId: job._id,
        itemType: 'b2b_job',
        source: 'B2B JOB',
        sourceType: 'b2b',
        title: `${job.service}${job.subService ? ` - ${job.subService}` : ''}`,
        categoryName: job.service,
        categoryCode: job.service,
        customerName: job.customerName || 'B2B Client',
        customerPhone: job.phone || '',
        companyName: job.companyId?.companyName || job.companyId?.name || 'Enterprise Client',
        city: job.city || 'Local',
        address: job.address || '',
        budget: job.charge || 0,
        priority: (job.priority || 'Medium').toLowerCase(),
        status: normStatus,
        rawStatus: job.status,
        trackingStatus: job.trackingStatus,
        assignedEngineer: job.assignedTo ? {
          id: job.assignedTo._id,
          name: job.assignedToName || job.assignedTo.name,
          phone: job.assignedTo.phone || '',
          avatar: job.assignedTo.avatar || null
        } : null,
        scheduledDate: job.preferredDate || job.createdAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        notes: job.workNotes || '',
        photos: [...(job.beforePhotos || []), ...(job.afterPhotos || [])],
        beforePhotos: job.beforePhotos || [],
        afterPhotos: job.afterPhotos || [],
        otpVerified: Boolean(job.startOtpVerifiedAt || job.endOtp),
        startOtpVerified: Boolean(job.startOtpVerifiedAt),
        signatureCaptured: Boolean(job.customerSignature),
        hasProof
      });
    });

    // Transform Direct Bookings
    directBookings.forEach((b) => {
      const normStatus = normalizeJobStatus('booking', b);
      const assigned = b.engineerId || b.workerId;
      const addr = b.address?.addressLine1 ? `${b.address.addressLine1}, ${b.address.city}` : (b.address?.city || '');

      unifiedJobs.push({
        id: b._id.toString(),
        jobCode: b.bookingNumber || `BK-${b._id.toString().slice(-6).toUpperCase()}`,
        rawId: b._id,
        itemType: 'booking',
        source: 'USER PROJECT',
        sourceType: 'user',
        title: b.serviceName || 'Direct Booking',
        categoryName: b.serviceCategory || 'Service',
        categoryCode: b.serviceCategory || 'general',
        customerName: b.userId?.name || b.address?.name || 'Customer',
        customerPhone: b.userId?.phone || '',
        companyName: '',
        city: b.address?.city || 'Local',
        address: addr,
        budget: b.finalAmount || b.basePrice || 0,
        priority: b.urgencyLevel === 'urgent' || b.urgencyLevel === 'emergency' ? 'urgent' : 'normal',
        status: normStatus,
        rawStatus: b.status,
        assignedEngineer: assigned ? {
          id: assigned._id,
          name: assigned.name,
          phone: assigned.phone || '',
          avatar: assigned.avatar || null
        } : null,
        scheduledDate: b.scheduledDate || b.createdAt,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        notes: b.completionReport || b.description || '',
        photos: b.workPhotos || [],
        otpVerified: Boolean(b.customerConfirmed || b.customerConfirmationOTP),
        signatureCaptured: Boolean(b.customerSignature),
        hasProof: Boolean(b.workPhotos?.length || b.customerSignature || b.completionReport)
      });
    });

    // ── 3. Calculate Global Tab & Status Counts (Before Filter) ──
    const counts = {
      all: unifiedJobs.length,
      user: unifiedJobs.filter((j) => j.sourceType === 'user').length,
      b2b: unifiedJobs.filter((j) => j.sourceType === 'b2b').length,
      statuses: {
        all: unifiedJobs.length,
        new: unifiedJobs.filter((j) => j.status === 'new').length,
        accepted: unifiedJobs.filter((j) => j.status === 'accepted').length,
        assigned: unifiedJobs.filter((j) => j.status === 'assigned').length,
        dispatched: unifiedJobs.filter((j) => j.status === 'dispatched').length,
        en_route: unifiedJobs.filter((j) => j.status === 'en_route').length,
        in_progress: unifiedJobs.filter((j) => j.status === 'in_progress').length,
        completed: unifiedJobs.filter((j) => j.status === 'completed').length
      }
    };

    // ── 4. Apply Filters ──
    let filtered = unifiedJobs;

    if (source === 'user') {
      filtered = filtered.filter((j) => j.sourceType === 'user');
    } else if (source === 'b2b') {
      filtered = filtered.filter((j) => j.sourceType === 'b2b');
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        filtered = filtered.filter((j) => ['accepted', 'assigned', 'dispatched', 'en_route', 'in_progress'].includes(j.status));
      } else {
        filtered = filtered.filter((j) => j.status === status);
      }
    }

    if (priority && priority !== 'all') {
      filtered = filtered.filter((j) => j.priority.toLowerCase() === priority.toLowerCase());
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      filtered = filtered.filter((j) =>
        j.jobCode.toLowerCase().includes(q) ||
        j.title.toLowerCase().includes(q) ||
        j.customerName.toLowerCase().includes(q) ||
        j.companyName.toLowerCase().includes(q) ||
        j.city.toLowerCase().includes(q) ||
        (j.assignedEngineer?.name || '').toLowerCase().includes(q)
      );
    }

    // Sort by latest activity
    filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limitNum);

    return res.status(200).json({
      success: true,
      data: paginated,
      counts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('getMyJobs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch jobs' });
  }
};

/**
 * GET /api/vendor/my-jobs/:id
 * Full single-job details payload for the JobDetailsModal
 */
exports.getJobDetails = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid job ID' });
    }

    // 1. Check VendorOpsJob
    const opsJob = await VendorOpsJob.findOne({ _id: id, vendorId: vid })
      .populate('engineerId', 'name phone email avatar skills status')
      .populate('projectId')
      .lean();

    if (opsJob) {
      const normStatus = normalizeJobStatus('ops_job', opsJob);
      const isUser = opsJob.projectId?.clientType === 'individual';
      const proofDoc = await VendorQualityProof.findOne({ vendorId: vid, projectCode: opsJob.projectId?.projectCode }).lean();

      return res.status(200).json({
        success: true,
        data: {
          id: opsJob._id.toString(),
          jobCode: opsJob.jobCode || `JOB-${opsJob._id.toString().slice(-6).toUpperCase()}`,
          rawId: opsJob._id,
          itemType: 'ops_job',
          source: isUser ? 'USER PROJECT' : 'B2B JOB',
          sourceType: isUser ? 'user' : 'b2b',
          title: opsJob.title || opsJob.projectId?.title,
          categoryName: opsJob.serviceCategoryName || 'Operations',
          categoryCode: opsJob.serviceCategoryCode || 'ops',
          status: normStatus,
          rawStatus: opsJob.status,
          priority: opsJob.priority || 'normal',
          budget: opsJob.budget || opsJob.projectId?.budget || 0,
          scheduledDate: opsJob.scheduledAt || opsJob.createdAt,
          createdAt: opsJob.createdAt,
          updatedAt: opsJob.updatedAt,
          startedAt: opsJob.startedAt,
          completedAt: opsJob.completedAt,
          
          customer: {
            name: opsJob.clientName || opsJob.projectId?.clientName || 'Client',
            phone: opsJob.clientPhone || '',
            email: '',
            companyName: !isUser ? (opsJob.clientName || 'Enterprise Client') : '',
            clientId: opsJob.projectId?.clientId || null
          },
          
          address: {
            fullAddress: opsJob.address || opsJob.projectId?.city || 'On-site',
            city: opsJob.city || opsJob.projectId?.city || 'Local',
            state: '',
            pincode: '',
            coordinates: null
          },
          
          assignedEngineer: opsJob.engineerId ? {
            id: opsJob.engineerId._id,
            name: opsJob.engineerName || opsJob.engineerId.name,
            phone: opsJob.engineerId.phone || '',
            email: opsJob.engineerId.email || '',
            avatar: opsJob.engineerId.avatar || null,
            skills: opsJob.engineerId.skills || [],
            assignedAt: opsJob.assignedAt
          } : null,
          
          timeline: buildJobTimeline(normStatus, opsJob, 'ops_job'),
          
          photos: {
            customer: [],
            before: [],
            inProgress: [],
            after: proofDoc?.requirements?.filter((r) => r.type === 'photo' && r.value).map((r) => r.value) || []
          },
          
          notes: {
            customerInstructions: opsJob.notes || '',
            engineerRemarks: opsJob.acceptConfirmation?.notes || '',
            vendorNotes: ''
          },
          
          verification: {
            startOtpRequired: false,
            startOtpVerified: false,
            endOtpRequired: false,
            endOtpVerified: false,
            signatureCaptured: Boolean(proofDoc?.signatureCaptured),
            signatureUrl: null
          },
          
          proof: {
            submitted: Boolean(proofDoc),
            completeness: proofDoc?.completeness || (opsJob.status === 'completed' ? 100 : 0),
            items: proofDoc?.requirements || [],
            reportUrl: null,
            submittedAt: proofDoc?.submittedAt || opsJob.completedAt
          },
          
          financials: {
            estimatedAmount: opsJob.budget || 0,
            paymentStatus: opsJob.projectId?.paymentStatus || 'pending',
            payoutStatus: opsJob.payoutStatus || 'pending',
            engineerPayout: opsJob.engineerPayout || 0
          }
        }
      });
    }

    // 2. Check B2BJob
    const b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid })
      .populate('companyId', 'companyName name phone email address')
      .populate('assignedTo', 'name phone email avatar skills status')
      .lean();

    if (b2bJob) {
      const normStatus = normalizeJobStatus('b2b_job', b2bJob);

      return res.status(200).json({
        success: true,
        data: {
          id: b2bJob._id.toString(),
          jobCode: b2bJob.jobId,
          rawId: b2bJob._id,
          itemType: 'b2b_job',
          source: 'B2B JOB',
          sourceType: 'b2b',
          title: `${b2bJob.service}${b2bJob.subService ? ` - ${b2bJob.subService}` : ''}`,
          categoryName: b2bJob.service,
          categoryCode: b2bJob.service,
          status: normStatus,
          rawStatus: b2bJob.status,
          trackingStatus: b2bJob.trackingStatus,
          priority: (b2bJob.priority || 'Medium').toLowerCase(),
          budget: b2bJob.charge || 0,
          scheduledDate: b2bJob.preferredDate || b2bJob.createdAt,
          createdAt: b2bJob.createdAt,
          updatedAt: b2bJob.updatedAt,
          travelStartedAt: b2bJob.travelStartedAt,
          arrivedAt: b2bJob.arrivedAt,
          startedAt: b2bJob.startedAt,
          completedAt: b2bJob.completedAt,

          customer: {
            name: b2bJob.customerName || 'Client',
            phone: b2bJob.phone || '',
            email: b2bJob.email || '',
            companyName: b2bJob.companyId?.companyName || b2bJob.companyId?.name || 'Enterprise Client',
            companyId: b2bJob.companyId?._id || null,
            deviceId: b2bJob.deviceId || 'N/A',
            siteId: b2bJob.siteId || 'N/A'
          },

          address: {
            fullAddress: b2bJob.address,
            city: b2bJob.city,
            state: b2bJob.state || '',
            pincode: b2bJob.pincode || '',
            coordinates: b2bJob.coordinates?.coordinates ? {
              lng: b2bJob.coordinates.coordinates[0],
              lat: b2bJob.coordinates.coordinates[1]
            } : null
          },

          assignedEngineer: b2bJob.assignedTo ? {
            id: b2bJob.assignedTo._id,
            name: b2bJob.assignedToName || b2bJob.assignedTo.name,
            phone: b2bJob.assignedTo.phone || '',
            email: b2bJob.assignedTo.email || '',
            avatar: b2bJob.assignedTo.avatar || null,
            skills: b2bJob.assignedTo.skills || [],
            assignedAt: b2bJob.assignedAt
          } : null,

          timeline: buildJobTimeline(normStatus, b2bJob, 'b2b_job'),

          photos: {
            customer: [],
            before: b2bJob.beforePhotos || [],
            inProgress: [],
            after: b2bJob.afterPhotos || []
          },

          notes: {
            customerInstructions: `Device ID: ${b2bJob.deviceId || 'N/A'}, Site: ${b2bJob.siteId || 'N/A'}`,
            engineerRemarks: b2bJob.workNotes || '',
            partsReplaced: b2bJob.partsReplaced || '',
            vendorNotes: ''
          },

          verification: {
            startOtpRequired: true,
            startOtpVerified: Boolean(b2bJob.startOtpVerifiedAt),
            startOtpVerifiedAt: b2bJob.startOtpVerifiedAt,
            endOtpRequired: Boolean(b2bJob.endOtp),
            endOtpVerified: Boolean(b2bJob.completedAt),
            signatureCaptured: Boolean(b2bJob.customerSignature),
            signatureUrl: b2bJob.customerSignature || null,
            signoffMethod: b2bJob.customerSignoffMethod || 'none'
          },

          proof: {
            submitted: Boolean(b2bJob.afterPhotos?.length || b2bJob.customerSignature),
            completeness: b2bJob.status === 'completed' ? 100 : (b2bJob.afterPhotos?.length ? 80 : 30),
            items: (b2bJob.checklist || []).map((c) => ({
              label: c.label || c.itemId,
              submitted: c.checked,
              value: c.checked ? 'Passed' : 'Pending'
            })),
            reportUrl: null,
            submittedAt: b2bJob.completionSubmittedAt || b2bJob.completedAt
          },

          financials: {
            estimatedAmount: b2bJob.charge || 0,
            paymentStatus: b2bJob.paymentStatus || 'unpaid',
            payoutStatus: b2bJob.payoutStatus || 'pending',
            engineerPayout: b2bJob.charge ? Math.round(b2bJob.charge * 0.7) : 0
          }
        }
      });
    }

    // 3. Check Booking
    const booking = await Booking.findOne({ _id: id, vendorId: vid })
      .populate('userId', 'name phone email')
      .populate('engineerId', 'name phone email avatar skills')
      .populate('workerId', 'name phone avatar')
      .lean();

    if (booking) {
      const normStatus = normalizeJobStatus('booking', booking);
      const assigned = booking.engineerId || booking.workerId;
      const addr = booking.address?.addressLine1 ? `${booking.address.addressLine1}, ${booking.address.city}` : (booking.address?.city || '');

      return res.status(200).json({
        success: true,
        data: {
          id: booking._id.toString(),
          jobCode: booking.bookingNumber || `BK-${booking._id.toString().slice(-6).toUpperCase()}`,
          rawId: booking._id,
          itemType: 'booking',
          source: 'USER PROJECT',
          sourceType: 'user',
          title: booking.serviceName || 'Direct Booking',
          categoryName: booking.serviceCategory || 'Service',
          categoryCode: booking.serviceCategory || 'general',
          status: normStatus,
          rawStatus: booking.status,
          priority: booking.urgencyLevel === 'urgent' || booking.urgencyLevel === 'emergency' ? 'urgent' : 'normal',
          budget: booking.finalAmount || booking.basePrice || 0,
          scheduledDate: booking.scheduledDate || booking.createdAt,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          startedAt: booking.startedAt,
          completedAt: booking.completedAt,

          customer: {
            name: booking.userId?.name || booking.address?.name || 'Customer',
            phone: booking.userId?.phone || '',
            email: booking.userId?.email || '',
            companyName: '',
            clientId: booking.userId?._id || null
          },

          address: {
            fullAddress: addr,
            city: booking.address?.city || 'Local',
            state: booking.address?.state || '',
            pincode: booking.address?.pincode || '',
            coordinates: booking.address?.lat && booking.address?.lng ? {
              lat: booking.address.lat,
              lng: booking.address.lng
            } : null
          },

          assignedEngineer: assigned ? {
            id: assigned._id,
            name: assigned.name,
            phone: assigned.phone || '',
            email: assigned.email || '',
            avatar: assigned.avatar || null,
            skills: assigned.skills || [],
            assignedAt: booking.assignedAt
          } : null,

          timeline: buildJobTimeline(normStatus, booking, 'booking'),

          photos: {
            customer: booking.serviceImages || [],
            before: [],
            inProgress: [],
            after: booking.workPhotos || []
          },

          notes: {
            customerInstructions: booking.description || '',
            engineerRemarks: booking.completionReport || '',
            vendorNotes: ''
          },

          verification: {
            startOtpRequired: true,
            startOtpVerified: Boolean(booking.startedAt),
            endOtpRequired: true,
            endOtpVerified: Boolean(booking.customerConfirmed),
            signatureCaptured: Boolean(booking.customerSignature),
            signatureUrl: booking.customerSignature || null
          },

          proof: {
            submitted: Boolean(booking.workPhotos?.length || booking.customerSignature || booking.completionReport),
            completeness: booking.status === 'completed' ? 100 : (booking.workPhotos?.length ? 75 : 25),
            items: (booking.materials || []).map((m) => ({
              label: m.name,
              submitted: m.status === 'approved',
              value: `Qty: ${m.quantity} · Cost: ₹${m.cost}`
            })),
            reportUrl: booking.completionReport || null,
            submittedAt: booking.completedAt
          },

          financials: {
            estimatedAmount: booking.finalAmount || booking.basePrice || 0,
            paymentStatus: booking.paymentStatus || 'pending',
            payoutStatus: booking.workerPayout ? 'credited' : 'pending',
            engineerPayout: booking.workerPayout || 0
          }
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Job not found' });
  } catch (error) {
    console.error('getJobDetails error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch job details' });
  }
};

/**
 * POST /api/vendor/my-jobs/:id/assign-engineer
 * Assign/reassign an engineer to an accepted job
 */
exports.assignEngineerToJob = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { engineerId, notes = '', priority } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'Valid Job ID and Engineer ID are required' });
    }

    const engObjId = new mongoose.Types.ObjectId(engineerId);

    // Verify engineer belongs to vendor workforce or exists
    const [workforceEng, engineerDoc] = await Promise.all([
      VendorWorkforceEngineer.findOne({ vendorId: vid, engineerId: engObjId }),
      Engineer.findById(engObjId).select('name phone email avatar skills')
    ]);

    const engineerName = engineerDoc?.name || workforceEng?.name || 'Assigned Engineer';

    // 1. Try VendorOpsJob
    const opsJob = await VendorOpsJob.findOne({ _id: id, vendorId: vid });
    if (opsJob) {
      opsJob.engineerId = engObjId;
      opsJob.engineerName = engineerName;
      opsJob.status = 'pending_acceptance';
      opsJob.assignedAt = new Date();
      if (notes) opsJob.notes = notes;
      if (priority) opsJob.priority = priority;
      await opsJob.save();

      // Update parent project
      await VendorOpsProject.updateOne(
        { _id: opsJob.projectId },
        {
          $set: {
            'assignedEngineers.0.engineerId': engObjId,
            'assignedEngineers.0.name': engineerName,
            'assignedEngineers.0.status': 'assigned',
            currentStage: 'Engineer Assigned'
          }
        }
      ).catch(() => {});

      // Mark workforce engineer status
      if (workforceEng) {
        workforceEng.availability = 'on_project';
        workforceEng.activeJobsCount = (workforceEng.activeJobsCount || 0) + 1;
        await workforceEng.save();
      }

      // Notify engineer via socket
      try {
        const io = getIO();
        if (io) {
          io.to(`engineer:${engineerId}`).emit('ops:job_assigned', {
            jobId: opsJob._id,
            jobCode: opsJob.jobCode,
            title: opsJob.title,
            vendorId: vid
          });
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: `Assigned to ${engineerName} successfully`,
        data: opsJob
      });
    }

    // 2. Try B2BJob
    const b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid });
    if (b2bJob) {
      b2bJob.assignedTo = engObjId;
      b2bJob.assignedToName = engineerName;
      b2bJob.assignmentType = 'vendor_engineer';
      b2bJob.status = 'assigned';
      b2bJob.trackingStatus = 'assigned';
      b2bJob.assignedAt = new Date();
      await b2bJob.save();

      if (workforceEng) {
        workforceEng.availability = 'on_project';
        workforceEng.activeJobsCount = (workforceEng.activeJobsCount || 0) + 1;
        await workforceEng.save();
      }

      try {
        const io = getIO();
        if (io) {
          io.to(`engineer:${engineerId}`).emit('b2b:job_assigned', {
            jobId: b2bJob._id,
            jobCode: b2bJob.jobId,
            service: b2bJob.service
          });
          io.to(`vendor:${vid}`).emit('b2b:jobStatusUpdated', {
            jobId: b2bJob._id,
            jobCode: b2bJob.jobId,
            status: 'assigned',
            engineerId: engObjId
          });
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: `B2B Job assigned to ${engineerName} successfully`,
        data: b2bJob
      });
    }

    // 3. Try Booking
    const booking = await Booking.findOne({ _id: id, vendorId: vid });
    if (booking) {
      booking.engineerId = engObjId;
      booking.status = 'assigned';
      booking.assignedAt = new Date();
      await booking.save();

      if (workforceEng) {
        workforceEng.availability = 'on_project';
        workforceEng.activeJobsCount = (workforceEng.activeJobsCount || 0) + 1;
        await workforceEng.save();
      }

      try {
        const io = getIO();
        if (io) {
          io.to(`engineer:${engineerId}`).emit('booking:assigned', {
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber
          });
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: `Booking assigned to ${engineerName} successfully`,
        data: booking
      });
    }

    return res.status(404).json({ success: false, message: 'Job not found' });
  } catch (error) {
    console.error('assignEngineerToJob error:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign engineer' });
  }
};

/**
 * POST /api/vendor/my-jobs/:id/status
 * Update / dispatch operational job status
 */
exports.updateJobStatus = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { status, remarks = '' } = req.body || {};

    if (!status) {
      return res.status(400).json({ success: false, message: 'Target status is required' });
    }

    // 1. Check B2BJob
    const b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid });
    if (b2bJob) {
      b2bJob.status = status;
      if (status === 'completed') b2bJob.completedAt = new Date();
      if (remarks) b2bJob.workNotes = `${b2bJob.workNotes ? `${b2bJob.workNotes}\n` : ''}[Vendor]: ${remarks}`;
      await b2bJob.save();

      try {
        const io = getIO();
        if (io) {
          io.to(`vendor:${vid}`).emit('b2b:jobStatusUpdated', {
            jobId: b2bJob._id,
            jobCode: b2bJob.jobId,
            status,
            updatedAt: new Date()
          });
        }
      } catch (_) {}

      return res.status(200).json({ success: true, message: `Status updated to ${status}`, data: b2bJob });
    }

    // 2. Check VendorOpsJob
    const opsJob = await VendorOpsJob.findOne({ _id: id, vendorId: vid });
    if (opsJob) {
      opsJob.status = status;
      if (status === 'completed') opsJob.completedAt = new Date();
      if (remarks) opsJob.notes = `${opsJob.notes ? `${opsJob.notes}\n` : ''}[Vendor]: ${remarks}`;
      await opsJob.save();

      return res.status(200).json({ success: true, message: `Status updated to ${status}`, data: opsJob });
    }

    return res.status(404).json({ success: false, message: 'Job not found' });
  } catch (error) {
    console.error('updateJobStatus error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update job status' });
  }
};
