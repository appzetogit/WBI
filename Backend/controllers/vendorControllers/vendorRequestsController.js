/**
 * Vendor Requests Controller
 * Unified operational controller for User Projects & B2B Jobs
 * Connects User App, B2B Portal, Vendor Dashboard, Engineer Panel, and Admin
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
const VendorProposal = require('../../models/VendorProposal');
const { expandCategoryMatchCodes } = require('../../utils/serviceCategoryAliases');
const { onVendorAccepted, recordVendorReject } = require('../../services/projectAssignmentEngine.service');
const { createOpsProjectFromOpportunity } = require('../../utils/createOpsProjectFromOpportunity');
const { getIO } = require('../../sockets');

const getVendorId = (req) => new mongoose.Types.ObjectId(req.user._id || req.user.id);
const vidStr = (id) => (id ? String(id) : '');

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

    const vendorDoc = await Vendor.findById(vid)
      .select('approvedServices categories service')
      .lean();
    if (!vendorDoc) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    const approvedCodes = (vendorDoc.approvedServices || [])
      .filter((s) => s.status !== 'suspended')
      .map((s) => s.categoryCode)
      .filter(Boolean);
    const legacyCats = Array.isArray(vendorDoc.categories) ? vendorDoc.categories : [];
    const matchCodes = expandCategoryMatchCodes([...approvedCodes, ...legacyCats]);

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
        Booking.find({
          $or: [
            { vendorId: vid },
            { vendorId: null, status: { $in: ['requested', 'searching'] }, 'potentialVendors.vendorId': vid }
          ]
        }).sort({ createdAt: -1 }).lean().catch(() => []),
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

          return {
            id: b._id.toString(),
            requestId: b.bookingId || `BK-${String(b._id).slice(-6)}`,
            title: b.serviceName || b.categoryName || 'Home Service Request',
            source: 'USER PROJECT',
            sourceType: 'user',
            categoryName: b.categoryName || 'Home Service',
            categoryCode: b.categoryCode || '',
            customerName: b.userName || b.contactName || 'Customer',
            customerPhone: b.userPhone || b.contactPhone || '',
            city: b.city || b.address?.city || 'Local',
            address: b.address?.addressLine || b.address?.fullAddress || '',
            description: b.notes || b.userNotes || '',
            requestedDate: b.scheduledDate || b.createdAt,
            estimatedAmount: b.totalAmount || b.estimatedAmount || 0,
            priority: 'normal',
            status: derivedStatus,
            rawStatus: b.status,
            createdAt: b.createdAt,
            assignedEngineer: b.workerName ? { name: b.workerName, phone: b.workerPhone } : null,
            itemType: 'booking',
            attachments: b.photos || []
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
        // Both jobs already assigned to this vendor AND jobs the matching
        // engine has routed here as a pending request (notifiedVendors) that
        // nobody has accepted yet — the latter previously never surfaced
        // anywhere, so a vendor had no way to see or act on a real request.
        B2BJob.find({
          $or: [
            { assignedVendorId: vid },
            { notifiedVendors: vid, assignedVendorId: null }
          ]
        })
          .populate('companyId', 'companyName name')
          .populate('assignedTo', 'name phone')
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
          let derivedStatus = 'new';
          if (['pending', 'searching_engineer'].includes(job.status)) derivedStatus = 'new';
          else if (['accepted'].includes(job.status)) derivedStatus = 'accepted';
          else if (['assigned'].includes(job.status)) derivedStatus = 'assigned';
          else if (['travelling', 'arrived', 'in_progress', 'completion_submitted'].includes(job.status)) derivedStatus = 'in_progress';
          else if (['completed', 'closed'].includes(job.status)) derivedStatus = 'completed';
          else if (['cancelled', 'rejected', 'failed'].includes(job.status)) derivedStatus = 'rejected';

          return {
            id: job._id.toString(),
            requestId: job.jobId,
            title: `${job.service} - ${job.subService || 'Inspection & Maintenance'}`,
            source: 'B2B JOB',
            sourceType: 'b2b',
            categoryName: job.service,
            categoryCode: job.service,
            customerName: job.companyId?.companyName || job.customerName || 'Enterprise Partner',
            customerPhone: job.phone || '',
            companyName: job.companyId?.companyName || 'Enterprise Client',
            city: job.city,
            address: job.address || '',
            description: `B2B Job for site ${job.siteId || 'Standard'}. Device: ${job.deviceId || 'N/A'}`,
            requestedDate: job.preferredDate || job.createdAt,
            estimatedAmount: job.charge || 0,
            totalSites: 1,
            priority: job.priority || 'Medium',
            status: derivedStatus,
            rawStatus: job.status,
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
 * Fetch detailed request data
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

    // Check B2BJob
    const b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid })
      .populate('companyId', 'companyName name')
      .populate('assignedTo', 'name phone email')
      .lean();
    if (b2bJob) {
      return res.status(200).json({
        success: true,
        data: {
          id: b2bJob._id.toString(),
          requestId: b2bJob.jobId,
          title: `${b2bJob.service} - ${b2bJob.subService || 'Work'}`,
          source: 'B2B JOB',
          sourceType: 'b2b',
          categoryName: b2bJob.service,
          categoryCode: b2bJob.service,
          customerName: b2bJob.customerName,
          customerPhone: b2bJob.phone,
          companyName: b2bJob.companyId?.companyName || 'Enterprise Partner',
          city: b2bJob.city,
          address: b2bJob.address,
          description: `Device ID: ${b2bJob.deviceId || 'N/A'}, Site ID: ${b2bJob.siteId || 'N/A'}`,
          requestedDate: b2bJob.preferredDate || b2bJob.createdAt,
          estimatedAmount: b2bJob.charge || 0,
          totalSites: 1,
          priority: b2bJob.priority || 'Medium',
          status: b2bJob.status,
          trackingStatus: b2bJob.trackingStatus,
          createdAt: b2bJob.createdAt,
          itemType: 'b2b_job',
          assignedEngineer: b2bJob.assignedTo ? { id: b2bJob.assignedTo._id, name: b2bJob.assignedTo.name, phone: b2bJob.assignedTo.phone } : null,
          attachments: []
        }
      });
    }

    // Check Booking
    const booking = await Booking.findOne({ _id: id }).lean();
    if (booking) {
      return res.status(200).json({
        success: true,
        data: {
          id: booking._id.toString(),
          requestId: booking.bookingId || `BK-${String(booking._id).slice(-6)}`,
          title: booking.serviceName || 'Direct Booking',
          source: 'USER PROJECT',
          sourceType: 'user',
          categoryName: booking.categoryName,
          categoryCode: booking.categoryCode,
          customerName: booking.userName || booking.contactName,
          customerPhone: booking.userPhone || booking.contactPhone,
          city: booking.city || booking.address?.city,
          address: booking.address?.addressLine || booking.address?.fullAddress,
          description: booking.notes || booking.userNotes || '',
          requestedDate: booking.scheduledDate || booking.createdAt,
          estimatedAmount: booking.totalAmount || 0,
          priority: 'normal',
          status: booking.status,
          createdAt: booking.createdAt,
          itemType: 'booking',
          assignedEngineer: booking.workerName ? { name: booking.workerName, phone: booking.workerPhone } : null,
          attachments: booking.photos || []
        }
      });
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
    const { id } = req.params;
    const { amount, proposalText, timeline, teamSize } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    // 1. Try Opportunity accept
    const opp = await Opportunity.findById(id);
    if (opp) {
      const claim = await onVendorAccepted(id, vid);
      if (!claim.ok) {
        return res.status(409).json({ success: false, message: claim.message || 'Opportunity is no longer available' });
      }

      const updatedOpp = claim.opportunity;
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

    // 2. Try B2BJob accept
    // Idempotent re-accept: this vendor already holds the job.
    let b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid });
    if (b2bJob) {
      return res.status(200).json({
        success: true,
        message: 'B2B Job already accepted. Please assign an engineer for field execution.',
        data: { requestId: b2bJob.jobId, jobId: b2bJob._id, itemType: 'b2b_job' }
      });
    }

    // Real acceptance: job is a pending request notified to this vendor and
    // nobody else has claimed it yet. Atomic so two vendors racing to accept
    // the same offer can't both win it.
    b2bJob = await B2BJob.findOneAndUpdate(
      {
        _id: id,
        notifiedVendors: vid,
        assignedVendorId: null,
        status: { $in: ['pending', 'searching_engineer'] }
      },
      {
        $set: {
          assignedVendorId: vid,
          status: 'accepted',
          acceptedAt: new Date(),
          allocationStage: 'allocated',
          allocationReason: 'Accepted by vendor. Awaiting engineer assignment.',
          allocationUpdatedAt: new Date()
        }
      },
      { new: true }
    );

    if (b2bJob) {
      try {
        const JobHistory = require('../../models/JobHistory');
        await JobHistory.create({
          jobId: b2bJob._id,
          status: 'accepted',
          remark: 'Vendor accepted the job request',
          role: 'vendor',
          changedBy: vid
        });
      } catch (_) {}

      // Emit real-time update to this vendor, and clear the offer from
      // every other vendor it was also offered to.
      try {
        const io = getIO();
        if (io) {
          io.to(`vendor:${vid.toString()}`).emit('b2b:jobStatusUpdated', {
            jobId: b2bJob._id.toString(),
            jobCode: b2bJob.jobId,
            status: 'accepted',
            updatedAt: new Date()
          });
          io.to(`b2b:${b2bJob.companyId.toString()}`).emit('b2b:jobStatusUpdated', {
            jobId: b2bJob._id.toString(),
            jobCode: b2bJob.jobId,
            status: 'accepted',
            updatedAt: new Date()
          });
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: 'B2B Job accepted! Please assign an engineer for field execution.',
        data: {
          requestId: b2bJob.jobId,
          jobId: b2bJob._id,
          itemType: 'b2b_job'
        }
      });
    }

    // A B2BJob with this id exists but the atomic claim failed — another
    // vendor already accepted it, or an engineer self-accepted it directly
    // in the meantime. Distinguish that race from "not a B2BJob at all" so
    // the Booking fallback below only runs for genuinely unrelated ids.
    if (mongoose.Types.ObjectId.isValid(id) && (await B2BJob.exists({ _id: id }))) {
      return res.status(409).json({
        success: false,
        message: 'This job was just claimed by another vendor or engineer and is no longer available.'
      });
    }

    // 3. Try Booking accept
    const booking = await Booking.findById(id);
    if (booking) {
      booking.vendorId = vid;
      booking.status = 'accepted';
      booking.acceptedAt = new Date();
      await booking.save();

      return res.status(200).json({
        success: true,
        message: 'Direct Booking accepted! Please assign a worker.',
        data: {
          requestId: booking.bookingId || booking._id,
          bookingId: booking._id,
          itemType: 'booking'
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Request not found' });
  } catch (error) {
    console.error('acceptRequest error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to accept request' });
  }
};

/**
 * POST /api/vendor/requests/:id/reject
 * Reject / decline a request with reason
 */
exports.rejectRequest = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { reason = 'Vendor declined' } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    // 1. Try Opportunity decline
    const opp = await Opportunity.findById(id);
    if (opp) {
      const result = await recordVendorReject(id, vid, reason);
      if (!result.ok) {
        return res.status(400).json({ success: false, message: result.message || 'Failed to decline request' });
      }
      return res.status(200).json({ success: true, message: 'Request rejected. Removed from your active queue.' });
    }

    // 2. Try B2BJob reject — a job merely OFFERED to this vendor (not yet
    // assigned to anyone). Rejecting only removes this vendor from the
    // offer; other vendors it was also offered to are unaffected. Only when
    // every notified vendor has declined, and nobody has claimed it, does
    // the job escalate to admin.
    const notifiedJob = await B2BJob.findOne({ _id: id, notifiedVendors: vid });
    if (notifiedJob) {
      const updated = await B2BJob.findOneAndUpdate(
        { _id: id },
        {
          $pull: { notifiedVendors: vid },
          $push: { vendorRejections: { vendorId: vid, reason, rejectedAt: new Date() } }
        },
        { new: true }
      );

      const stillLive = ['pending', 'searching_engineer', 'accepted', 'travelling', 'arrived', 'in_progress', 'completion_submitted', 'completed'].includes(updated.status);
      const noOneClaimedIt = !updated.assignedVendorId && !updated.assignedTo;
      const noVendorsLeft = !(updated.notifiedVendors || []).length;

      if (stillLive && noOneClaimedIt && noVendorsLeft && (updated.status === 'pending' || updated.status === 'searching_engineer')) {
        updated.status = 'escalated';
        updated.allocationStage = 'admin_escalation';
        updated.allocationReason = 'All notified vendors declined the request; no engineer accepted it either.';
        updated.allocationUpdatedAt = new Date();
        await updated.save();

        try {
          const { refundB2BJobEscrow } = require('../../services/escrowReleaseEngine.service');
          await refundB2BJobEscrow({ jobId: updated._id, reason: 'all_vendors_rejected' });
        } catch (refundErr) {
          console.warn('[rejectRequest] escrow refund on full rejection failed:', refundErr.message);
        }

        try {
          const { getIO: getSocketIO } = require('../../sockets');
          const io2 = getSocketIO();
          if (io2) {
            io2.to('admin').emit('admin:matchingVendorFallback', {
              jobId: updated.jobId,
              reason: 'all_vendors_rejected'
            });
          }
        } catch (_) {}
      }

      try {
        const io = getIO();
        if (io) {
          io.to(`vendor:${vid.toString()}`).emit('b2b:jobStatusUpdated', {
            jobId: updated._id.toString(),
            jobCode: updated.jobId,
            status: 'rejected',
            updatedAt: new Date()
          });
        }
      } catch (_) {}

      return res.status(200).json({ success: true, message: 'B2B Job request declined.' });
    }

    // Legacy path: a job already fully assigned to this vendor being
    // rejected after the fact (rare — kept for backward compatibility).
    const b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid });
    if (b2bJob) {
      b2bJob.status = 'rejected';
      b2bJob.rejectedBy = vid;
      b2bJob.rejectionReason = reason;
      b2bJob.rejectedAt = new Date();
      await b2bJob.save();

      try {
        const { refundB2BJobEscrow } = require('../../services/escrowReleaseEngine.service');
        await refundB2BJobEscrow({ jobId: b2bJob._id, reason: 'vendor_rejected_after_assignment' });
      } catch (refundErr) {
        console.warn('[rejectRequest] escrow refund failed:', refundErr.message);
      }

      // Emit real-time update
      try {
        const io = getIO();
        if (io) {
          io.to(`vendor:${vid.toString()}`).emit('b2b:jobStatusUpdated', {
            jobId: b2bJob._id.toString(),
            jobCode: b2bJob.jobId,
            status: 'rejected',
            updatedAt: new Date()
          });
        }
      } catch (_) {}

      return res.status(200).json({ success: true, message: 'B2B Job rejected.' });
    }

    // 3. Try Booking reject
    const booking = await Booking.findById(id);
    if (booking) {
      booking.status = 'rejected';
      booking.rejectionReason = reason;
      await booking.save();

      return res.status(200).json({ success: true, message: 'Booking rejected.' });
    }

    return res.status(404).json({ success: false, message: 'Request not found' });
  } catch (error) {
    console.error('rejectRequest error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to reject request' });
  }
};

/**
 * POST /api/vendor/requests/:id/assign-engineer
 * Assign an engineer to an accepted project / job
 */
exports.assignEngineerToRequest = async (req, res) => {
  try {
    const vid = getVendorId(req);
    const { id } = req.params;
    const { engineerId, notes = '', scheduledAt = null } = req.body || {};

    if (!engineerId || !mongoose.Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, message: 'Please select a valid engineer' });
    }

    // Verify engineer belongs to this vendor or is in workforce
    const engineerDoc = await Engineer.findById(engineerId).select('name phone email availability').lean();
    if (!engineerDoc) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    // 1. Check if id is a VendorOpsProject or Opportunity linked to a VendorOpsProject
    let project = await VendorOpsProject.findOne({
      $or: [{ _id: mongoose.Types.ObjectId.isValid(id) ? id : null }, { opportunityId: mongoose.Types.ObjectId.isValid(id) ? id : null }],
      vendorId: vid
    });

    if (project) {
      // Create or update VendorOpsJob
      const existingJob = await VendorOpsJob.findOne({ projectId: project._id, engineerId });
      let opsJob = existingJob;
      if (!opsJob) {
        opsJob = new VendorOpsJob({
          vendorId: vid,
          projectId: project._id,
          opportunityId: project.opportunityId || null,
          engineerId: new mongoose.Types.ObjectId(engineerId),
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

      // Add to project assignedEngineers array
      const hasEng = (project.assignedEngineers || []).some((e) => vidStr(e.engineerId) === vidStr(engineerId));
      if (!hasEng) {
        project.assignedEngineers = project.assignedEngineers || [];
        project.assignedEngineers.push({
          name: engineerDoc.name,
          role: 'Lead Engineer',
          status: 'assigned',
          engineerId: new mongoose.Types.ObjectId(engineerId)
        });
      }
      project.status = 'in_progress';
      project.currentStage = 'Engineer Assigned';
      await project.save();

      // Update Workforce availability
      await VendorWorkforceEngineer.updateOne(
        { engineerId, vendorId: vid },
        { $set: { availability: 'on_project', todayTask: project.title } }
      ).catch(() => {});

      // Notify Engineer via socket
      try {
        const io = getIO();
        if (io) {
          io.to(`engineer:${engineerId.toString()}`).emit('job_assigned', {
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

    // 2. Check B2BJob
    const b2bJob = await B2BJob.findOne({ _id: id, assignedVendorId: vid });
    if (b2bJob) {
      b2bJob.assignedTo = new mongoose.Types.ObjectId(engineerId);
      b2bJob.assignedToName = engineerDoc.name;
      b2bJob.status = 'assigned';
      b2bJob.assignedAt = new Date();
      await b2bJob.save();

      // Update Workforce availability
      await VendorWorkforceEngineer.updateOne(
        { engineerId, vendorId: vid },
        { $set: { availability: 'on_project', todayTask: b2bJob.service } }
      ).catch(() => {});

      // Notify Engineer via socket
      try {
        const io = getIO();
        if (io) {
          io.to(`engineer:${engineerId.toString()}`).emit('b2b:jobAssigned', {
            jobId: b2bJob._id,
            jobCode: b2bJob.jobId,
            service: b2bJob.service,
            customerName: b2bJob.customerName,
            city: b2bJob.city
          });
          io.to(`vendor:${vid.toString()}`).emit('b2b:jobStatusUpdated', {
            jobId: b2bJob._id,
            status: 'assigned',
            assignedToName: engineerDoc.name
          });
        }
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: `B2B Job assigned to ${engineerDoc.name}!`,
        data: {
          jobCode: b2bJob.jobId,
          engineerName: engineerDoc.name
        }
      });
    }

    // 3. Check Booking
    const booking = await Booking.findById(id);
    if (booking) {
      booking.workerId = new mongoose.Types.ObjectId(engineerId);
      booking.workerName = engineerDoc.name;
      booking.workerPhone = engineerDoc.phone;
      booking.status = 'assigned';
      await booking.save();

      return res.status(200).json({
        success: true,
        message: `Booking assigned to ${engineerDoc.name}!`,
        data: {
          bookingId: booking.bookingId || booking._id,
          engineerName: engineerDoc.name
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Target project or job not found for assignment' });
  } catch (error) {
    console.error('assignEngineerToRequest error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to assign engineer' });
  }
};
