/**
 * Quality & Control Controller — vendor-scoped dynamic QA lifecycle
 */
const mongoose = require('mongoose');
const VendorQualityProof = require('../../models/VendorQualityProof');
const VendorQualityReview = require('../../models/VendorQualityReview');
const VendorQualityApproval = require('../../models/VendorQualityApproval');
const VendorQualityIssue = require('../../models/VendorQualityIssue');
const VendorQualityChangeRequest = require('../../models/VendorQualityChangeRequest');
const VendorQualityDamage = require('../../models/VendorQualityDamage');
const Vendor = require('../../models/Vendor');

const getVendorId = (req) => req.user._id || req.user.id;

const getVendorCategoryCodes = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  if (!vendor?.approvedServices?.length) return [];
  return vendor.approvedServices.filter((s) => s.status === 'active').map((s) => s.categoryCode).filter(Boolean);
};

const applyCategoryFilter = async (filter, vendorId, category) => {
  if (category) {
    filter.serviceCategoryCode = String(category).toUpperCase();
    return;
  }
  const codes = await getVendorCategoryCodes(vendorId);
  if (codes.length) {
    filter.serviceCategoryCode = { $in: codes };
  }
};

const rx = (s) => new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

const ensureQualitySynced = async (vendorId) => {
  try {
    const { syncVendorQuality } = require('../../services/vendorQualitySync.service');
    await syncVendorQuality(vendorId);
  } catch (err) {
    console.warn('[quality sync]', err.message);
  }
};

const getCounts = async (req, res) => {
  try {
    const vid = new mongoose.Types.ObjectId(getVendorId(req));
    await ensureQualitySynced(vid);
    const base = { vendorId: vid, demoTag: null };
    const [
      proofPending,
      qaPending,
      clientPending,
      b2bPending,
      openIssues,
      changePending,
      openDamage
    ] = await Promise.all([
      VendorQualityProof.countDocuments({ ...base, status: { $in: ['pending_review', 'under_review', 'resubmit_required'] } }),
      VendorQualityReview.countDocuments({ ...base, qaStatus: 'pending' }),
      VendorQualityApproval.countDocuments({ ...base, approvalType: 'client', status: { $in: ['pending', 'waiting_changes'] } }),
      VendorQualityApproval.countDocuments({ ...base, approvalType: 'b2b', status: { $in: ['pending', 'waiting_changes'] } }),
      VendorQualityIssue.countDocuments({ ...base, status: { $in: ['open', 'in_progress', 'escalated'] } }),
      VendorQualityChangeRequest.countDocuments({ ...base, status: { $in: ['requested', 'under_approval', 'implementing'] } }),
      VendorQualityDamage.countDocuments({ ...base, status: { $ne: 'closed' } })
    ]);
    res.status(200).json({
      success: true,
      data: { proofPending, qaPending, clientPending, b2bPending, openIssues, changePending, openDamage }
    });
  } catch (error) {
    console.error('quality getCounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

const paginate = (req) => {
  const page = parseInt(req.query.page || 1);
  const limit = parseInt(req.query.limit || 12);
  return { page, limit, skip: (page - 1) * limit };
};
const meta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) || 1 });

// ── Proof Review ──
const getProofs = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    await ensureQualitySynced(vendorId);
    const { status, category, search } = req.query;
    const { page, limit, skip } = paginate(req);
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId), demoTag: null };
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ projectName: rx(search) }, { proofCode: rx(search) }, { clientName: rx(search) }, { engineerName: rx(search) }] }]);
    }
    const [data, total] = await Promise.all([
      VendorQualityProof.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorQualityProof.countDocuments(filter)
    ]);
    res.status(200).json({ success: true, data, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('getProofs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch proofs' });
  }
};

const updateProof = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const doc = await VendorQualityProof.findOne({ _id: req.params.id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!doc) return res.status(404).json({ success: false, message: 'Proof not found' });
    const { action, notes } = req.body;
    if (action === 'approve') doc.status = 'approved';
    else if (action === 'reject') doc.status = 'rejected';
    else if (action === 'resubmit') doc.status = 'resubmit_required';
    else if (action === 'review') doc.status = 'under_review';
    else return res.status(400).json({ success: false, message: 'Invalid action' });
    if (notes !== undefined) doc.internalNotes = notes;
    await doc.save();

    const { notifyQualityAction } = require('../../services/vendorQualitySync.service');
    await notifyQualityAction(vendorId, {
      type: action === 'approve' ? 'qa_approved' : action === 'reject' ? 'qa_rejected' : 'approval_pending',
      title: `Proof ${action}`,
      message: `${doc.proofCode || 'Proof'} for ${doc.projectName || 'project'} is now ${doc.status}`,
      relatedId: doc._id,
      priority: action === 'reject' ? 'high' : 'normal'
    });

    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('updateProof:', error);
    res.status(500).json({ success: false, message: 'Failed to update proof' });
  }
};

// ── QA & Rework ──
const getReviews = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search } = req.query;
    const { page, limit, skip } = paginate(req);
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.qaStatus = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ projectName: rx(search) }, { reviewCode: rx(search) }, { clientName: rx(search) }, { engineerName: rx(search) }] }]);
    }
    const [data, total, agg] = await Promise.all([
      VendorQualityReview.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorQualityReview.countDocuments(filter),
      VendorQualityReview.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: {
          _id: null,
          avgScore: { $avg: '$qualityScore' },
          passed: { $sum: { $cond: [{ $eq: ['$qaStatus', 'passed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$qaStatus', 'failed'] }, 1, 0] } },
          reworkPending: { $sum: { $cond: [{ $in: ['$reworkStatus', ['pending', 'assigned']] }, 1, 0] } },
          reworkDone: { $sum: { $cond: [{ $eq: ['$reworkStatus', 'completed'] }, 1, 0] } }
        } }
      ])
    ]);
    const stats = agg[0] || { avgScore: 0, passed: 0, failed: 0, reworkPending: 0, reworkDone: 0 };
    stats.avgScore = Math.round(stats.avgScore || 0);
    res.status(200).json({ success: true, data, pagination: meta(page, limit, total), stats });
  } catch (error) {
    console.error('getReviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch QA reviews' });
  }
};

const updateReview = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const doc = await VendorQualityReview.findOne({ _id: req.params.id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!doc) return res.status(404).json({ success: false, message: 'Review not found' });
    const { action, engineer } = req.body;
    if (action === 'pass') { doc.qaStatus = 'passed'; }
    else if (action === 'fail') { doc.qaStatus = 'failed'; }
    else if (action === 'create_rework') { doc.reworkStatus = 'pending'; }
    else if (action === 'assign_rework') { doc.reworkStatus = 'assigned'; if (engineer) doc.reworkEngineer = engineer; }
    else if (action === 'complete_rework') { doc.reworkStatus = 'completed'; }
    else if (action === 'schedule_revisit') { doc.revisitDate = new Date(Date.now() + 2 * 86400000); }
    await doc.save();
    try {
      const { notifyQualityAction } = require('../../services/vendorQualitySync.service');
      await notifyQualityAction(vendorId, {
        type: action === 'fail' ? 'quality_failed' : action === 'pass' ? 'qa_approved' : 'rework',
        title: `QA ${action}`,
        message: `${doc.reviewCode || 'Review'} is now ${doc.qaStatus} (rework: ${doc.reworkStatus})`,
        relatedId: doc._id,
        priority: action === 'fail' ? 'high' : 'normal'
      });
    } catch (_) { /* ignore */ }
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('updateReview:', error);
    res.status(500).json({ success: false, message: 'Failed to update review' });
  }
};

// ── Approvals (client / b2b) ──
const getApprovals = (approvalType) => async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search } = req.query;
    const { page, limit, skip } = paginate(req);
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId), approvalType };
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ projectName: rx(search) }, { approvalCode: rx(search) }, { clientName: rx(search) }] }]);
    }
    const [data, total] = await Promise.all([
      VendorQualityApproval.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorQualityApproval.countDocuments(filter)
    ]);
    res.status(200).json({ success: true, data, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('getApprovals:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch approvals' });
  }
};

const updateApproval = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const doc = await VendorQualityApproval.findOne({ _id: req.params.id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!doc) return res.status(404).json({ success: false, message: 'Approval not found' });
    const { action } = req.body;
    if (action === 'approve') doc.status = 'approved';
    else if (action === 'reject') doc.status = 'rejected';
    else if (action === 'request_changes') doc.status = 'waiting_changes';
    if (action === 'approve' && doc.approvalLevels?.length) {
      const next = doc.approvalLevels.find((l) => l.status === 'pending');
      if (next) { next.status = 'approved'; next.by = req.user.name || 'Approver'; next.at = new Date(); }
    }
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('updateApproval:', error);
    res.status(500).json({ success: false, message: 'Failed to update approval' });
  }
};

// ── Issues & Risks ──
const getIssues = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, priority, issueType, category, search } = req.query;
    const { page, limit, skip } = paginate(req);
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (issueType) filter.issueType = issueType;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ title: rx(search) }, { issueCode: rx(search) }, { projectName: rx(search) }, { owner: rx(search) }] }]);
    }
    const [data, total, agg] = await Promise.all([
      VendorQualityIssue.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorQualityIssue.countDocuments(filter),
      VendorQualityIssue.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: {
          _id: null,
          open: { $sum: { $cond: [{ $in: ['$status', ['open', 'in_progress', 'escalated']] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$priority', 'critical'] }, 1, 0] } },
          slaBreaches: { $sum: { $cond: ['$slaBreached', 1, 0] } }
        } }
      ])
    ]);
    const stats = agg[0] || { open: 0, critical: 0, slaBreaches: 0 };
    res.status(200).json({ success: true, data, pagination: meta(page, limit, total), stats });
  } catch (error) {
    console.error('getIssues:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch issues' });
  }
};

const updateIssue = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const doc = await VendorQualityIssue.findOne({ _id: req.params.id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!doc) return res.status(404).json({ success: false, message: 'Issue not found' });
    const { action, owner } = req.body;
    if (action === 'assign') { doc.status = 'in_progress'; if (owner) doc.owner = owner; }
    else if (action === 'escalate') doc.status = 'escalated';
    else if (action === 'resolve') { doc.status = 'resolved'; doc.resolvedAt = new Date(); }
    else if (action === 'close') doc.status = 'closed';
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('updateIssue:', error);
    res.status(500).json({ success: false, message: 'Failed to update issue' });
  }
};

// ── Change Requests ──
const getChangeRequests = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search } = req.query;
    const { page, limit, skip } = paginate(req);
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ title: rx(search) }, { changeCode: rx(search) }, { projectName: rx(search) }, { clientName: rx(search) }] }]);
    }
    const [data, total] = await Promise.all([
      VendorQualityChangeRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorQualityChangeRequest.countDocuments(filter)
    ]);
    res.status(200).json({ success: true, data, pagination: meta(page, limit, total) });
  } catch (error) {
    console.error('getChangeRequests:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch change requests' });
  }
};

const updateChangeRequest = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const doc = await VendorQualityChangeRequest.findOne({ _id: req.params.id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!doc) return res.status(404).json({ success: false, message: 'Change request not found' });
    const { action } = req.body;
    const map = { submit: 'under_approval', approve: 'approved', reject: 'rejected', implement: 'implementing', close: 'closed' };
    if (map[action]) doc.status = map[action];
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('updateChangeRequest:', error);
    res.status(500).json({ success: false, message: 'Failed to update change request' });
  }
};

// ── Damage Incidents ──
const getDamages = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { status, category, search } = req.query;
    const { page, limit, skip } = paginate(req);
    const filter = { vendorId: new mongoose.Types.ObjectId(vendorId) };
    if (status) filter.status = status;
    await applyCategoryFilter(filter, vendorId, category);
    if (search?.trim()) {
      filter.$and = (filter.$and || []).concat([{ $or: [{ incidentCode: rx(search) }, { projectName: rx(search) }, { clientName: rx(search) }, { engineerName: rx(search) }] }]);
    }
    const [data, total, agg] = await Promise.all([
      VendorQualityDamage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      VendorQualityDamage.countDocuments(filter),
      VendorQualityDamage.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
        { $group: {
          _id: null,
          openClaims: { $sum: { $cond: [{ $ne: ['$status', 'closed'] }, 1, 0] } },
          totalCost: { $sum: '$estimatedCost' },
          insuranceCases: { $sum: { $cond: ['$insuranceCase', 1, 0] } },
          investigating: { $sum: { $cond: [{ $eq: ['$status', 'investigation'] }, 1, 0] } }
        } }
      ])
    ]);
    const stats = agg[0] || { openClaims: 0, totalCost: 0, insuranceCases: 0, investigating: 0 };
    res.status(200).json({ success: true, data, pagination: meta(page, limit, total), stats });
  } catch (error) {
    console.error('getDamages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch damage incidents' });
  }
};

const updateDamage = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const doc = await VendorQualityDamage.findOne({ _id: req.params.id, vendorId: new mongoose.Types.ObjectId(vendorId) });
    if (!doc) return res.status(404).json({ success: false, message: 'Incident not found' });
    const { action, resolution } = req.body;
    const map = { investigate: 'investigation', approve: 'approval', settle: 'settlement', close: 'closed' };
    if (map[action]) doc.status = map[action];
    if (resolution !== undefined) doc.resolution = resolution;
    await doc.save();
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('updateDamage:', error);
    res.status(500).json({ success: false, message: 'Failed to update incident' });
  }
};

module.exports = {
  getCounts,
  getProofs,
  updateProof,
  getReviews,
  updateReview,
  getClientApprovals: getApprovals('client'),
  getB2BApprovals: getApprovals('b2b'),
  updateApproval,
  getIssues,
  updateIssue,
  getChangeRequests,
  updateChangeRequest,
  getDamages,
  updateDamage
};
