/**
 * Routing API (automatic / manual / hybrid) and the unassigned queue.
 *
 *   POST /api/routing/jobs/:id             re-run routing for one job (admin)
 *   POST /api/routing/retry                retry many unassigned jobs, optional expanded search (admin)
 *   GET  /api/routing/jobs/:id/candidates  ranked eligible vendors + reasoning (admin, owning B2B)
 *   POST /api/routing/jobs/:id/vendor      manual pick of a vendor (admin may override with reason; B2B only eligible)
 *   GET  /api/routing/unassigned           unassigned queue with stated reasons (admin: all, B2B: own)
 *
 * All routing rules live in services/jobRouting.service.js — never in the UI.
 */
const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const { LIFECYCLE: S, deriveLifecycleFromLegacy } = require('../../services/jobStateMachine');
const { roleOf, actorFromReq, loadJobForCaller, sendJobError, JobAccessError } = require('../../services/jobScope.service');
const { findEligibleVendors } = require('../../services/jobRouting.service');
const { rematchB2BJob } = require('../../services/b2bJobRematch.service');

const requireRole = (req, roles) => {
  if (!roles.includes(roleOf(req))) throw new JobAccessError('Access denied');
};

/** POST /api/routing/jobs/:id  { note?, expandRadiusKm? } */
exports.rerun = async (req, res) => {
  try {
    requireRole(req, ['ADMIN']);
    const job = await loadJobForCaller(req, req.params.id, 'write');
    const result = await rematchB2BJob(job._id, {
      actorRole: 'admin',
      actorId: req.user.id,
      note: String(req.body?.note || 'Routing re-run by admin').slice(0, 200),
      expandRadiusKm: req.body?.expandRadiusKm
    });
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, message: 'Routing restarted', data: { attempt: result.attempt, status: result.job?.lifecycleStatus } });
  } catch (error) {
    return sendJobError(res, error, 'Failed to re-run routing');
  }
};

/** POST /api/routing/retry  { jobIds: [], expandRadiusKm?, note? } */
exports.retry = async (req, res) => {
  try {
    requireRole(req, ['ADMIN']);
    const ids = (Array.isArray(req.body?.jobIds) ? req.body.jobIds : []).filter((id) => mongoose.Types.ObjectId.isValid(id)).slice(0, 100);
    if (!ids.length) return res.status(400).json({ success: false, message: 'jobIds[] is required (max 100)' });
    const results = [];
    for (const id of ids) {
      const r = await rematchB2BJob(id, {
        actorRole: 'admin',
        actorId: req.user.id,
        note: String(req.body?.note || 'Bulk routing retry').slice(0, 200),
        expandRadiusKm: req.body?.expandRadiusKm
      });
      results.push({ jobId: id, ok: r.ok, message: r.ok ? 'Routing restarted' : r.message });
    }
    const ok = results.filter((r) => r.ok).length;
    return res.status(200).json({ success: ok > 0, message: `${ok} of ${results.length} restarted`, data: results });
  } catch (error) {
    return sendJobError(res, error, 'Failed to retry routing');
  }
};

/** GET /api/routing/jobs/:id/candidates */
exports.candidates = async (req, res) => {
  try {
    requireRole(req, ['ADMIN', 'B2B']);
    const job = await loadJobForCaller(req, req.params.id, 'read');
    const ranking = await findEligibleVendors(job);
    const isAdmin = roleOf(req) === 'ADMIN';
    return res.status(200).json({
      success: true,
      data: ranking.vendors.map((v) => (isAdmin ? v : {
        vendorId: v.vendorId,
        name: v.name,
        locationMatch: v.locationMatch,
        skillMatch: v.skillMatch,
        availableEngineers: v.availableEngineers,
        busy: v.busy,
        slaCompliance: v.slaCompliance,
        score: v.score
      })),
      rejected: isAdmin ? ranking.rejected : undefined,
      reason: ranking.reason,
      serviceKey: ranking.serviceKey
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to rank vendors');
  }
};

/**
 * POST /api/routing/jobs/:id/vendor  { vendorId, reason, override? }
 * Manual routing. B2B may choose among eligible vendors for its own job;
 * admin may additionally override eligibility with a reason (audited).
 */
exports.pickVendor = async (req, res) => {
  try {
    requireRole(req, ['ADMIN', 'B2B']);
    const role = roleOf(req);
    const { vendorId, reason } = req.body || {};
    const override = role === 'ADMIN' && Boolean(req.body?.override);
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ success: false, message: 'A valid vendorId is required' });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'A reason is required to route a job manually' });
    }
    const job = await loadJobForCaller(req, req.params.id, 'write');
    const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
    if (job.assignedVendorId || job.assignedTo || ![S.VALIDATED, S.ROUTED, S.UNASSIGNED, S.ON_HOLD].includes(state)) {
      return res.status(409).json({ success: false, message: `A job that is ${state}${job.assignedVendorId ? ' and held by a vendor' : ''} cannot be re-routed` });
    }
    if (job.status === 'pending_wallet') {
      return res.status(409).json({ success: false, message: 'Fund the job (wallet top-up) before routing it' });
    }

    const ranking = await findEligibleVendors(job);
    const candidate = ranking.vendors.find((v) => v.vendorId === String(vendorId));
    if (!candidate && !override) {
      const rejected = ranking.rejected.find((v) => v.vendorId === String(vendorId));
      return res.status(422).json({
        success: false,
        code: 'VENDOR_NOT_ELIGIBLE',
        message: rejected
          ? `Vendor is not eligible: ${rejected.reasons.join('; ')}`
          : `Vendor does not cover ${ranking.serviceKey || job.service} for this location`
      });
    }

    const actor = actorFromReq(req);
    const { vendorClaimJob } = require('../../services/jobAssignment.service');
    const { job: updated } = await vendorClaimJob({
      jobId: job._id,
      vendorId,
      actor,
      reason: `Routed to vendor by ${role === 'ADMIN' ? 'admin' : 'company'}${override && !candidate ? ' (eligibility override)' : ''}: ${String(reason).slice(0, 200)}`
    });
    await B2BJob.updateOne({ _id: job._id }, { $set: { routingMode: 'manual' }, $addToSet: { notifiedVendors: new mongoose.Types.ObjectId(String(vendorId)) } });

    const { logAudit } = require('../../utils/auditLogger');
    await logAudit({
      actionType: override && !candidate ? 'JOB_ROUTING_OVERRIDE' : 'JOB_ROUTED_MANUALLY',
      eventMessage: `${job.jobId} routed to vendor ${vendorId}: ${reason}`,
      actorId: actor.id,
      actorRole: actor.role,
      targetId: job._id,
      targetType: 'B2BJob',
      changes: { vendorId: String(vendorId), override: Boolean(override && !candidate), eligibility: candidate || null }
    });
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      await createNotification({
        vendorId,
        type: 'b2b_job_request',
        title: 'Job assigned to you',
        message: `${job.service} — ${job.city}. Please assign an engineer.`,
        relatedId: job._id,
        relatedType: 'b2b_job',
        priority: 'high'
      });
    } catch (_) { /* non-blocking */ }

    return res.status(200).json({ success: true, message: 'Job routed to vendor', data: { jobId: String(updated._id), status: updated.lifecycleStatus } });
  } catch (error) {
    return sendJobError(res, error, 'Failed to route job');
  }
};

/** GET /api/routing/unassigned — jobs with no eligible vendor/engineer, with stated reasons. */
exports.unassignedQueue = async (req, res) => {
  try {
    requireRole(req, ['ADMIN', 'B2B']);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const base = {
      assignedTo: null,
      assignedVendorId: null,
      $or: [{ lifecycleStatus: { $in: [S.UNASSIGNED, S.ON_HOLD] } }, { status: 'escalated' }, { allocationStage: 'admin_escalation' }]
    };
    const filter = roleOf(req) === 'B2B'
      ? { ...base, companyId: new mongoose.Types.ObjectId(String(req.companyId || req.user.companyId || req.user.id)) }
      : base;
    const [rows, total] = await Promise.all([
      B2BJob.find(filter)
        .select('jobId companyId source customerName service serviceKey city pincode priority charge lifecycleStatus status allocationReason unassignedReason unassignedAt allocationUpdatedAt rematchCount slaDueAt createdAt')
        .populate('companyId', 'companyName')
        .sort({ allocationUpdatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      B2BJob.countDocuments(filter)
    ]);
    return res.status(200).json({
      success: true,
      data: rows.map((j) => ({
        id: String(j._id),
        jobCode: j.jobId,
        source: j.source || 'B2B',
        company: j.companyId?.companyName || null,
        customerName: j.customerName,
        service: j.service,
        serviceKey: j.serviceKey || null,
        city: j.city,
        pincode: j.pincode || '',
        priority: j.priority,
        amount: j.charge || 0,
        status: j.lifecycleStatus || deriveLifecycleFromLegacy(j),
        reason: j.allocationReason || 'No eligible vendor or engineer',
        since: j.allocationUpdatedAt || j.createdAt,
        retries: j.rematchCount || 0,
        slaDueAt: j.slaDueAt || null
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
    });
  } catch (error) {
    return sendJobError(res, error, 'Failed to load unassigned queue');
  }
};
