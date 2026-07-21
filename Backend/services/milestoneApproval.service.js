/**
 * Config-driven QA + customer + B2B sign-off gates before escrow release.
 * Driven by ServiceConfig.approvalFlow on the enterprise flow snapshot.
 */
const VendorOpsMilestone = require('../models/VendorOpsMilestone');

const DEFAULT_APPROVAL_FLOW = {
  requireQaBeforeRelease: true,
  customerSignoffRequired: false,
  b2bSignoffRequired: false
};

function parseApprovalFlow(configSnapshot = null) {
  const raw = configSnapshot?.approvalFlow || {};
  return {
    ...DEFAULT_APPROVAL_FLOW,
    ...raw,
    customerSignoffRequired: !!(
      raw.customerSignoffRequired ?? raw.customerSignOffRequired ?? raw.requireCustomerApproval
    ),
    b2bSignoffRequired: !!(
      raw.b2bSignoffRequired ?? raw.b2bSignOffRequired ?? raw.requireB2BApproval
    ),
    requireQaBeforeRelease: raw.requireQaBeforeRelease !== false
  };
}

function initMilestoneSignoffs(milestoneDoc, approvalFlow) {
  const af = parseApprovalFlow({ approvalFlow });
  milestoneDoc.customerSignoff = af.customerSignoffRequired ? 'pending' : 'not_required';
  milestoneDoc.b2bSignoff = af.b2bSignoffRequired ? 'pending' : 'not_required';
  if (af.requireQaBeforeRelease) {
    milestoneDoc.qaStatus = milestoneDoc.qaStatus || 'pending';
  } else {
    milestoneDoc.qaStatus = 'passed';
  }
  return milestoneDoc;
}

function getPendingApprovalParty(milestone, approvalFlow) {
  const af = parseApprovalFlow({ approvalFlow });
  if (af.requireQaBeforeRelease && milestone.qaStatus !== 'passed') {
    return { party: 'qa', message: 'QA verification is required before release' };
  }
  if (milestone.customerSignoff === 'pending') {
    return { party: 'customer', message: 'Customer sign-off is required before release' };
  }
  if (milestone.b2bSignoff === 'pending') {
    return { party: 'b2b', message: 'B2B client sign-off is required before release' };
  }
  return null;
}

function canReleaseMilestone(milestone, approvalFlow) {
  return !getPendingApprovalParty(milestone, approvalFlow);
}

async function markMilestoneQaPassed(milestoneId) {
  const ms = await VendorOpsMilestone.findById(milestoneId);
  if (!ms) return { ok: false, status: 404, message: 'Milestone not found' };
  ms.qaStatus = 'passed';
  await ms.save();
  return { ok: true, milestone: ms };
}

async function markMilestoneCustomerSignoff(milestoneId, { approved = true } = {}) {
  const ms = await VendorOpsMilestone.findById(milestoneId);
  if (!ms) return { ok: false, status: 404, message: 'Milestone not found' };
  if (ms.customerSignoff === 'not_required') {
    return { ok: true, skipped: true, message: 'Customer sign-off not required' };
  }
  ms.customerSignoff = approved ? 'approved' : 'rejected';
  ms.customerSignoffAt = new Date();
  await ms.save();
  return { ok: true, milestone: ms };
}

async function markMilestoneB2bSignoff(milestoneId, { approved = true } = {}) {
  const ms = await VendorOpsMilestone.findById(milestoneId);
  if (!ms) return { ok: false, status: 404, message: 'Milestone not found' };
  if (ms.b2bSignoff === 'not_required') {
    return { ok: true, skipped: true, message: 'B2B sign-off not required' };
  }
  ms.b2bSignoff = approved ? 'approved' : 'rejected';
  ms.b2bSignoffAt = new Date();
  await ms.save();
  return { ok: true, milestone: ms };
}

module.exports = {
  DEFAULT_APPROVAL_FLOW,
  parseApprovalFlow,
  initMilestoneSignoffs,
  getPendingApprovalParty,
  canReleaseMilestone,
  markMilestoneQaPassed,
  markMilestoneCustomerSignoff,
  markMilestoneB2bSignoff
};
