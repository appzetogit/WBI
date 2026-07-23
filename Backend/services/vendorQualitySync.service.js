/**
 * Quality & Control sync — project live ops/contracts/proofs into vendor QC queues.
 */
const mongoose = require('mongoose');
const VendorOpsProject = require('../models/VendorOpsProject');
const VendorProject = require('../models/VendorProject');
const ProofSubmission = require('../models/ProofSubmission');
const ScopeChange = require('../models/ScopeChange');
const VendorQualityProof = require('../models/VendorQualityProof');
const VendorQualityReview = require('../models/VendorQualityReview');
const VendorQualityApproval = require('../models/VendorQualityApproval');
const VendorQualityIssue = require('../models/VendorQualityIssue');
const VendorQualityChangeRequest = require('../models/VendorQualityChangeRequest');
const VendorQualityDamage = require('../models/VendorQualityDamage');
const VendorClient = require('../models/VendorClient');
const ServiceConfig = require('../models/ServiceConfig');
const { publishVendorNotification } = require('./vendorNotificationCenter.service');

async function proofTemplatesForService(categoryCode) {
  if (!categoryCode) {
    return [
      { label: 'Before photo', type: 'photo', required: true },
      { label: 'After photo', type: 'photo', required: true },
      { label: 'Site report', type: 'document', required: false },
      { label: 'Client signature', type: 'signature', required: true }
    ];
  }
  const cfg = await ServiceConfig.findOne({
    $or: [{ categoryCode }, { code: categoryCode }]
  })
    .select('siteChecklist complianceDocs')
    .lean();
  const checklist = cfg?.siteChecklist || [];
  if (checklist.length) {
    return checklist.map((item) => ({
      label: item.label || item.name || item.title || 'Checklist item',
      type: item.requiresPhoto || item.type === 'photo' ? 'photo' : 'document',
      required: item.required !== false,
      submitted: false,
      value: ''
    }));
  }
  return [
    { label: 'Before photo', type: 'photo', required: true },
    { label: 'After photo', type: 'photo', required: true },
    { label: 'Completion report', type: 'document', required: true },
    { label: 'Client signature', type: 'signature', required: true }
  ];
}

async function syncProofsFromOps(vendorId) {
  const projects = await VendorOpsProject.find({
    vendorId,
    status: { $in: ['in_progress', 'at_risk', 'on_hold', 'completed'] },
    demoTag: null
  })
    .limit(100)
    .lean();

  let created = 0;
  for (const p of projects) {
    const existing = await VendorQualityProof.findOne({
      vendorId,
      projectCode: p.projectCode || String(p._id),
      demoTag: null
    });
    if (existing) continue;

    const requirements = await proofTemplatesForService(p.serviceCategoryCode);
    const engineerName = p.assignedEngineers?.[0]?.name || p.assignedManager || '';
    await VendorQualityProof.create({
      vendorId,
      projectName: p.title || p.projectCode || 'Project',
      projectCode: p.projectCode || String(p._id),
      clientName: p.clientName || '',
      siteName: p.city || '',
      serviceCategoryCode: p.serviceCategoryCode || 'GEN',
      serviceCategoryName: p.serviceCategoryName || '',
      engineerName,
      submittedAt: p.status === 'completed' ? p.updatedAt || new Date() : new Date(),
      requirements,
      completeness: 0,
      status: p.status === 'completed' ? 'pending_review' : 'pending_review',
      demoTag: null
    });
    created += 1;
  }

  // Mirror ProofSubmission via VendorProject
  const vendorProjects = await VendorProject.find({ vendorId }).select('_id name code clientName status').limit(50).lean();
  const projectIds = vendorProjects.map((p) => p._id);
  if (projectIds.length) {
    const submissions = await ProofSubmission.find({
      projectId: { $in: projectIds },
      'review.status': 'pending'
    })
      .limit(50)
      .lean();

    for (const sub of submissions) {
      const vp = vendorProjects.find((p) => String(p._id) === String(sub.projectId));
      const code = `PS-${String(sub._id).slice(-8)}`;
      const exists = await VendorQualityProof.findOne({ vendorId, proofCode: code });
      if (exists) continue;

      const requirements = (sub.photos || []).map((url, i) => ({
        label: `${sub.type || 'photo'} ${i + 1}`,
        type: 'photo',
        required: true,
        submitted: true,
        value: url
      }));
      if (sub.type === 'damage') {
        await VendorQualityDamage.create({
          vendorId,
          projectName: vp?.name || '',
          projectCode: vp?.code || String(vp?._id || ''),
          clientName: vp?.clientName || '',
          serviceCategoryCode: 'GEN',
          serviceCategoryName: '',
          description: sub.remarks || 'Damage reported from field proof',
          photosCount: (sub.photos || []).length,
          status: 'reported',
          demoTag: null
        }).catch(() => null);
      }

      await VendorQualityProof.create({
        vendorId,
        proofCode: code,
        projectName: vp?.name || '',
        projectCode: vp?.code || String(vp?._id || ''),
        clientName: vp?.clientName || '',
        serviceCategoryCode: 'GEN',
        serviceCategoryName: '',
        engineerName: '',
        submittedAt: sub.timestamp || sub.createdAt,
        gpsVerified: Boolean(sub.geoLocation?.lat),
        requirements,
        completeness: requirements.length ? 100 : 0,
        status: 'pending_review',
        demoTag: null
      });
      created += 1;
    }
  }

  return created;
}

async function syncReviewsAndApprovals(vendorId) {
  const qcProjects = await VendorOpsProject.find({
    vendorId,
    status: { $in: ['in_progress', 'at_risk', 'completed'] },
    demoTag: null
  })
    .limit(50)
    .lean();

  let created = 0;
  for (const p of qcProjects) {
    const reviewExists = await VendorQualityReview.findOne({
      vendorId,
      projectCode: p.projectCode || String(p._id),
      demoTag: null
    });
    if (!reviewExists) {
      await VendorQualityReview.create({
        vendorId,
        projectName: p.title || p.projectCode || '',
        projectCode: p.projectCode || String(p._id),
        clientName: p.clientName || '',
        serviceCategoryCode: p.serviceCategoryCode || 'GEN',
        serviceCategoryName: p.serviceCategoryName || '',
        engineerName: p.assignedEngineers?.[0]?.name || '',
        qaStatus: p.status === 'completed' ? 'passed' : 'pending',
        checklist: [],
        reworkStatus: 'none',
        demoTag: null
      });
      created += 1;
    }

    const approvalExists = await VendorQualityApproval.findOne({
      vendorId,
      projectCode: p.projectCode || String(p._id),
      approvalType: p.clientType === 'b2b' ? 'b2b' : 'client',
      demoTag: null
    });
    if (!approvalExists && p.status !== 'draft') {
      await VendorQualityApproval.create({
        vendorId,
        projectName: p.title || p.projectCode || '',
        projectCode: p.projectCode || String(p._id),
        clientName: p.clientName || '',
        clientType: p.clientType === 'individual' ? 'individual' : 'b2b',
        serviceCategoryCode: p.serviceCategoryCode || 'GEN',
        serviceCategoryName: p.serviceCategoryName || '',
        approvalType: p.clientType === 'b2b' ? 'b2b' : 'client',
        status: p.status === 'completed' ? 'approved' : 'pending',
        demoTag: null
      });
      created += 1;
    }
  }
  return created;
}

async function syncChangeRequests(vendorId) {
  const changes = await ScopeChange.find({
    vendorId,
    status: 'pending',
    demoTag: null
  })
    .limit(50)
    .lean();

  let created = 0;
  for (const sc of changes) {
    const exists = await VendorQualityChangeRequest.findOne({
      vendorId,
      changeCode: sc.changeCode,
      demoTag: null
    });
    if (exists) continue;

    let clientName = '';
    try {
      const client = await VendorClient.findById(sc.clientId).select('name companyName').lean();
      clientName = client?.companyName || client?.name || '';
    } catch {
      /* ignore */
    }

    await VendorQualityChangeRequest.create({
      vendorId,
      changeCode: sc.changeCode,
      title: sc.title,
      projectName: '',
      projectCode: sc.contractId ? String(sc.contractId) : '',
      clientName,
      serviceCategoryCode: 'GEN',
      serviceCategoryName: '',
      previousScope: sc.previousScope || '',
      updatedScope: sc.updatedScope || '',
      costDifference: sc.costDelta || 0,
      timelineDifferenceDays: sc.timelineDeltaDays || 0,
      status: 'requested',
      requestedBy: 'client',
      demoTag: null
    });
    created += 1;
  }
  return created;
}

async function syncVendorQuality(vendorId) {
  const [proofs, reviews, changes] = await Promise.all([
    syncProofsFromOps(vendorId),
    syncReviewsAndApprovals(vendorId),
    syncChangeRequests(vendorId)
  ]);
  return { proofs, reviews, changes };
}

async function notifyQualityAction(vendorId, { type, title, message, relatedId, priority = 'normal' }) {
  try {
    await publishVendorNotification({
      vendorId,
      type,
      title,
      message,
      module: 'quality',
      priority,
      relatedId,
      relatedType: 'quality',
      actionUrl: 'quality/proof',
      category: 'jobs'
    });
  } catch (err) {
    console.warn('[quality notify]', err.message);
  }
}

module.exports = {
  syncVendorQuality,
  syncProofsFromOps,
  syncReviewsAndApprovals,
  syncChangeRequests,
  proofTemplatesForService,
  notifyQualityAction
};
