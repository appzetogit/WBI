/**
 * Vendor Requests Controller
 * Unified operational controller for User Projects & B2B Jobs
 * Connects User App, B2B Portal, Vendor Dashboard, Engineer Panel, and Admin
 *
 * Every read and write is scoped to the calling vendor server-side:
 *   - B2B jobs: jobs the vendor holds, or open offers routed to it
 *   - Bookings: bookings the vendor owns, or offers made to it
 *   - Opportunities: those the vendor is eligible for
 * B2B job state changes go through the job lifecycle/assignment services.
 */

const mongoose = require('mongoose');
const Opportunity = require('../../models/Opportunity');
const B2BJob = require('../../models/B2BJob');
const Booking = require('../../models/Booking');
const ServiceRequest = require('../../models/ServiceRequest');
const VendorOpsProject = require('../../models/VendorOpsProject');
const VendorOpsJob = require('../../models/VendorOpsJob');
const VendorWorkforceEngineer = require('../../models/VendorWorkforceEngineer');
const Engineer = require('../../models/Engineer');
const Vendor = require('../../models/Vendor');
const { expandCategoryMatchCodes } = require('../../utils/serviceCategoryAliases');
const { onVendorAccepted, recordVendorReject } = require('../../services/projectAssignmentEngine.service');
const { createOpsProjectFromOpportunity } = require('../../utils/createOpsProjectFromOpportunity');
const { getIO } = require('../../sockets');
const { openVendorOfferFilter, sendJobError } = require('../../services/jobScope.service');
const { lifecycleOf } = require('../../services/jobLifecycle.service');
const { LIFECYCLE: S } = require('../../services/jobStateMachine');

const getVendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);
const vidStr = (id) => (id ? String(id) : '');

/** Booking statuses in which a booking is still an open offer to vendors. */
const BOOKING_OFFER_STATUSES = ['requested', 'searching', 'searching_worker', 'request_sent'];

/** Bookings this vendor may act on: owned, or currently offered to it. */
const bookingScopeFor = (vid) => ({
  $or: [
    { vendorId: vid },
    {
      vendorId: null,
      status: { $in: BOOKING_OFFER_STATUSES },
      $or: [{ 'potentialVendors.vendorId': vid }, { notifiedVendors: vid }]
    }
  ]
});

/** Vendor's approved service category codes (incl. legacy aliases). */
const vendorCategoryCodes = async (vid) => {
  const vendorDoc = await Vendor.findById(vid).select('approvedServices categories service').lean();
  if (!vendorDoc) return null;
  const approvedCodes = (vendorDoc.approvedServices || [])
    .filter((s) => s.status !== 'suspended')
    .map((s) => s.categoryCode)
    .filter(Boolean);
  const legacyCats = Array.isArray(vendorDoc.categories) ? vendorDoc.categories : [];
  return expandCategoryMatchCodes([...approvedCodes, ...legacyCats]);
};

/** Same visibility rule as the list: eligible, open-to-category, targeted, or already awarded. */
const vendorCanSeeOpportunity = async (opp, vid) => {
  if ((opp.eligibleVendors || []).some((v) => String(v) === String(vid))) return true;
  if (String(opp.clientInfo?.targetVendorId || '') === String(vid)) return true;
  if (await VendorOpsProject.exists({ opportunityId: opp._id, vendorId: vid })) return true;
  if (!(opp.eligibleVendors || []).length) {
    const codes = (await vendorCategoryCodes(vid)) || [];
    return !codes.length || codes.includes(opp.categoryCode);
  }
  return false;
};

/**
 * Resolve an engineer the vendor may assign: must be linked to THIS vendor,
 * approved by WBI and by the vendor, and active. Accepts an Engineer id or the
 * vendor's roster (VendorWorkforceEngineer) id.
 */
const resolveOwnEngineer = async (vid, engineerRef) => {
  if (!engineerRef || !mongoose.Types.ObjectId.isValid(String(engineerRef))) return null;
  let engineer = await Engineer.findById(engineerRef).select('name phone email availability vendorId vendorApprovalStatus approvalStatus isActive').lean();
  if (!engineer) {
    const roster = await VendorWorkforceEngineer.findOne({ _id: engineerRef, vendorId: vid }).select('linkedEngineerId').lean();
    if (roster?.linkedEngineerId) {
      engineer = await Engineer.findById(roster.linkedEngineerId).select('name phone email availability vendorId vendorApprovalStatus approvalStatus isActive').lean();
    }
  }
  if (!engineer) return null;
  const owned = String(engineer.vendorId || '') === String(vid) &&
    ['approved', 'not_required', undefined, null].includes(engineer.vendorApprovalStatus) &&
    engineer.approvalStatus === 'approved' &&
    engineer.isActive !== false;
  return owned ? engineer : false;
};

/** Legacy tab bucket for a B2B job, derived from the canonical lifecycle state. */
const b2bRequestBucket = (job, vid) => {
  const state = lifecycleOf(job);
  const held = String(job.assignedVendorId || '') === String(vid);
  if (!held) return 'new';
  switch (state) {
    case S.PENDING_ASSIGNMENT:
    case S.REJECTED:
      return 'accepted';
    case S.ASSIGNED:
    case S.REASSIGNED:
      return 'assigned';
    case S.ACCEPTED:
    case S.EN_ROUTE:
    case S.ARRIVED:
    case S.IN_PROGRESS:
    case S.ON_HOLD:
      return 'in_progress';
    case S.COMPLETED:
    case S.VERIFICATION:
    case S.CLOSED:
      return 'completed';
    case S.CANCELLED:
    case S.FAILED:
      return 'rejected';
    default:
      return 'accepted';
  }
};

/**
 * GET /api/vendor/requests
 * Paginated, filtered list of all User Projects & B2B Jobs for the vendor
 */
exports.getRequests = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const {
      source = 'all', // 'all' | 'user' | 'b2b'
      status = 'all', // 'all' | 'new' | 'accepted' | 'rejected' | 'assigned' | 'in_progress' | 'completed'
      search = '',
      category = '',
      priority = '',
      page = 1,
      limit = 10
    } = req.query;

    const matchCodes = await vendorCategoryCodes(vid);
    if (!matchCodes) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const oppCategoryFilter = matchCodes.length ? { categoryCode: { $in: matchCodes } } : {};

    // ── 1. Fetch User Requests ──
    let userRequests = [];
    if (source === 'all' || source === 'user') {
      const oppFilter = {
        type: 'client_request',
        ...oppCategoryFilter,
        $or: [{ eligibleVendors: vid }, { eligibleVendors: { $size: 0 } }, { 'clientInfo.targetVendorId': vid }]
      };

      if (category) oppFilter.categoryCode = category;
      if (priority) oppFilter.priority = priority;

      const [opps, bookings, serviceReqs] = await Promise.all([
        Opportunity.find(oppFilter).sort({ createdAt: -1 }).lean().catch(() => []),
        Booking.find(bookingScopeFor(vid)).sort({ createdAt: -1 }).lean().catch(() => []),
        ServiceRequest.find({ assignedVendorId: vid }).sort({ createdAt: -1 }).lean().catch(() => [])
      ]);

      userRequests = [
        ...opps.map((opp) => {
          let derivedStatus = 'new';
          if (opp.status === 'closed' || opp.assignment?.phase === 'awarded') derivedStatus = 'accepted';
          else if (opp.status === 'rejected') derivedStatus = 'rejected';
          else if (opp.assignment?.phase === 'awaiting_engineer') derivedStatus = 'assigned';

          return {
            id: opp._id.toString(),
            requestId: opp.opportunityCode,
            title: opp.title,
            source: 'USER PROJECT',
            sourceType: 'user',
            jobSource: 'USER_APP',
            categoryName: opp.categoryName,
            categoryCode: opp.categoryCode,
            customerName: opp.clientInfo?.name || 'Customer',
            customerPhone: opp.clientInfo?.phone || '',
            city: opp.clientInfo?.city || opp.requirements?.cities?.[0] || 'Local',
            address: opp.clientInfo?.address || '',
            description: opp.description || opp.requirements?.description || '',
            requestedDate: opp.requirements?.startDate || opp.createdAt,
            estimatedAmount: opp.budget?.max || opp.budget?.min || 0,
            priority: opp.priority || 'normal',
            status: derivedStatus,
            rawStatus: opp.status,
            createdAt: opp.createdAt,
            assignedEngineer: null,
            itemType: 'opportunity',
            attachments: opp.rfqDocumentUrl ? [opp.rfqDocumentUrl] : []
          };
        }),
        ...bookings.map((b) => {
          let derivedStatus = 'new';
          if (['accepted', 'confirmed'].includes(b.status)) derivedStatus = 'accepted';
          else if (['assigned'].includes(b.status)) derivedStatus = 'assigned';
          else if (['in_progress', 'journey_started', 'visited', 'started', 'reached', 'on_the_way'].includes(b.status)) derivedStatus = 'in_progress';
          else if (['completed'].includes(b.status)) derivedStatus = 'completed';
          else if (['cancelled', 'rejected'].includes(b.status)) derivedStatus = 'rejected';
          const owned = String(b.vendorId || '') === String(vid);

          return {
            id: b._id.toString(),
            requestId: b.bookingNumber || `BK-${String(b._id).slice(-6)}`,
            title: b.serviceName || 'Home Service Request',
            source: 'USER PROJECT',
            sourceType: 'user',
            jobSource: 'USER_APP',
            categoryName: b.serviceCategory || 'Home Service',
            categoryCode: b.serviceCategory || '',
            customerName: owned ? (b.address?.name || 'Customer') : 'Customer',
            customerPhone: '',
            city: b.address?.city || 'Local',
            address: owned ? [b.address?.addressLine1, b.address?.city].filter(Boolean).join(', ') : '',
            description: b.description || '',
            requestedDate: b.scheduledDate || b.createdAt,
            estimatedAmount: b.finalAmount || b.totalAmount || 0,
            priority: b.urgencyLevel === 'urgent' || b.urgencyLevel === 'emergency' ? 'urgent' : 'normal',
            status: derivedStatus,
            rawStatus: b.status,
            createdAt: b.createdAt,
            assignedEngineer: null,
            itemType: 'booking',
            attachments: b.serviceImages || []
          };
        }),
        ...serviceReqs.map((sr) => {
          let derivedStatus = 'new';
          if (sr.status === 'Assigned') derivedStatus = 'assigned';
          else if (sr.status === 'In Progress') derivedStatus = 'in_progress';
          else if (sr.status === 'Completed') derivedStatus = 'completed';
          else if (sr.status === 'Cancelled') derivedStatus = 'rejected';

          return {
            id: sr._id.toString(),
            requestId: sr.requestCode,
            title: `${sr.categoryName} - ${sr.subCategoryName}`,
            source: 'USER PROJECT',
            sourceType: 'user',
            jobSource: 'USER_APP',
            categoryName: sr.categoryName,
            categoryCode: sr.categoryCode,
            customerName: sr.contact?.name || 'Customer',
            customerPhone: sr.contact?.phone || '',
            city: sr.contact?.city || 'Local',
            address: sr.contact?.address || '',
            description: sr.formData ? JSON.stringify(sr.formData) : '',
            requestedDate: sr.createdAt,
            estimatedAmount: sr.payment?.amount || 0,
            priority: 'normal',
            status: derivedStatus,
            rawStatus: sr.status,
            createdAt: sr.createdAt,
            assignedEngineer: null,
            itemType: 'service_request',
            attachments: []
          };
        })
      ];
    }

    // ── 2. Fetch B2B Jobs ──
    let b2bRequests = [];
    if (source === 'all' || source === 'b2b') {
      const b2bOppFilter = {
        type: { $in: ['b2b_opportunity', 'bulk_requirement', 'bid_quote_request', 'direct_invitation'] },
        ...oppCategoryFilter,
        $or: [{ eligibleVendors: vid }, { eligibleVendors: { $size: 0 } }, { 'clientInfo.targetVendorId': vid }]
      };

      if (category) b2bOppFilter.categoryCode = category;
      if (priority) b2bOppFilter.priority = priority;

      const [b2bOpps, directJobs] = await Promise.all([
        Opportunity.find(b2bOppFilter).sort({ createdAt: -1 }).lean().catch(() => []),
        // Jobs this vendor holds, plus open offers routed to it (coverage +
        // skilled engineer) that nobody has claimed and it has not declined.
        B2BJob.find({ $or: [{ assignedVendorId: vid }, openVendorOfferFilter(vid)] })
          .populate('companyId', 'companyName name')
          .populate('assignedTo', 'name phone')
          .select('-startOtp -endOtp')
          .sort({ createdAt: -1 })
          .lean()
          .catch(() => [])
      ]);

      b2bRequests = [
        ...b2bOpps.map((opp) => {
          let derivedStatus = 'new';
          if (opp.status === 'closed' || opp.assignment?.phase === 'awarded') derivedStatus = 'accepted';
          else if (opp.status === 'rejected') derivedStatus = 'rejected';
          else if (opp.assignment?.phase === 'awaiting_engineer') derivedStatus = 'assigned';

          return {
            id: opp._id.toString(),
            requestId: opp.opportunityCode,
            title: opp.title,
            source: 'B2B JOB',
            sourceType: 'b2b',
            jobSource: 'B2B',
            categoryName: opp.categoryName,
            categoryCode: opp.categoryCode,
            customerName: opp.clientInfo?.company || opp.clientInfo?.name || 'Enterprise Client',
            customerPhone: opp.clientInfo?.phone || '',
            companyName: opp.clientInfo?.company || 'Enterprise Client',
            city: opp.clientInfo?.city || opp.requirements?.cities?.[0] || 'Multi-site',
            address: opp.clientInfo?.address || '',
            description: opp.description || opp.requirements?.description || '',
            requestedDate: opp.requirements?.startDate || opp.createdAt,
            estimatedAmount: opp.budget?.max || opp.budget?.min || 0,
            totalSites: opp.requirements?.totalSites || 1,
            priority: opp.priority || 'high',
            status: derivedStatus,
            rawStatus: opp.status,
            createdAt: opp.createdAt,
            assignedEngineer: null,
            itemType: 'opportunity',
            attachments: opp.rfqDocumentUrl ? [opp.rfqDocumentUrl] : []
          };
        }),
        ...directJobs.map((job) => {
          const held = String(job.assignedVendorId || '') === String(vid);
          return {
            id: job._id.toString(),
            requestId: job.jobId,
            title: `${job.service} - ${job.subService || 'Inspection & Maintenance'}`,
            source: 'B2B JOB',
            sourceType: 'b2b',
            jobSource: job.source || 'B2B',
            categoryName: job.service,
            categoryCode: job.serviceKey || job.service,
            serviceKey: job.serviceKey || null,
            customerName: held ? job.customerName : (job.companyId?.companyName || 'Enterprise Client'),
            customerPhone: held ? job.phone || '' : '',
            companyName: job.companyId?.companyName || 'Enterprise Client',
            city: job.city,
            pincode: job.pincode || '',
            address: held ? job.address || '' : '',
            description: `B2B Job for site ${job.siteId || 'Standard'}. Device: ${job.deviceId || 'N/A'}`,
            requestedDate: job.preferredDate || job.createdAt,
            estimatedAmount: job.charge || 0,
            totalSites: 1,
            priority: job.priority || 'Medium',
            status: b2bRequestBucket(job, vid),
            rawStatus: job.status,
            lifecycleStatus: lifecycleOf(job),
            slaDueAt: job.slaDueAt || null,
            createdAt: job.createdAt,
            assignedEngineer: job.assignedTo ? { name: job.assignedTo.name, phone: job.assignedTo.phone } : null,
            itemType: 'b2b_job',
            attachments: []
          };
        })
      ];
    }

    // Combine All
    let allRequests = [...userRequests, ...b2bRequests];

    // Compute Tab Counts
    const counts = {
      total: allRequests.length,
      userProjects: allRequests.filter((r) => r.sourceType === 'user').length,
      b2bJobs: allRequests.filter((r) => r.sourceType === 'b2b').length,
      newRequests: allRequests.filter((r) => r.status === 'new').length,
      userNew: allRequests.filter((r) => r.sourceType === 'user' && r.status === 'new').length,
      b2bNew: allRequests.filter((r) => r.sourceType === 'b2b' && r.status === 'new').length,
      accepted: allRequests.filter((r) => r.status === 'accepted').length,
      assigned: allRequests.filter((r) => r.status === 'assigned').length,
      inProgress: allRequests.filter((r) => r.status === 'in_progress').length,
      completed: allRequests.filter((r) => r.status === 'completed').length,
      rejected: allRequests.filter((r) => r.status === 'rejected').length
    };

    // Filter by status if specified
    if (status && status !== 'all') {
      allRequests = allRequests.filter((r) => r.status === status);
    }

    // Filter by search query
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      allRequests = allRequests.filter(
        (r) =>
          r.requestId?.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q) ||
          r.customerName?.toLowerCase().includes(q) ||
          r.companyName?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.categoryName?.toLowerCase().includes(q)
      );
    }

    // Sort newest first
    allRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = allRequests.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      counts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: allRequests.length,
        pages: Math.ceil(allRequests.length / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('getRequests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch requests' });
  }
};

/**
 * GET /api/vendor/requests/:id
 * Fetch detailed request data (only what this vendor may see).
 */
exports.getRequestDetails = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    // Check Opportunity
    const opp = await Opportunity.findById(id).lean();
    if (opp) {
      if (!(await vendorCanSeeOpportunity(opp, vid))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this request' });
      }
      const isUser = opp.type === 'client_request';
      const createdProject = await VendorOpsProject.findOne({ opportunityId: opp._id, vendorId: vid }).lean();

      return res.status(200).json({
        success: true,
        data: {
          id: opp._id.toString(),
          requestId: opp.opportunityCode,
          title: opp.title,
          source: isUser ? 'USER PROJECT' : 'B2B JOB',
          sourceType: isUser ? 'user' : 'b2b',
          categoryName: opp.categoryName,
          categoryCode: opp.categoryCode,
          subServices: opp.subServices || [],
          customerName: opp.clientInfo?.name || opp.clientInfo?.company || 'Client',
          customerPhone: opp.clientInfo?.phone || '',
          companyName: opp.clientInfo?.company || '',
          city: opp.clientInfo?.city || opp.requirements?.cities?.[0] || 'Local',
          address: opp.clientInfo?.address || '',
          description: opp.description || opp.requirements?.description || '',
          specialRequirements: opp.requirements?.specialRequirements || '',
          requestedDate: opp.requirements?.startDate || opp.createdAt,
          contractDuration: opp.requirements?.contractDuration || '',
          estimatedAmount: opp.budget?.max || opp.budget?.min || 0,
          totalSites: opp.requirements?.totalSites || 1,
          priority: opp.priority || 'normal',
          status: opp.status,
          assignmentPhase: opp.assignment?.phase || 'open',
          createdAt: opp.createdAt,
          itemType: 'opportunity',
          linkedProjectId: createdProject?._id || null,
          assignedEngineers: createdProject?.assignedEngineers || [],
          attachments: opp.rfqDocumentUrl ? [opp.rfqDocumentUrl] : []
        }
      });
    }

    // Check B2BJob — held by this vendor, or an open offer to it
    const b2bJob = await B2BJob.findOne({ _id: id, $or: [{ assignedVendorId: vid }, openVendorOfferFilter(vid)] })
      .populate('companyId', 'companyName name')
      .populate('assignedTo', 'name phone email')
      .select('-startOtp -endOtp')
      .lean();
    if (b2bJob) {
      const held = String(b2bJob.assignedVendorId || '') === String(vid);
      return res.status(200).json({
        success: true,
        data: {
          id: b2bJob._id.toString(),
          requestId: b2bJob.jobId,
          title: `${b2bJob.service} - ${b2bJob.subService || 'Work'}`,
          source: 'B2B JOB',
          sourceType: 'b2b',
          jobSource: b2bJob.source || 'B2B',
          categoryName: b2bJob.service,
          categoryCode: b2bJob.serviceKey || b2bJob.service,
          serviceKey: b2bJob.serviceKey || null,
          // Customer contact is released to the vendor once it accepts the job.
          customerName: held ? b2bJob.customerName : (b2bJob.companyId?.companyName || 'Enterprise Client'),
          customerPhone: held ? b2bJob.phone : '',
          companyName: b2bJob.companyId?.companyName || 'Enterprise Partner',
          city: b2bJob.city,
          pincode: b2bJob.pincode || '',
          address: held ? b2bJob.address : '',
          description: `Device ID: ${b2bJob.deviceId || 'N/A'}, Site ID: ${b2bJob.siteId || 'N/A'}`,
          requestedDate: b2bJob.preferredDate || b2bJob.createdAt,
          estimatedAmount: b2bJob.charge || 0,
          totalSites: 1,
          priority: b2bJob.priority || 'Medium',
          status: b2bJob.status,
          lifecycleStatus: lifecycleOf(b2bJob),
          trackingStatus: b2bJob.trackingStatus,
          slaDueAt: b2bJob.slaDueAt || null,
          isOffer: !held,
          createdAt: b2bJob.createdAt,
          itemType: 'b2b_job',
          assignedEngineer: b2bJob.assignedTo ? { id: b2bJob.assignedTo._id, name: b2bJob.assignedTo.name, phone: b2bJob.assignedTo.phone } : null,
          attachments: []
        }
      });
    }
    if (await B2BJob.exists({ _id: id })) {
      return res.status(403).json({ success: false, message: 'You do not have access to this job' });
    }

    // Check Booking — owned by this vendor or offered to it
    const booking = await Booking.findOne({ $and: [{ _id: id }, bookingScopeFor(vid)] }).lean();
    if (booking) {
      const owned = String(booking.vendorId || '') === String(vid);
      return res.status(200).json({
        success: true,
        data: {
          id: booking._id.toString(),
          requestId: booking.bookingNumber || `BK-${String(booking._id).slice(-6)}`,
          title: booking.serviceName || 'Direct Booking',
          source: 'USER PROJECT',
          sourceType: 'user',
          jobSource: 'USER_APP',
          categoryName: booking.serviceCategory,
          categoryCode: booking.serviceCategory,
          customerName: owned ? booking.address?.name || 'Customer' : 'Customer',
          customerPhone: '',
          city: booking.address?.city,
          address: owned ? [booking.address?.addressLine1, booking.address?.city].filter(Boolean).join(', ') : '',
          description: booking.description || '',
          requestedDate: booking.scheduledDate || booking.createdAt,
          estimatedAmount: booking.finalAmount || booking.totalAmount || 0,
          priority: 'normal',
          status: booking.status,
          createdAt: booking.createdAt,
          itemType: 'booking',
          assignedEngineer: null,
          attachments: booking.serviceImages || []
        }
      });
    }
    if (await Booking.exists({ _id: id })) {
      return res.status(403).json({ success: false, message: 'You do not have access to this booking' });
    }

    return res.status(404).json({ success: false, message: 'Request not found' });
  } catch (error) {
    console.error('getRequestDetails error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch request details' });
  }
};

/**
 * POST /api/vendor/requests/:id/accept
 * Accept a User Request or B2B Job
 */
exports.acceptRequest = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const actor = { id: vid, role: 'vendor' };
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    // 1. Opportunity accept
    const opp = await Opportunity.findById(id);
    if (opp) {
      if (!(await vendorCanSeeOpportunity(opp.toObject(), vid))) {
        return res.status(403).json({ success: false, message: 'You do not have access to this request' });
      }
      const claim = await onVendorAccepted(id, vid);
      if (!claim.ok) {
        return res.status(409).json({ success: false, message: claim.message || 'Opportunity is no longer available' });
      }

      const updatedOpp = claim.opportunity;

      // An opportunity that fronts a B2B job: the vendor takes the SAME job
      // (no separate ops-project copy of the job).
      const linkedJobId = updatedOpp?.assignment?.b2bJobId;
      if (linkedJobId) {
        const { vendorClaimJob } = require('../../services/jobAssignment.service');
        const { job } = await vendorClaimJob({ jobId: linkedJobId, vendorId: vid, actor });
        return res.status(200).json({
          success: true,
          message: 'Job accepted! Please assign an engineer for field execution.',
          data: { requestId: job.jobId, jobId: job._id, itemType: 'b2b_job' }
        });
      }

      const opsProject = await createOpsProjectFromOpportunity({
        opportunity: updatedOpp,
        vendorId: vid
      });

      return res.status(200).json({
        success: true,
        message: 'Request accepted successfully! You can now assign an engineer.',
        data: {
          requestId: updatedOpp.opportunityCode,
          projectId: opsProject?._id || null,
          projectCode: opsProject?.projectCode || null,
          itemType: 'opportunity'
        }
      });
    }

    // 2. B2B job: this vendor already holds it, or it is an open offer to it.
    const b2bJob = await B2BJob.findById(id).select('assignedVendorId notifiedVendors vendorRejections assignedTo lifecycleStatus status allocationStage jobId').lean();
    if (b2bJob) {
      if (String(b2bJob.assignedVendorId || '') === String(vid)) {
        return res.status(200).json({
          success: true,
          message: 'B2B Job already accepted. Please assign an engineer for field execution.',
          data: { requestId: b2bJob.jobId, jobId: b2bJob._id, itemType: 'b2b_job' }
        });
      }
      const offered = await B2BJob.exists({ _id: id, ...openVendorOfferFilter(vid) });
      if (!offered) {
        const everOffered = (b2bJob.notifiedVendors || []).some((v) => String(v) === String(vid));
        return res.status(everOffered ? 409 : 403).json({
          success: false,
          message: everOffered
            ? 'This job was just claimed by another vendor or engineer and is no longer available.'
            : 'This job was not offered to you'
        });
      }
      const { vendorClaimJob } = require('../../services/jobAssignment.service');
      const { job } = await vendorClaimJob({ jobId: id, vendorId: vid, actor });
      return res.status(200).json({
        success: true,
        message: 'B2B Job accepted! Please assign an engineer for field execution.',
        data: { requestId: job.jobId, jobId: job._id, itemType: 'b2b_job' }
      });
    }

    // 3. Booking offered to this vendor — atomic claim, first vendor wins.
    const bookingExists = await Booking.exists({ _id: id });
    if (bookingExists) {
      const claimed = await Booking.findOneAndUpdate(
        {
          _id: id,
          vendorId: null,
          status: { $in: BOOKING_OFFER_STATUSES },
          $or: [{ 'potentialVendors.vendorId': vid }, { notifiedVendors: vid }]
        },
        { $set: { vendorId: vid, status: 'accepted', acceptedAt: new Date() } },
        { new: true }
      );
      if (!claimed) {
        const owned = await Booking.exists({ _id: id, vendorId: vid });
        if (owned) {
          return res.status(200).json({ success: true, message: 'Booking already accepted.', data: { bookingId: id, itemType: 'booking' } });
        }
        return res.status(403).json({ success: false, message: 'This booking is not available to you' });
      }

      return res.status(200).json({
        success: true,
        message: 'Direct Booking accepted! Please assign a worker.',
        data: {
          requestId: claimed.bookingNumber || claimed._id,
          bookingId: claimed._id,
          itemType: 'booking'
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Request not found' });
  } catch (error) {
    return sendJobError(res, error, 'Failed to accept request');
  }
};

/**
 * POST /api/vendor/requests/:id/reject
 * Decline an offer, or hand back a job the vendor holds but has not started.
 */
exports.rejectRequest = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const actor = { id: vid, role: 'vendor' };
    const { id } = req.params;
    const reason = String(req.body?.reason || 'Vendor declined').slice(0, 300);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    // 1. Opportunity decline
    const opp = await Opportunity.findById(id);
    if (opp) {
      const result = await recordVendorReject(id, vid, reason);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message || 'Failed to decline request' });
      }
      return res.status(200).json({ success: true, message: 'Request rejected. Removed from your active queue.' });
    }

    const b2bJob = await B2BJob.findById(id).lean();
    if (b2bJob) {
      const { recordJobEvent } = require('../../services/jobLifecycle.service');
      const { onVendorOfferDeclined } = require('../../services/b2bMatchingService');

      // 2a. Declining an open offer: only this vendor drops out; the job keeps
      // routing to others and escalates only when every option is exhausted.
      if (await B2BJob.exists({ _id: id, ...openVendorOfferFilter(vid) })) {
        await B2BJob.updateOne(
          { _id: id },
          { $push: { vendorRejections: { vendorId: vid, reason, rejectedAt: new Date(), kind: 'offer_declined' } } }
        );
        await recordJobEvent({ jobId: id, event: 'VENDOR_DECLINED', actor, remark: `Vendor declined the request: ${reason}` });
        await onVendorOfferDeclined(id);
        return res.status(200).json({ success: true, message: 'B2B Job request declined.' });
      }

      // 2b. Handing back a job the vendor holds, before any engineer took it:
      // the job returns to routing (it is never silently dropped).
      if (String(b2bJob.assignedVendorId || '') === String(vid)) {
        const { vendorReleaseJob } = require('../../services/jobAssignment.service');
        await vendorReleaseJob({ jobId: id, vendorId: vid, actor, reason });
        return res.status(200).json({ success: true, message: 'Job handed back. It will be routed to another vendor.' });
      }

      return res.status(403).json({ success: false, message: 'This job is not held by or offered to you' });
    }

    // 3. Booking: a vendor can decline an offer; it never cancels the user's booking.
    const booking = await Booking.findOne({ $and: [{ _id: id }, bookingScopeFor(vid)] }).select('vendorId').lean();
    if (booking) {
      if (String(booking.vendorId || '') === String(vid)) {
        return res.status(409).json({
          success: false,
          message: 'You have already accepted this booking. Use the booking cancellation flow instead.'
        });
      }
      await Booking.updateOne(
        { _id: id },
        { $pull: { potentialVendors: { vendorId: vid }, notifiedVendors: vid } }
      );
      return res.status(200).json({ success: true, message: 'Booking request declined.' });
    }
    if (await Booking.exists({ _id: id })) {
      return res.status(403).json({ success: false, message: 'This booking is not available to you' });
    }

    return res.status(404).json({ success: false, message: 'Request not found' });
  } catch (error) {
    return sendJobError(res, error, 'Failed to reject request');
  }
};

/**
 * POST /api/vendor/requests/:id/assign-engineer
 * Assign one of THIS vendor's engineers to an accepted project / job.
 */
exports.assignEngineerToRequest = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { engineerId, notes = '', scheduledAt = null } = req.body || {};

    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId) || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Please select a valid engineer' });
    }

    // B2B job → central assignment service (eligibility, history, notifications)
    const b2bJob = await B2BJob.findById(id).select('assignedVendorId assignedTo').lean();
    if (b2bJob) {
      if (String(b2bJob.assignedVendorId || '') !== String(vid)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to assign this job' });
      }
      const svc = require('../../services/jobAssignment.service');
      const actor = { id: vid, role: 'vendor' };
      const result = b2bJob.assignedTo
        ? await svc.reassignEngineer({ jobId: id, newEngineerId: engineerId, actor, vendorScopeId: vid, reason: notes || 'Reassigned by vendor' })
        : await svc.assignEngineer({ jobId: id, engineerId, actor, vendorScopeId: vid, reason: notes || 'Assigned by vendor' });
      return res.status(200).json({
        success: true,
        message: `B2B Job assigned to ${result.job.assignedToName}!`,
        data: { jobCode: result.job.jobId, engineerName: result.job.assignedToName, eligibility: result.eligibility }
      });
    }

    const engineerDoc = await resolveOwnEngineer(vid, engineerId);
    if (engineerDoc === null) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }
    if (engineerDoc === false) {
      return res.status(403).json({ success: false, message: 'This engineer does not belong to your organisation' });
    }
    const engId = engineerDoc._id;

    // Ops project (from an accepted user/B2B opportunity)
    const project = await VendorOpsProject.findOne({
      $or: [{ _id: id }, { opportunityId: id }],
      vendorId: vid
    });

    if (project) {
      const existingJob = await VendorOpsJob.findOne({ projectId: project._id, engineerId: engId });
      let opsJob = existingJob;
      if (!opsJob) {
        opsJob = new VendorOpsJob({
          vendorId: vid,
          projectId: project._id,
          opportunityId: project.opportunityId || null,
          engineerId: engId,
          engineerName: engineerDoc.name,
          title: project.title,
          clientName: project.clientName,
          clientPhone: '',
          city: project.city,
          serviceCategoryCode: project.serviceCategoryCode,
          serviceCategoryName: project.serviceCategoryName,
          budget: project.budget,
          priority: project.priority || 'normal',
          notes,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
          status: 'pending_acceptance'
        });
        await opsJob.save();
      }

      const hasEng = (project.assignedEngineers || []).some((e) => vidStr(e.engineerId) === vidStr(engId));
      if (!hasEng) {
        project.assignedEngineers = project.assignedEngineers || [];
        project.assignedEngineers.push({
          name: engineerDoc.name,
          role: 'Lead Engineer',
          status: 'assigned',
          engineerId: engId
        });
      }
      project.status = 'in_progress';
      project.currentStage = 'Engineer Assigned';
      await project.save();

      await VendorWorkforceEngineer.updateOne(
        { linkedEngineerId: engId, vendorId: vid },
        { $set: { availability: 'on_project', todayTask: project.title } }
      ).catch(() => {});

      try {
        const io = getIO();
        if (io) {
          io.to(`engineer:${engId.toString()}`).emit('job_assigned', {
            jobId: opsJob._id,
            jobCode: opsJob.jobCode,
            title: opsJob.title,
            clientName: project.clientName,
            city: project.city
          });
          io.to(`vendor:${vid.toString()}`).emit('project_update', {
            projectId: project._id,
            status: 'in_progress',
            assignedEngineer: engineerDoc.name
          });
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: `Job assigned to ${engineerDoc.name}! Request sent to their Engineer Panel.`,
        data: {
          jobCode: opsJob.jobCode,
          engineerName: engineerDoc.name,
          projectCode: project.projectCode
        }
      });
    }

    // Booking owned by this vendor and not yet in the field
    const booking = await Booking.findOne({ _id: id });
    if (booking) {
      if (String(booking.vendorId || '') !== String(vid)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to assign this booking' });
      }
      if (!['accepted', 'confirmed', 'scheduled', 'assigned'].includes(booking.status)) {
        return res.status(409).json({ success: false, message: `A booking in status "${booking.status}" cannot be assigned` });
      }
      booking.engineerId = engId;
      booking.status = 'assigned';
      booking.assignedAt = new Date();
      await booking.save();

      return res.status(200).json({
        success: true,
        message: `Booking assigned to ${engineerDoc.name}!`,
        data: {
          bookingId: booking.bookingNumber || booking._id,
          engineerName: engineerDoc.name
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Target project or job not found for assignment' });
  } catch (error) {
    return sendJobError(res, error, 'Failed to assign engineer');
  }
};

exports.resolveOwnEngineer = resolveOwnEngineer;
exports.bookingScopeFor = bookingScopeFor;
