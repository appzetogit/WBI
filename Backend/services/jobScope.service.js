/**
 * Job access scoping (RBAC + data isolation) for the central job entity.
 *
 * Every job read/write resolves the caller's scope here instead of trusting
 * the frontend:
 *   Admin    → everything
 *   B2B      → own company's jobs
 *   Vendor   → jobs it holds, plus open offers routed to it (read + respond)
 *   Engineer → jobs assigned to them, plus open offers made to them
 *   User     → none (User App jobs live in Booking, not here)
 *
 * A job that exists but is outside the caller's scope is a 403, not a 404.
 */
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const { LIFECYCLE, deriveLifecycleFromLegacy } = require('./jobStateMachine');

const toObjectId = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

/** Canonical role for a request: ADMIN | VENDOR | B2B | ENGINEER | USER | WORKER | null */
const roleOf = (req) => {
  const r = String(req.userRole || '').toUpperCase();
  if (r === 'SUPER_ADMIN') return 'ADMIN';
  return r || null;
};

const actorFromReq = (req) => {
  const role = roleOf(req);
  return {
    id: req.user?._id || req.user?.id || req.userId || null,
    role: role === 'B2B' ? 'company' : String(role || 'system').toLowerCase(),
    companyId: role === 'B2B' ? req.companyId || req.user?.companyId || null : null
  };
};

class JobAccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'JobAccessError';
    this.status = status;
  }
}

/**
 * Mongo filter for the jobs a caller may SEE.
 * @param {object} req express request (after authenticate)
 */
const readScopeFilter = (req) => {
  const role = roleOf(req);
  const uid = toObjectId(req.user?._id || req.user?.id || req.userId);
  switch (role) {
    case 'ADMIN':
      return {};
    case 'B2B':
      return { companyId: toObjectId(req.companyId || req.user?.companyId || req.user?.id) };
    case 'VENDOR':
      return { $or: [{ assignedVendorId: uid }, openVendorOfferFilter(uid)] };
    case 'ENGINEER':
      return { $or: [{ assignedTo: uid }, openEngineerOfferFilter(uid)] };
    default:
      // Deny-all filter for roles that never see B2B pipeline jobs.
      return { _id: null };
  }
};

/** A routed job offered to this vendor that nobody holds and it has not declined. */
const openVendorOfferFilter = (vendorId) => ({
  notifiedVendors: vendorId,
  assignedVendorId: null,
  assignedTo: null,
  'vendorRejections.vendorId': { $ne: vendorId },
  lifecycleStatus: { $in: [LIFECYCLE.ROUTED, LIFECYCLE.VALIDATED] }
});

/** In-memory twin of openVendorOfferFilter for a loaded job document. */
const isOpenVendorOffer = (job, vendorId) => {
  if (!job || job.assignedVendorId || job.assignedTo) return false;
  const v = String(vendorId);
  const state = job.lifecycleStatus || deriveLifecycleFromLegacy(job);
  return [LIFECYCLE.ROUTED, LIFECYCLE.VALIDATED].includes(state) &&
    (job.notifiedVendors || []).some((x) => String(x) === v) &&
    !(job.vendorRejections || []).some((r) => String(r.vendorId) === v);
};

/** A broadcast offer still open to this engineer. */
const openEngineerOfferFilter = (engineerId) => ({
  notifiedEngineers: engineerId,
  declinedEngineers: { $ne: engineerId },
  assignedTo: null,
  assignedVendorId: null,
  lifecycleStatus: LIFECYCLE.ROUTED
});

/**
 * Filter for the jobs a caller may CHANGE (stricter than read: an offer can
 * be answered but not operated on).
 */
const writeScopeFilter = (req) => {
  const role = roleOf(req);
  const uid = toObjectId(req.user?._id || req.user?.id || req.userId);
  switch (role) {
    case 'ADMIN':
      return {};
    case 'B2B':
      return { companyId: toObjectId(req.companyId || req.user?.companyId || req.user?.id) };
    case 'VENDOR':
      return { assignedVendorId: uid };
    case 'ENGINEER':
      return { assignedTo: uid };
    default:
      return { _id: null };
  }
};

/**
 * Load a job the caller may access, or throw JobAccessError (404 / 403).
 * @param {object} req
 * @param {string} jobRef  B2BJob _id or human jobId (JOB-B2B-…)
 * @param {'read'|'write'} access
 */
const loadJobForCaller = async (req, jobRef, access = 'read', { select = null } = {}) => {
  const byId = toObjectId(jobRef);
  const identity = byId ? { _id: byId } : { jobId: String(jobRef || '') };
  if (!byId && !jobRef) throw new JobAccessError('Job id is required', 400);

  const scope = access === 'write' ? writeScopeFilter(req) : readScopeFilter(req);
  const query = B2BJob.findOne({ $and: [identity, scope] }).read('primary');
  if (select) query.select(select);
  const job = await query.lean();
  if (job) return job;

  const exists = await B2BJob.exists(identity);
  if (!exists) throw new JobAccessError('Job not found', 404);
  throw new JobAccessError(
    access === 'write'
      ? 'You do not have permission to change this job'
      : 'You do not have access to this job'
  );
};

/**
 * Vendor id the caller may act for on /vendors/:vendorId/* routes.
 * Vendors may only act for themselves; admins for any vendor.
 */
const resolveVendorScope = (req, requestedVendorId) => {
  const role = roleOf(req);
  const requested = toObjectId(requestedVendorId);
  if (!requested) throw new JobAccessError('Invalid vendor id', 400);
  if (role === 'ADMIN') return requested;
  if (role === 'VENDOR') {
    const self = toObjectId(req.user?._id || req.user?.id);
    if (self && self.equals(requested)) return self;
    throw new JobAccessError('You can only access your own vendor account');
  }
  throw new JobAccessError('Access denied');
};

/** Express error translator for the errors thrown by job services. */
const sendJobError = (res, err, fallback = 'Request failed') => {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) console.error(`[jobs] ${fallback}:`, err);
  return res.status(status).json({
    success: false,
    message: status >= 500 && !err?.code ? fallback : err.message,
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.from ? { from: err.from } : {}),
    ...(err?.to ? { to: err.to } : {}),
    ...(err?.details ? { details: err.details } : {})
  });
};

module.exports = {
  LIFECYCLE,
  JobAccessError,
  roleOf,
  actorFromReq,
  toObjectId,
  readScopeFilter,
  writeScopeFilter,
  openVendorOfferFilter,
  isOpenVendorOffer,
  openEngineerOfferFilter,
  loadJobForCaller,
  resolveVendorScope,
  sendJobError
};
