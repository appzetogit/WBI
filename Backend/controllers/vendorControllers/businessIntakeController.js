/**
 * Business Intake Controller
 * All functions filter strictly by vendorId — vendors can NEVER see other vendors' data
 */
const Opportunity = require('../../models/Opportunity');
const VendorProposal = require('../../models/VendorProposal');
const Vendor = require('../../models/Vendor');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────
// HELPER: format currency
const formatINR = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

// HELPER: Get vendor categories
const getVendorCategoryCodes = (vendor) => {
  if (!vendor.approvedServices || !vendor.approvedServices.length) return [];
  return vendor.approvedServices
    .filter(s => s.status === 'active')
    .map(s => s.categoryCode);
};

// ─────────────────────────────────────────────────────────
// 1. GET /opportunities
// ─────────────────────────────────────────────────────────
const getOpportunities = async (req, res) => {
  try {
    const vendorId = req.user._id || req.user.id;
    const {
      type,
      status = 'open',
      category,
      city,
      minBudget,
      maxBudget,
      sort = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    // Base filter: vendor must be in eligibleVendors
    const filter = {
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    };

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (category) filter.categoryCode = category;
    if (city) filter['requirements.cities'] = { $in: [new RegExp(city, 'i')] };
    if (minBudget) filter['budget.min'] = { $gte: Number(minBudget) };
    if (maxBudget) filter['budget.max'] = { $lte: Number(maxBudget) };

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

    // Add hasMyBid flag (not exposing other vendors' amounts)
    const enriched = opportunities.map(opp => {
      const myBid = opp.bids?.find(b => b.vendorId?.toString() === vendorId.toString());
      return {
        ...opp,
        hasMyBid: !!myBid,
        myBidStatus: myBid?.status || null,
        myBidId: myBid?._id || null,
        bids: undefined // remove all bids from list view
      };
    });

    // Get badge counts per type
    const counts = await Opportunity.aggregate([
      { $match: { eligibleVendors: new mongoose.Types.ObjectId(vendorId), status: 'open' } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    const typeCounts = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});

    res.status(200).json({
      success: true,
      data: enriched,
      typeCounts,
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
    const myBid = opportunity.bids?.find(b => b.vendorId?.toString() === vendorId.toString());
    const totalBids = opportunity.bids?.length || 0;

    return res.status(200).json({
      success: true,
      data: {
        ...opportunity,
        bids: undefined, // never expose other bids
        totalBidsCount: totalBids,
        myBid: myBid || null
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

    // KYC check
    const vendor = await Vendor.findById(vendorId).select('kycStatus compliance approvedServices').lean();
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    const kycVerified = vendor.kycStatus === 'verified' || vendor.compliance?.kycStatus === 'verified';
    if (!kycVerified) {
      return res.status(403).json({
        success: false,
        message: 'Complete your KYC verification before submitting bids.',
        code: 'KYC_REQUIRED'
      });
    }

    const opportunity = await Opportunity.findOne({
      _id: id,
      eligibleVendors: new mongoose.Types.ObjectId(vendorId)
    });

    if (!opportunity) {
      return res.status(404).json({ success: false, message: 'Opportunity not found or you are not eligible' });
    }

    // Validate: opportunity must be open
    if (opportunity.status !== 'open') {
      return res.status(400).json({ success: false, message: 'This opportunity is no longer accepting bids' });
    }

    // Validate: deadline not passed
    if (opportunity.deadline && new Date() > new Date(opportunity.deadline)) {
      return res.status(400).json({ success: false, message: 'Bid deadline has passed' });
    }

    // Validate: vendor hasn't already bid
    const existingBid = opportunity.bids.find(b => b.vendorId?.toString() === vendorId.toString());
    if (existingBid) {
      return res.status(400).json({ success: false, message: 'You have already submitted a bid for this opportunity' });
    }

    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid bid amount' });
    }

    // Add bid to opportunity
    opportunity.bids.push({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      amount: parseFloat(amount),
      proposalText: proposalText || '',
      timeline: parseInt(timeline) || 30,
      teamSize: parseInt(teamSize) || 1,
      milestones: milestones || [],
      technicalBid: technicalBid || '',
      financialBid: financialBid || '',
      status: 'submitted',
      submittedAt: new Date()
    });

    // If first bid, change status to 'open' stays (or we can track 'bidding')
    await opportunity.save();

    // Create a formal proposal linked to this bid
    const newBid = opportunity.bids[opportunity.bids.length - 1];
    const proposal = new VendorProposal({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      opportunityId: new mongoose.Types.ObjectId(id),
      title: `Bid for: ${opportunity.title}`,
      coverLetter: proposalText || '',
      pricing: {
        lineItems: [],
        subtotal: parseFloat(amount),
        gstPercentage: 18,
        gstAmount: parseFloat(amount) * 0.18,
        totalAmount: parseFloat(amount) * 1.18
      },
      timeline: { totalDays: parseInt(timeline) || 30 },
      status: 'sent',
      sentAt: new Date(),
      linkedBidId: newBid._id
    });

    await proposal.save();

    // Emit socket event to admin (if socket available)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('admin-room').emit('new-bid-submitted', {
          opportunityId: id,
          opportunityTitle: opportunity.title,
          vendorId: vendorId.toString(),
          amount,
          bidId: newBid._id
        });
      }
    } catch (socketErr) {
      console.warn('Socket emit failed (non-critical):', socketErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Bid submitted successfully',
      data: {
        bidId: newBid._id,
        proposalId: proposal._id,
        proposalCode: proposal.proposalCode
      }
    });
  } catch (error) {
    console.error('submitBid error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit bid' });
  }
};

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
    await opportunity.save();

    // Emit socket to admin
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('admin-room').emit('invitation-accepted', { opportunityId: id, vendorId: vendorId.toString() });
      }
    } catch (e) {}

    res.status(200).json({ success: true, message: 'Invitation accepted successfully' });
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

    const [proposals, total] = await Promise.all([
      VendorProposal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('opportunityId', 'title categoryName clientInfo.company requirements.cities')
        .lean(),
      VendorProposal.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: proposals,
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

    const [typeCounts, invitationCount, pendingProposals, acceptedWork] = await Promise.all([
      // Open opportunities per type
      Opportunity.aggregate([
        { $match: { eligibleVendors: vid, status: 'open' } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      // Direct invitations open
      Opportunity.countDocuments({ type: 'direct_invitation', eligibleVendors: vid, status: 'open' }),
      // Proposals awaiting client response (sent/viewed)
      VendorProposal.countDocuments({ vendorId: vid, status: { $in: ['sent', 'viewed', 'negotiating'] } }),
      // Accepted this week
      Opportunity.countDocuments({
        status: 'awarded',
        'awardedTo.vendorId': vid,
        'awardedTo.awardedAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
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
        acceptedThisWeek: acceptedWork
      }
    });
  } catch (error) {
    console.error('getCounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

module.exports = {
  getOpportunities,
  getOpportunityById,
  submitBid,
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
  getCounts
};
