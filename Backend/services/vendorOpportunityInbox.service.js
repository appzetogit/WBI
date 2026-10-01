/**
 * Where a marketplace opportunity stands for ONE vendor.
 *
 * The assignment engine offers an opportunity to a batch of ranked vendors and
 * only vendors whose queue entry is 'active' can accept it. So "new" is read
 * from this vendor's own queue entry and its own ops project, never from the
 * opportunity's overall status — otherwise a request the vendor declined, let
 * time out, or lost to another vendor keeps showing up as new.
 *
 * Shared by the Requests list, the dashboard summary and the sidebar counts so
 * every screen agrees.
 */
const mongoose = require('mongoose');
const VendorOpsProject = require('../models/VendorOpsProject');

/** Phases in which nobody can accept the opportunity any more. */
const CLAIMED_PHASES = ['awaiting_engineer', 'awarded', 'expired'];

/** Opportunities a vendor may see at all: routed to it, open to its categories, or addressed to it. */
const vendorOpportunityScope = (vendorId, matchCodes = []) => {
  const vid = new mongoose.Types.ObjectId(String(vendorId));
  return {
    ...(matchCodes.length ? { categoryCode: { $in: matchCodes } } : {}),
    $or: [{ eligibleVendors: vid }, { eligibleVendors: { $size: 0 } }, { 'clientInfo.targetVendorId': vid }]
  };
};

/**
 * @param {object} opp      Opportunity (lean)
 * @param {object} project  this vendor's VendorOpsProject for it, if any
 * @returns {'new'|'accepted'|'assigned'|'in_progress'|'completed'|'rejected'|null}
 *          null = not this vendor's to see (not offered yet, timed out,
 *          taken by another vendor, or withdrawn)
 */
const opportunityStatusForVendor = (opp, vendorId, project = null) => {
  const vid = String(vendorId);
  const queue = opp.assignment?.vendorQueue || [];
  const entry = queue.find((q) => String(q.vendorId) === vid);

  if (project) {
    if (project.status === 'completed') return 'completed';
    // The opportunity is awarded once the assigned engineer accepts the job.
    if (opp.status === 'awarded' || opp.assignment?.phase === 'awarded') return 'in_progress';
    return project.assignedEngineers?.length ? 'assigned' : 'accepted';
  }

  if (entry?.status === 'accepted') {
    // Fronts a B2B job: the vendor now holds that job, which is listed itself.
    if (opp.assignment?.b2bJobId) return null;
    // Claimed but the project hand-over never finished — accepting again completes it.
    return 'new';
  }
  if (entry?.status === 'rejected') return 'rejected';

  if (opp.status !== 'open' || CLAIMED_PHASES.includes(opp.assignment?.phase)) return null;
  if (entry) return entry.status === 'active' ? 'new' : null;
  // No ranked queue (broadcast): open to every vendor in scope until claimed.
  return queue.length ? null : 'new';
};

/** Pair each opportunity with its vendor-relative status, dropping ones the vendor should not see. */
const withVendorStatus = async (opps, vendorId) => {
  if (!opps.length) return [];
  const projects = await VendorOpsProject.find({
    vendorId: new mongoose.Types.ObjectId(String(vendorId)),
    opportunityId: { $in: opps.map((o) => o._id) }
  })
    .select('opportunityId status assignedEngineers')
    .lean();
  const byOpp = new Map(projects.map((p) => [String(p.opportunityId), p]));
  return opps
    .map((opp) => ({ opp, status: opportunityStatusForVendor(opp, vendorId, byOpp.get(String(opp._id))) }))
    .filter((row) => row.status);
};

module.exports = {
  vendorOpportunityScope,
  opportunityStatusForVendor,
  withVendorStatus
};
