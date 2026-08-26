/**
 * Business Intake Controller
 * All functions filter strictly by vendorId — vendors can NEVER see other vendors' data
 */
const Opportunity = require('../../models/Opportunity');
const VendorProposal = require('../../models/VendorProposal');
const Vendor = require('../../models/Vendor');
const ServiceRequest = require('../../models/ServiceRequest');
const ServiceConfig = require('../../models/ServiceConfig');
const mongoose = require('mongoose');
const { expandCategoryMatchCodes } = require('../../utils/serviceCategoryAliases');
const { onVendorAccepted, recordVendorReject } = require('../../services/projectAssignmentEngine.service');
const { createOpsProjectFromOpportunity } = require('../../utils/createOpsProjectFromOpportunity');

// ─────────────────────────────────────────────────────────
// HELPER: format currency
const formatINR = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

const vidStr = (id) => (id ? String(id) : '');

const vendorAssignmentFlags = (opp, vendorId) => {
  const queue = opp.assignment?.vendorQueue || [];
  if (!queue.length) {
    return { isMyTurnToRespond: true, assignmentActiveUntil: opp.assignment?.activeVendorUntil || null };
  }
  const active = queue.find((q) => q.status === 'active');
  const inQueue = queue.some((q) => vidStr(q.vendorId) === vidStr(vendorId));
  if (!active) {
    return {
      isMyTurnToRespond: inQueue && queue.some((q) => q.status === 'pending' && vidStr(q.vendorId) === vidStr(vendorId)),
      assignmentActiveUntil: null
    };
  }
  return {
    isMyTurnToRespond: vidStr(active.vendorId) === vidStr(vendorId),
    assignmentActiveUntil: opp.assignment?.activeVendorUntil || null
  };
};

/** Approved vendors can transact; verified KYC preferred but not hard-blocked for approved accounts */
const assertVendorCanBid = (vendor) => {
  if (!vendor) return { ok: false, status: 404, message: 'Vendor not found' };
  const kycVerified =
    vendor.kycStatus === 'verified' ||
    vendor.compliance?.kycStatus === 'verified';
  const approved = vendor.approvalStatus === 'approved';
  if (kycVerified || approved) return { ok: true, kycVerified, approved };
  return {
    ok: false,
    status: 403,
    message: 'Complete KYC verification (or get account approved) before bidding.',
    code: 'KYC_REQUIRED'
  };
};

const ensureLinkedProposal = async ({
  vendorId,
  opportunity,
  amount,
  proposalText,
  timeline,
  linkedBidId,
  status = 'sent'
}) => {
  const existing = linkedBidId
    ? await VendorProposal.findOne({ vendorId, linkedBidId }).lean()
    : await VendorProposal.findOne({
        vendorId,
        opportunityId: opportunity._id,
        status: { $in: ['sent', 'draft', 'viewed', 'accepted', 'negotiating'] }
      }).lean();
  if (existing) return existing;

  const subtotal = parseFloat(amount) || 0;
  const proposal = new VendorProposal({
    vendorId: new mongoose.Types.ObjectId(vendorId),
    opportunityId: opportunity._id,
    title: `Bid for: ${opportunity.title}`,
    coverLetter: proposalText || '',
    pricing: {
      lineItems: [],
      subtotal,
      gstPercentage: 18,
      gstAmount: subtotal * 0.18,
      totalAmount: subtotal * 1.18
    },
    timeline: { totalDays: parseInt(timeline, 10) || 30 },
    status,
    sentAt: status === 'sent' || status === 'accepted' ? new Date() : null,
    linkedBidId: linkedBidId || null
  });
  await proposal.save();
  return proposal;
};

// HELPER: Get vendor category codes (approvedServices + legacy categories; exclude suspended)
const getVendorCategoryCodes = (vendor) => {
  const fromApproved = (vendor?.approvedServices || [])
    .filter((s) => s.status !== 'suspended')
    .map((s) => s.categoryCode)
    .filter(Boolean);
  const fromLegacy = (vendor?.categories || []).filter((c) => {
    const code = String(c || '').trim();
    return /^C\d{2}$/i.test(code) || /^(WEB|APP|CCTV|SOLAR|ATM|NET|IT)$/i.test(code);
  });
  return [...new Set([...fromApproved, ...fromLegacy].map((c) => String(c).toUpperCase()))];
};

// HELPER: opportunity match scoped to vendor services (+ legacy aliases e.g. C01↔CCTV)
const buildOpportunityBaseFilter = async (vendorId, extra = {}) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices categories').lean();
  const codes = getVendorCategoryCodes(vendor);
  const matchCodes = await expandCategoryMatchCodes(codes);
  const filter = {
    eligibleVendors: new mongoose.Types.ObjectId(vendorId),
    ...extra
  };
  if (matchCodes.length) {
    filter.categoryCode = { $in: matchCodes };
  } else {
    // No configured services — still allow rows where vendor is explicitly eligible
    // (assignment engine already decided). Do not force categoryCode: [].
  }
  return { filter, codes, matchCodes, vendor };
};

// ─────────────────────────────────────────────────────────
// 1. GET /opportunities
// ─────────────────────────────────────────────────────────
const getOpportunities = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const {
      type,
      status,
      category,
      city,
      location,
      minBudget,
      maxBudget,
      budgetMin,
      budgetMax,
      priority,
      search,
      bookmarked,
      sort = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const { filter, codes, matchCodes } = await buildOpportunityBaseFilter(vendorId);
    const vid = new mongoose.Types.ObjectId(vendorId);

    // Default to open unless bookmarking (show all bookmarked) or status explicitly set
    const isBookmarkQuery = bookmarked === 'true' || bookmarked === true;
    const resolvedStatus = status !== undefined ? status : (isBookmarkQuery ? '' : 'open');
    if (resolvedStatus) filter.status = resolvedStatus;
    if (type) filter.type = type;
    // Explicit category filter must still be within approved services (+ aliases)
    if (category) {
      const code = String(category).toUpperCase();
      const allowed = await expandCategoryMatchCodes([code]);
      const overlap = allowed.filter((c) => matchCodes.includes(c));
      if (codes.length && !overlap.length && !matchCodes.includes(code)) {
        return res.status(200).json({
          success: true,
          data: [],
          typeCounts: {},
          pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 }
        });
      }
      filter.categoryCode = { $in: overlap.length ? overlap : [code] };
    }
    const cityFilter = city || location;
    if (cityFilter) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { 'requirements.cities': { $in: [new RegExp(cityFilter, 'i')] } },
          { 'clientInfo.city': new RegExp(cityFilter, 'i') }
        ]
      });
    }
    if (priority) filter.priority = priority;
    const resolvedMin = minBudget || budgetMin;
    const resolvedMax = maxBudget || budgetMax;
    if (resolvedMin) filter['budget.min'] = { $gte: Number(resolvedMin) };
    if (resolvedMax) filter['budget.max'] = { $lte: Number(resolvedMax) };
    if (bookmarked === 'true' || bookmarked === true) {
      filter['bookmarkedBy.vendorId'] = vid;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: searchRegex },
        { categoryName: searchRegex },
        { 'clientInfo.name': searchRegex },
        { 'clientInfo.company': searchRegex },
        { 'clientInfo.city': searchRegex },
        { 'requirements.cities': searchRegex },
        { subServices: searchRegex }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-bids.proposalText -bids.technicalBid -bids.financialBid -viewedBy')
        .lean(),
      Opportunity.countDocuments(filter)
    ]);

    // Mark as viewed (async, don't await)
    Opportunity.updateMany(
      {
        _id: { $in: opportunities.map(o => o._id) },
        'viewedBy.vendorId': { $ne: new mongoose.Types.ObjectId(vendorId) }
      },
      { $push: { viewedBy: { vendorId: new mongoose.Types.ObjectId(vendorId), viewedAt: new Date() } } }
    ).catch(err => console.error('View tracking error:', err));

    // Add hasMyBid / isBookmarked flags (not exposing other vendors' amounts)
    const enriched = opportunities.map(opp => {
      const myBid = opp.bids?.find(b => vidStr(b.vendorId) === vidStr(vendorId));
      const isBookmarked = (opp.bookmarkedBy || []).some(
        (b) => vidStr(b.vendorId) === vidStr(vendorId)
      );
      const assignmentFlags = vendorAssignmentFlags(opp, vendorId);
      return {
        ...opp,
        hasMyBid: !!myBid,
        myBidStatus: myBid?.status || null,
        myBidId: myBid?._id || null,
        myBidAmount: myBid?.amount ?? null,
        isBookmarked,
        ...assignmentFlags,
        bookmarkedBy: undefined,
        bids: undefined // remove all bids from list view
      };
    });

    // Get badge counts per type — scoped to approved services (+ aliases)
    const countMatch = {
      eligibleVendors: new mongoose.Types.ObjectId(vendorId),
      status: 'open'
    };
    if (matchCodes.length) countMatch.categoryCode = { $in: matchCodes };

    const counts = await Opportunity.aggregate([
      { $match: countMatch },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    const typeCounts = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});

    res.status(200).json({
      success: true,
      data: enriched,
      typeCounts,
      approvedServiceCodes: codes,
      matchCodes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('getOpportunities error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch opportunities' });
  }
};

// ─────────────────────────────────────────────────────────
// 2. GET /opportunities/:id
// ─────────────────────────────────────────────────────────
const getOpportunityById = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    }).lean();

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Opportunity not found or you are not eligible' });
    }

    // Mark as viewed (async)
    Opportunity.updateOne(
      { _id: id, 'viewedBy.vendorId': { $ne: new mongoose.Types.ObjectId(vendorId) } },
      { $push: { viewedBy: { vendorId: new mongoose.Types.ObjectId(vendorId), viewedAt: new Date() } } }
    ).catch(() => {});

    // Find MY bid only — hide other vendors' details
    const myBid = opportunity.bids?.find(b => vidStr(b.vendorId) === vidStr(vendorId));
    const totalBids = opportunity.bids?.length || 0;
    const isBookmarked = (opportunity.bookmarkedBy || []).some(
      (b) => vidStr(b.vendorId) === vidStr(vendorId)
    );

    return res.status(200).json({
      success: true,
      data: {
        ...opportunity,
        bids: undefined, // never expose other bids
        bookmarkedBy: undefined,
        totalBidsCount: totalBids,
        myBid: myBid || null,
        hasMyBid: !!myBid,
        myBidStatus: myBid?.status || null,
        isBookmarked,
        ...vendorAssignmentFlags(opportunity, vendorId)
      }
    });
  } catch (error) {
    console.error('getOpportunityById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch opportunity details' });
  }
};

// ─────────────────────────────────────────────────────────
// 3. POST /opportunities/:id/bid
// ─────────────────────────────────────────────────────────
const submitBid = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;
    const { amount, proposalText, timeline, teamSize, milestones, technicalBid, financialBid } = req.body;

    const vendor = await Vendor.findById(vendorId)
      .select('kycStatus compliance approvedServices approvalStatus')
      .lean();
    const gate = assertVendorCanBid(vendor);
    if (!gate.ok) {
      return res.status(gate.status).json({
        success: false,
        message: gate.message,
        code: gate.code
      });
    }

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Opportunity not found or you are not eligible' });
    }

    if (opportunity.status !== 'open') {
      return res.status(400).json({ success: false, message: 'This opportunity is no longer accepting bids' });
    }

    if (opportunity.deadline && new Date() > new Date(opportunity.deadline)) {
      return res.status(400).json({ success: false, message: 'Bid deadline has passed' });
    }

    const existingBid = opportunity.bids.find((b) => vidStr(b.vendorId) === vidStr(vendorId));
    if (existingBid) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted a bid for this opportunity',
        data: { bidId: existingBid._id, status: existingBid.status }
      });
    }

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid bid amount' });
    }

    opportunity.bids.push({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      amount: parseFloat(amount),
      proposalText: proposalText || '',
      timeline: parseInt(timeline, 10) || 30,
      teamSize: parseInt(teamSize, 10) || 1,
      milestones: milestones || [],
      technicalBid: technicalBid || '',
      financialBid: financialBid || '',
      status: 'submitted',
      submittedAt: new Date(),
      updatedAt: new Date()
    });

    await opportunity.save();
    const newBid = opportunity.bids[opportunity.bids.length - 1];

    let proposal = null;
    try {
      proposal = await ensureLinkedProposal({
        vendorId,
        opportunity,
        amount,
        proposalText: proposalText || technicalBid || financialBid || '',
        timeline,
        linkedBidId: newBid._id,
        status: 'sent'
      });
    } catch (propErr) {
      console.error('submitBid proposal create error (bid saved):', propErr);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to('admin-room').emit('new-bid-submitted', {
          opportunityId: id,
          opportunityTitle: opportunity.title,
          vendorId: vidStr(vendorId),
          amount,
          bidId: newBid._id
        });
      }
    } catch (socketErr) {
      console.warn('Socket emit failed (non-critical):', socketErr.message);
    }

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      const Vendor = require('../../models/Vendor');
      const vendorDoc = await Vendor.findById(vendorId).select('businessName name').lean();
      const targets = { notifyAllAdmins: true };
      if (opportunity.assignment?.b2bCompanyId) {
        targets.b2bCompanyId = opportunity.assignment.b2bCompanyId;
      }
      emitAsync('quote_submitted', {
        targets,
        data: {
          quoteId: newBid._id,
          opportunityId: opportunity._id,
          projectTitle: opportunity.title,
          vendorName: vendorDoc?.businessName || vendorDoc?.name,
          amount,
          vendorId: vidStr(vendorId),
          message: `${vendorDoc?.businessName || vendorDoc?.name || 'Vendor'} submitted a bid of ₹${Number(amount).toLocaleString('en-IN')} for ${opportunity.title}.`
        },
        actorId: vendorId
      });
    } catch (_) { /* non-blocking */ }

    res.status(201).json({
      success: true,
      message: 'Bid submitted successfully',
      data: {
        bidId: newBid._id,
        myBidStatus: 'submitted',
        hasMyBid: true,
        proposalId: proposal?._id || null,
        proposalCode: proposal?.proposalCode || null
      }
    });
  } catch (error) {
    console.error('submitBid error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to submit bid' });
  }
};

// ─────────────────────────────────────────────────────────
// 3b. POST /opportunities/:id/accept — client_request → award + project
// ─────────────────────────────────────────────────────────
const acceptClientRequest = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;
    const { amount, proposalText, timeline, teamSize } = req.body || {};

    const vendor = await Vendor.findById(vendorId)
      .select('kycStatus compliance approvalStatus')
      .lean();
    const gate = assertVendorCanBid(vendor);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, message: gate.message, code: gate.code });
    }

    let opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId),
      status: 'open'
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Request not found or already closed' });
    }

    const committedPhases = ['awaiting_engineer', 'awarded'];
    if (committedPhases.includes(opportunity.assignment?.phase)) {
      return res.status(409).json({
        success: false,
        message: 'This request is already committed to a vendor. Awaiting engineer acceptance.'
      });
    }

    // Queue-driven work (B2B jobs, service requests) is accept/reject, not bidding —
    // the assignment engine is already waiting on this vendor's response.
    const queue = opportunity.assignment?.vendorQueue || [];
    const isQueuedForMe = queue.some((q) => vidStr(q.vendorId) === vidStr(vendorId));
    const directAcceptTypes = ['client_request', 'direct_invitation'];
    if (!directAcceptTypes.includes(opportunity.type) && !isQueuedForMe) {
      return res.status(400).json({
        success: false,
        message: 'Use Submit Bid for this opportunity type, then wait for client award.'
      });
    }

    // Broadcast dispatch: several vendors can be 'active' (notified) at once for the
    // current batch. Just confirm this vendor is one of them — first to accept wins.
    if (queue.length) {
      const mine = queue.find((q) => vidStr(q.vendorId) === vidStr(vendorId));
      if (!mine || !['active', 'pending'].includes(mine.status)) {
        return res.status(403).json({
          success: false,
          message: 'This project is not currently awaiting your response.'
        });
      }
    }

    const requiredEngineers = opportunity.assignment?.requiredEngineers || 1;
    const committedTeam = parseInt(teamSize, 10) || 0;
    if (committedTeam < requiredEngineers) {
      return res.status(400).json({
        success: false,
        message: `Confirm team size of at least ${requiredEngineers} engineer(s) before accepting`
      });
    }

    if (opportunity.deadline && new Date() > new Date(opportunity.deadline)) {
      // Client requests stay accept-able while open; soft-warn only (response SLA is soft)
      if (opportunity.type !== 'client_request') {
        return res.status(400).json({ success: false, message: 'This request has expired' });
      }
    }

    // Broadcast dispatch means several vendors may hit accept within milliseconds of
    // each other — this atomically locks the opportunity to the first one through,
    // before any project/bid records are created, so two vendors can never both win.
    const claim = await onVendorAccepted(id, vendorId);
    if (!claim.ok) {
      return res.status(409).json({
        success: false,
        message: claim.message || 'This project is no longer available'
      });
    }
    opportunity = claim.opportunity;

    const paidSr = opportunity.assignment?.serviceRequestId
      ? await ServiceRequest.findById(opportunity.assignment.serviceRequestId)
          .select('payment.amount payment.status requestCode')
          .lean()
      : null;
    const customerPaid =
      paidSr?.payment?.status === 'paid' ? Number(paidSr.payment.amount) || 0 : 0;

    const bidAmount =
      parseFloat(amount) ||
      customerPaid ||
      opportunity.budget?.max ||
      opportunity.budget?.min ||
      0;
    let myBid = opportunity.bids.find((b) => vidStr(b.vendorId) === vidStr(vendorId));
    if (!myBid) {
      opportunity.bids.push({
        vendorId: new mongoose.Types.ObjectId(vendorId),
        amount: bidAmount,
        proposalText: proposalText || 'Accepted client request',
        timeline: parseInt(timeline, 10) || 30,
        teamSize: parseInt(teamSize, 10) || 1,
        status: 'accepted',
        submittedAt: new Date(),
        updatedAt: new Date()
      });
      myBid = opportunity.bids[opportunity.bids.length - 1];
    } else {
      myBid.status = 'accepted';
      myBid.updatedAt = new Date();
      if (bidAmount > 0) myBid.amount = bidAmount;
      if (committedTeam > 0) myBid.teamSize = committedTeam;
    }

    if (!opportunity.assignment) opportunity.assignment = {};
    opportunity.assignment.vendorTeamConfirmation = {
      teamSize: committedTeam,
      confirmedAt: new Date()
    };

    // Close others
    opportunity.bids.forEach((b) => {
      if (vidStr(b.vendorId) !== vidStr(vendorId) && b.status !== 'rejected') {
        b.status = 'rejected';
        b.rejectionReason = 'Another vendor accepted this request';
      }
    });

    const project = await createOpsProjectFromOpportunity(opportunity, vendorId, bidAmount);

    opportunity.awardedTo = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      projectId: project._id,
      awardedAt: null
    };
    await opportunity.save();

    let proposal = null;
    try {
      proposal = await ensureLinkedProposal({
        vendorId,
        opportunity,
        amount: bidAmount,
        proposalText: proposalText || 'Accepted client request',
        timeline,
        linkedBidId: myBid._id,
        status: 'accepted'
      });
      if (proposal && proposal.status !== 'accepted') {
        await VendorProposal.updateOne({ _id: proposal._id }, { status: 'accepted' });
      }
    } catch (e) {
      console.error('acceptClientRequest proposal error:', e.message);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to('admin-room').emit('client-request-accepted', {
          opportunityId: id,
          vendorId: vidStr(vendorId),
          projectId: project._id
        });
      }
    } catch (e) {}

    res.status(200).json({
      success: true,
      message: 'Request accepted. Project created — assign an engineer next.',
      data: {
        opportunityId: opportunity._id,
        projectId: project._id,
        projectCode: project.projectCode,
        proposalId: proposal?._id || null,
        status: 'vendor_committed',
        needsEngineerAssignment: true
      }
    });
  } catch (error) {
    console.error('acceptClientRequest error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to accept request' });
  }
};

// 3b-decline. POST /opportunities/:id/decline — client_request reject / skip
// ─────────────────────────────────────────────────────────
const declineClientRequest = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;
    const { reason } = req.body || {};

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId),
      status: 'open'
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Request not found or already closed' });
    }

    const result = await recordVendorReject(id, vendorId, reason || 'Vendor declined');
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.status(200).json({ success: true, message: 'Request declined. Next vendor will be notified if available.' });
  } catch (error) {
    console.error('declineClientRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to decline request' });
  }
};

// ─────────────────────────────────────────────────────────
// 3c. POST /opportunities/:id/award — award to me (I already bid)
//     Used when client/ops confirms the vendor's bid (MVP until client portal award exists)
// ─────────────────────────────────────────────────────────
const awardMyBid = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Opportunity not found' });
    }

    if (opportunity.status === 'awarded' && vidStr(opportunity.awardedTo?.vendorId) === vidStr(vendorId)) {
      return res.status(200).json({
        success: true,
        message: 'Already awarded to you',
        data: { projectId: opportunity.awardedTo?.projectId || null, status: 'awarded' }
      });
    }

    if (opportunity.status !== 'open') {
      return res.status(400).json({ success: false, message: 'Opportunity is not open for award' });
    }

    const myBid = opportunity.bids.find((b) => vidStr(b.vendorId) === vidStr(vendorId));
    if (!myBid) {
      return res.status(400).json({
        success: false,
        message: 'Submit a bid first, then confirm award after client acceptance.'
      });
    }

    myBid.status = 'accepted';
    myBid.updatedAt = new Date();
    opportunity.bids.forEach((b) => {
      if (vidStr(b.vendorId) !== vidStr(vendorId) && b.status !== 'rejected') {
        b.status = 'rejected';
        b.rejectionReason = 'Another vendor was awarded';
      }
    });

    const project = await createOpsProjectFromOpportunity(opportunity, vendorId, myBid.amount);
    opportunity.status = 'awarded';
    opportunity.awardedTo = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      projectId: project._id,
      awardedAt: new Date()
    };
    await opportunity.save();

    await VendorProposal.updateMany(
      { vendorId: new mongoose.Types.ObjectId(vendorId), opportunityId: opportunity._id },
      { status: 'accepted' }
    );

    try {
      const { emitAsync } = require('../../services/notification/notificationOrchestrator.service');
      emitAsync('quote_approved', {
        targets: { vendorId },
        data: {
          quoteId: myBid?._id,
          opportunityId: opportunity._id,
          projectId: project._id,
          projectTitle: opportunity.title,
          message: `Your bid for "${opportunity.title}" was awarded. Project ${project.projectCode} is ready.`
        },
        actorId: vendorId
      });
    } catch (_) { /* non-blocking */ }

    res.status(200).json({
      success: true,
      message: 'Award confirmed. Project created.',
      data: {
        projectId: project._id,
        projectCode: project.projectCode,
        status: 'awarded'
      }
    });
  } catch (error) {
    console.error('awardMyBid error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to award opportunity' });
  }
};

// PLACEHOLDER removed — see acceptClientRequest / awardMyBid above

// ─────────────────────────────────────────────────────────
// 4. PUT /opportunities/:id/bid/:bidId
// ─────────────────────────────────────────────────────────
const editBid = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id, bidId } = req.params;
    const { amount, proposalText, timeline, teamSize } = req.body;

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Opportunity not found' });
    }

    const bid = opportunity.bids.id(bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    if (bid.vendorId?.toString() !== vendorId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only edit your own bid' });
    }
    if (bid.status !== 'submitted') {
      return res.status(400).json({ success: false, message: 'Cannot edit bid after it is under review' });
    }
    if (opportunity.deadline && new Date() > new Date(opportunity.deadline)) {
      return res.status(400).json({ success: false, message: 'Bid deadline has passed' });
    }

    if (amount) bid.amount = parseFloat(amount);
    if (proposalText !== undefined) bid.proposalText = proposalText;
    if (timeline) bid.timeline = parseInt(timeline);
    if (teamSize) bid.teamSize = parseInt(teamSize);
    bid.updatedAt = new Date();

    await opportunity.save();

    res.status(200).json({ success: true, message: 'Bid updated successfully', data: bid });
  } catch (error) {
    console.error('editBid error:', error);
    res.status(500).json({ success: false, message: 'Failed to update bid' });
  }
};

// ─────────────────────────────────────────────────────────
// 5. GET /invitations
// ─────────────────────────────────────────────────────────
const getInvitations = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { status = 'open', page = 1, limit = 20 } = req.query;

    const filter = {
      type: 'direct_invitation',
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invitations, total] = await Promise.all([
      Opportunity.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-bids -viewedBy')
        .lean(),
      Opportunity.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: invitations,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('getInvitations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invitations' });
  }
};

// ─────────────────────────────────────────────────────────
// 6. POST /invitations/:id/accept
// ─────────────────────────────────────────────────────────
const acceptInvitation = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const opportunity = await Opportunity.findOne({
      _id: id,
      type: 'direct_invitation',
      eligibleVendors: new mongoose.Types.ObjectId(vendorId),
      status: 'open'
    });

    if (!opportunity) return res.status(404).json({ success: false, message: 'Invitation not found or already closed' });
    if (opportunity.deadline && new Date() > new Date(opportunity.deadline)) {
      return res.status(400).json({ success: false, message: 'Invitation has expired' });
    }

    // Add a bid with accepted status
    const existingBid = opportunity.bids.find(b => b.vendorId?.toString() === vendorId.toString());
    if (!existingBid) {
      opportunity.bids.push({
        vendorId: new mongoose.Types.ObjectId(vendorId),
        amount: opportunity.budget?.max || 0,
        proposalText: 'Accepted direct invitation',
        status: 'accepted',
        submittedAt: new Date()
      });
    }

    opportunity.status = 'awarded';
    opportunity.awardedTo = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      awardedAt: new Date()
    };

    let project = null;
    try {
      project = await createOpsProjectFromOpportunity(
        opportunity,
        vendorId,
        opportunity.budget?.max || opportunity.budget?.min || 0
      );
      opportunity.awardedTo.projectId = project._id;
    } catch (projErr) {
      console.error('acceptInvitation project create error:', projErr.message);
    }

    await opportunity.save();

    // Emit socket to admin
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('admin-room').emit('invitation-accepted', {
          opportunityId: id,
          vendorId: vendorId.toString(),
          projectId: project?._id || null
        });
      }
    } catch (e) {}

    res.status(200).json({
      success: true,
      message: 'Invitation accepted successfully',
      data: { projectId: project?._id || null, projectCode: project?.projectCode || null }
    });
  } catch (error) {
    console.error('acceptInvitation error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept invitation' });
  }
};

// ─────────────────────────────────────────────────────────
// 7. POST /invitations/:id/decline
// ─────────────────────────────────────────────────────────
const declineInvitation = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const opportunity = await Opportunity.findOne({
      _id: id,
      type: 'direct_invitation',
      eligibleVendors: new mongoose.Types.ObjectId(vendorId),
      status: 'open'
    });

    if (!opportunity) return res.status(404).json({ success: false, message: 'Invitation not found' });

    // Add a rejected bid to track
    opportunity.bids.push({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      amount: 0,
      proposalText: reason || 'Declined',
      status: 'rejected',
      rejectionReason: reason || '',
      submittedAt: new Date()
    });

    // Remove this vendor from eligibleVendors so they won't see it again
    opportunity.eligibleVendors = opportunity.eligibleVendors.filter(v => v.toString() !== vendorId.toString());
    await opportunity.save();

    res.status(200).json({ success: true, message: 'Invitation declined' });
  } catch (error) {
    console.error('declineInvitation error:', error);
    res.status(500).json({ success: false, message: 'Failed to decline invitation' });
  }
};

// ─────────────────────────────────────────────────────────
// 8. GET /proposals
// ─────────────────────────────────────────────────────────
const getProposals = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [proposals, total, statusCounts] = await Promise.all([
      VendorProposal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('opportunityId', 'title categoryName clientInfo.company clientInfo.name requirements.cities budget')
        .lean(),
      VendorProposal.countDocuments(filter),
      VendorProposal.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const counts = statusCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});

    res.status(200).json({
      success: true,
      data: proposals,
      statusCounts: {
        all: Object.values(counts).reduce((s, v) => s + v, 0),
        draft: counts.draft || 0,
        sent: counts.sent || 0,
        viewed: counts.viewed || 0,
        accepted: counts.accepted || 0,
        rejected: counts.rejected || 0,
        negotiating: counts.negotiating || 0,
      },
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('getProposals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch proposals' });
  }
};

// ─────────────────────────────────────────────────────────
// 9. GET /proposals/:id
// ─────────────────────────────────────────────────────────
const getProposalById = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const proposal = await VendorProposal.findOne({
      _id: id,
      vendorId: new mongoose.Types.ObjectId(vendorId)
    }).populate('opportunityId', 'title categoryName clientInfo requirements budget').lean();

    if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found' });

    res.status(200).json({ success: true, data: proposal });
  } catch (error) {
    console.error('getProposalById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch proposal' });
  }
};

// ─────────────────────────────────────────────────────────
// 10. POST /proposals
// ─────────────────────────────────────────────────────────
const createProposal = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { opportunityId, title, coverLetter, pricing, timeline, teamStructure } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'Proposal title is required' });

    // If linked to opportunity, validate eligibility
    if (opportunityId) {
      const opp = await Opportunity.findOne({
        _id: opportunityId,
        eligibleVendors: new mongoose.Types.ObjectId(vendorId)
      });
      if (!opp) return res.status(404).json({ success: false, message: 'Opportunity not found or not eligible' });
    }

    const proposal = new VendorProposal({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      opportunityId: opportunityId ? new mongoose.Types.ObjectId(opportunityId) : null,
      title,
      coverLetter: coverLetter || '',
      pricing: pricing || {},
      timeline: timeline || {},
      teamStructure: teamStructure || [],
      status: 'draft'
    });

    await proposal.save();

    res.status(201).json({ success: true, message: 'Proposal created', data: proposal });
  } catch (error) {
    console.error('createProposal error:', error);
    res.status(500).json({ success: false, message: 'Failed to create proposal' });
  }
};

// ─────────────────────────────────────────────────────────
// 11. PUT /proposals/:id
// ─────────────────────────────────────────────────────────
const updateProposal = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const proposal = await VendorProposal.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found' });
    if (proposal.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft proposals can be edited' });
    }

    const { title, coverLetter, pricing, timeline, teamStructure, attachments } = req.body;
    if (title) proposal.title = title;
    if (coverLetter !== undefined) proposal.coverLetter = coverLetter;
    if (pricing) proposal.pricing = { ...proposal.pricing, ...pricing };
    if (timeline) proposal.timeline = { ...proposal.timeline, ...timeline };
    if (teamStructure) proposal.teamStructure = teamStructure;
    if (attachments) proposal.attachments = attachments;

    await proposal.save();

    res.status(200).json({ success: true, message: 'Proposal updated', data: proposal });
  } catch (error) {
    console.error('updateProposal error:', error);
    res.status(500).json({ success: false, message: 'Failed to update proposal' });
  }
};

// ─────────────────────────────────────────────────────────
// 12. POST /proposals/:id/send
// ─────────────────────────────────────────────────────────
const sendProposal = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const proposal = await VendorProposal.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found' });
    if (proposal.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Only draft proposals can be sent' });
    }
    if (!proposal.coverLetter && !proposal.pricing?.totalAmount) {
      return res.status(400).json({ success: false, message: 'Please complete the proposal before sending' });
    }

    proposal.status = 'sent';
    proposal.sentAt = new Date();
    await proposal.save();

    res.status(200).json({ success: true, message: 'Proposal sent successfully', data: proposal });
  } catch (error) {
    console.error('sendProposal error:', error);
    res.status(500).json({ success: false, message: 'Failed to send proposal' });
  }
};

// ─────────────────────────────────────────────────────────
// 13. GET /proposals/:id/download-pdf
// ─────────────────────────────────────────────────────────
const downloadProposalPdf = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;

    const proposal = await VendorProposal.findOne({ _id: id, vendorId: new mongoose.Types.ObjectId(vendorId) })
      .populate('opportunityId', 'title clientInfo')
      .lean();

    if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found' });

    const vendor = await Vendor.findById(vendorId).select('name businessName email phone address').lean();

    // Generate PDF with pdfkit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${proposal.proposalCode}.pdf"`);
    doc.pipe(res);

    // Colors
    const PRIMARY = '#1e40af';
    const DARK = '#111827';
    const GRAY = '#6b7280';
    const LIGHT = '#f3f4f6';

    // Header
    doc.rect(0, 0, doc.page.width, 90).fill(PRIMARY);
    doc.fillColor('white').fontSize(22).font('Helvetica-Bold')
      .text('WBI PARTNER PROPOSAL', 50, 30);
    doc.fontSize(10).font('Helvetica')
      .text(`${proposal.proposalCode}  |  ${new Date(proposal.createdAt).toLocaleDateString('en-IN')}`, 50, 58);

    // Vendor Info
    doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
      .text('From:', 50, 110);
    doc.fontSize(11).font('Helvetica')
      .text(vendor?.businessName || vendor?.name || 'Vendor', 50, 130)
      .text(vendor?.email || '', 50, 147)
      .text(vendor?.phone || '', 50, 164);

    // Client Info
    if (proposal.opportunityId?.clientInfo) {
      doc.fontSize(13).font('Helvetica-Bold').text('To:', 350, 110);
      doc.fontSize(11).font('Helvetica')
        .text(proposal.opportunityId.clientInfo.company || proposal.opportunityId.clientInfo.name || '', 350, 130)
        .text(proposal.opportunityId.clientInfo.city || '', 350, 147);
    }

    // Divider
    doc.moveTo(50, 195).lineTo(550, 195).strokeColor(LIGHT).stroke();

    // Title
    doc.fillColor(PRIMARY).fontSize(16).font('Helvetica-Bold')
      .text(proposal.title, 50, 210);

    // Opportunity link
    if (proposal.opportunityId?.title) {
      doc.fillColor(GRAY).fontSize(10).font('Helvetica')
        .text(`Opportunity: ${proposal.opportunityId.title}`, 50, 235);
    }

    // Cover Letter
    let y = 260;
    if (proposal.coverLetter) {
      doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Cover Letter', 50, y); y += 20;
      doc.fontSize(10).font('Helvetica').fillColor('#374151')
        .text(proposal.coverLetter, 50, y, { width: 500, lineGap: 3 });
      y = doc.y + 20;
    }

    // Pricing Table
    if (proposal.pricing?.lineItems?.length || proposal.pricing?.totalAmount) {
      doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Pricing', 50, y); y += 15;
      doc.rect(50, y, 500, 20).fill(PRIMARY);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
        .text('Description', 55, y + 5)
        .text('Qty', 310, y + 5)
        .text('Unit Price', 380, y + 5)
        .text('Total', 470, y + 5);
      y += 20;

      const items = proposal.pricing.lineItems || [];
      if (items.length === 0) {
        // Single line for total
        doc.rect(50, y, 500, 18).fill('#f9fafb');
        doc.fillColor(DARK).fontSize(9).font('Helvetica')
          .text('Total Project Value', 55, y + 4)
          .text(formatINR(proposal.pricing.totalAmount), 470, y + 4);
        y += 18;
      } else {
        items.forEach((item, idx) => {
          doc.rect(50, y, 500, 18).fill(idx % 2 === 0 ? '#f9fafb' : 'white');
          doc.fillColor(DARK).fontSize(9).font('Helvetica')
            .text(item.description, 55, y + 4, { width: 250 })
            .text(String(item.quantity || 1), 310, y + 4)
            .text(formatINR(item.unitPrice), 380, y + 4)
            .text(formatINR(item.total), 470, y + 4);
          y += 18;
        });
      }

      y += 5;
      if (proposal.pricing.gstAmount) {
        doc.fillColor(GRAY).fontSize(9)
          .text(`GST (${proposal.pricing.gstPercentage || 18}%):`, 380, y)
          .text(formatINR(proposal.pricing.gstAmount), 470, y);
        y += 16;
      }
      doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold')
        .text('Total Amount:', 380, y)
        .text(formatINR(proposal.pricing.totalAmount), 470, y);
      y += 30;
    }

    // Timeline
    if (proposal.timeline?.totalDays) {
      doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Project Timeline', 50, y); y += 20;
      doc.fontSize(10).font('Helvetica').fillColor('#374151')
        .text(`Total Duration: ${proposal.timeline.totalDays} days`, 50, y); y += 15;

      const phases = proposal.timeline.phases || [];
      phases.forEach(phase => {
        doc.fontSize(9).fillColor(GRAY).text(`• ${phase.name}: ${phase.duration} days`, 60, y);
        y += 14;
      });
      y += 15;
    }

    // Team
    if (proposal.teamStructure?.length) {
      doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Team Structure', 50, y); y += 20;
      proposal.teamStructure.forEach(member => {
        doc.fontSize(9).fillColor('#374151').text(`• ${member.count}x ${member.role}${member.experience ? ` (${member.experience})` : ''}`, 60, y);
        y += 14;
      });
      y += 15;
    }

    // Footer
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill(PRIMARY);
    doc.fillColor('white').fontSize(8).text(
      `Generated by WBI Partner Portal  |  Valid until ${proposal.pricing?.validUntil ? new Date(proposal.pricing.validUntil).toLocaleDateString('en-IN') : 'N/A'}`,
      50, doc.page.height - 25
    );

    doc.end();
  } catch (error) {
    console.error('downloadProposalPdf error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
};

// ─────────────────────────────────────────────────────────
// 14. GET /accepted-work
// ─────────────────────────────────────────────────────────
const getAcceptedWork = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const filter = {
      status: 'awarded',
      'awardedTo.vendorId': new mongoose.Types.ObjectId(vendorId)
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [work, total] = await Promise.all([
      Opportunity.find(filter)
        .sort({ 'awardedTo.awardedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Opportunity.countDocuments(filter)
    ]);

    // Enrich with my bid details
    const enriched = work.map(opp => {
      const myBid = opp.bids?.find(b => b.vendorId?.toString() === vendorId.toString());
      return {
        ...opp,
        bids: undefined,
        myBidAmount: myBid?.amount || 0,
        myBidStatus: myBid?.status || 'accepted',
        projectId: opp.awardedTo?.projectId || null,
        wonAt: opp.awardedTo?.awardedAt || opp.updatedAt
      };
    });

    // Monthly stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const wonThisMonth = await Opportunity.countDocuments({
      ...filter,
      'awardedTo.awardedAt': { $gte: startOfMonth }
    });

    const totalValue = enriched.reduce((sum, w) => sum + (w.myBidAmount || 0), 0);

    res.status(200).json({
      success: true,
      data: enriched,
      stats: { wonThisMonth, totalValue },
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('getAcceptedWork error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch accepted work' });
  }
};

// ─────────────────────────────────────────────────────────
// 15. GET /counts (Sidebar badge counts)
// ─────────────────────────────────────────────────────────
const getCounts = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const vid = new mongoose.Types.ObjectId(vendorId);
    const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
    const codes = getVendorCategoryCodes(vendor);
    const matchCodes = await expandCategoryMatchCodes(codes);
    const oppScope = { eligibleVendors: vid, status: 'open' };
    if (matchCodes.length) oppScope.categoryCode = { $in: matchCodes };
    else oppScope.categoryCode = { $in: [] };

    const [typeCounts, invitationCount, pendingProposals, acceptedWork, acceptedThisWeek, pendingQuotes] = await Promise.all([
      Opportunity.aggregate([
        { $match: oppScope },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Opportunity.countDocuments({ ...oppScope, type: 'direct_invitation' }),
      VendorProposal.countDocuments({ vendorId: vid, status: { $in: ['sent', 'viewed', 'negotiating'] } }),
      Opportunity.countDocuments({ status: 'awarded', 'awardedTo.vendorId': vid }),
      Opportunity.countDocuments({
        status: 'awarded',
        'awardedTo.vendorId': vid,
        'awardedTo.awardedAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }),
      Opportunity.countDocuments({
        ...oppScope,
        type: 'bid_quote_request',
        bids: { $not: { $elemMatch: { vendorId: vid } } }
      })
    ]);

    const counts = typeCounts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});
    const totalOpen = Object.values(counts).reduce((s, v) => s + v, 0);

    res.status(200).json({
      success: true,
      data: {
        allOpportunities: totalOpen,
        clientRequests: counts['client_request'] || 0,
        b2bOpportunities: counts['b2b_opportunity'] || 0,
        bulkRequirements: counts['bulk_requirement'] || 0,
        bidQuoteRequests: counts['bid_quote_request'] || 0,
        directInvitations: invitationCount,
        proposalsPending: pendingProposals,
        pendingQuotes: pendingQuotes + pendingProposals,
        acceptedWork,
        acceptedThisWeek,
        approvedServiceCodes: codes,
        matchCodes
      }
    });
  } catch (error) {
    console.error('getCounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

// ─────────────────────────────────────────────────────────
// 16. POST /opportunities/:id/bookmark
// ─────────────────────────────────────────────────────────
const bookmarkOpportunity = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;
    const vid = new mongoose.Types.ObjectId(vendorId);

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: vid
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Opportunity not found or not eligible' });
    }

    const already = (opportunity.bookmarkedBy || []).some(
      (b) => b.vendorId?.toString() === vendorId.toString()
    );

    if (!already) {
      opportunity.bookmarkedBy = opportunity.bookmarkedBy || [];
      opportunity.bookmarkedBy.push({ vendorId: vid, bookmarkedAt: new Date() });
      await opportunity.save();
    }

    res.status(200).json({ success: true, message: 'Bookmarked', data: { isBookmarked: true } });
  } catch (error) {
    console.error('bookmarkOpportunity error:', error);
    res.status(500).json({ success: false, message: 'Failed to bookmark opportunity' });
  }
};

// ─────────────────────────────────────────────────────────
// 17. DELETE /opportunities/:id/bookmark
// ─────────────────────────────────────────────────────────
const removeBookmark = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const { id } = req.params;
    const vid = new mongoose.Types.ObjectId(vendorId);

    const result = await Opportunity.updateOne(
      { _id: id, eligibleVendors: vid },
      { $pull: { bookmarkedBy: { vendorId: vid } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Opportunity not found or not eligible' });
    }

    res.status(200).json({ success: true, message: 'Bookmark removed', data: { isBookmarked: false } });
  } catch (error) {
    console.error('removeBookmark error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove bookmark' });
  }
};

// ─────────────────────────────────────────────────────────
// 18. GET /activity — recent Business Intake events for vendor
// ─────────────────────────────────────────────────────────
const getActivityFeed = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const vid = new mongoose.Types.ObjectId(vendorId);
    const limit = Math.min(parseInt(req.query.limit) || 10, 30);

    const { filter: oppScope, matchCodes } = await buildOpportunityBaseFilter(vendorId);
    // Activity includes open + recently awarded (drop status constraint for broader feed)
    delete oppScope.status;

    const [recentOpps, withBids, recentAwards, recentProposals] = await Promise.all([
      Opportunity.find({ ...oppScope, status: 'open' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title type createdAt categoryName')
        .lean(),
      Opportunity.find({
        eligibleVendors: vid,
        ...(matchCodes.length ? { categoryCode: { $in: matchCodes } } : {}),
        'bids.vendorId': vid
      })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select('title type bids categoryName updatedAt')
        .lean(),
      Opportunity.find({ status: 'awarded', 'awardedTo.vendorId': vid })
        .sort({ 'awardedTo.awardedAt': -1 })
        .limit(5)
        .select('title awardedTo categoryName')
        .lean(),
      VendorProposal.find({ vendorId: vid })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('title status updatedAt createdAt')
        .lean()
    ]);

    const bidEvents = withBids.flatMap((opp) => {
      const myBid = (opp.bids || []).find((b) => b.vendorId?.toString() === vendorId.toString());
      if (!myBid) return [];
      return [{ ...opp, myBid }];
    });

    const timeAgo = (date) => {
      if (!date) return '';
      const diff = Date.now() - new Date(date).getTime();
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    const events = [];

    recentOpps.forEach((o) => {
      const typeLabel =
        o.type === 'direct_invitation'
          ? 'Direct invitation'
          : o.type === 'client_request'
          ? 'New client request'
          : o.type === 'bulk_requirement'
          ? 'Bulk requirement'
          : o.type === 'bid_quote_request'
          ? 'New RFQ'
          : 'New opportunity';
      events.push({
        id: `opp-${o._id}`,
        type: 'opportunity',
        text: `${typeLabel}: ${o.title}`,
        time: timeAgo(o.createdAt),
        at: o.createdAt,
        colorKey: 'blue'
      });
    });

    bidEvents.forEach((o) => {
      const myBid = o.myBid || (o.bids || []).find((b) => b.vendorId?.toString() === vendorId.toString());
      if (!myBid) return;
      const statusText =
        myBid.status === 'shortlisted'
          ? 'Bid shortlisted'
          : myBid.status === 'accepted'
          ? 'Bid accepted'
          : myBid.status === 'rejected'
          ? 'Bid not selected'
          : 'Bid under review';
      events.push({
        id: `bid-${o._id}-${myBid._id}`,
        type: 'bid',
        text: `${statusText} for ${o.title}`,
        time: timeAgo(myBid.updatedAt || myBid.submittedAt),
        at: myBid.updatedAt || myBid.submittedAt,
        colorKey: myBid.status === 'accepted' ? 'green' : myBid.status === 'shortlisted' ? 'violet' : 'amber'
      });
    });

    recentAwards.forEach((o) => {
      events.push({
        id: `award-${o._id}`,
        type: 'award',
        text: `Project won: ${o.title}`,
        time: timeAgo(o.awardedTo?.awardedAt),
        at: o.awardedTo?.awardedAt,
        colorKey: 'green'
      });
    });

    recentProposals.forEach((p) => {
      events.push({
        id: `prop-${p._id}`,
        type: 'proposal',
        text: `Proposal ${p.status}: ${p.title}`,
        time: timeAgo(p.updatedAt || p.createdAt),
        at: p.updatedAt || p.createdAt,
        colorKey: 'blue'
      });
    });

    events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

    res.status(200).json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('getActivityFeed error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity feed' });
  }
};

module.exports = {
  getOpportunities,
  getOpportunityById,
  submitBid,
  acceptClientRequest,
  declineClientRequest,
  awardMyBid,
  editBid,
  getInvitations,
  acceptInvitation,
  declineInvitation,
  getProposals,
  getProposalById,
  createProposal,
  updateProposal,
  sendProposal,
  downloadProposalPdf,
  getAcceptedWork,
  getCounts,
  bookmarkOpportunity,
  removeBookmark,
  getActivityFeed
};
