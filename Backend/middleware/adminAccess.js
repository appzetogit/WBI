/**
 * Central guard for every /api/admin route (mounted once in server.js):
 *   1. authenticate + admin role — no admin router depends on another router's
 *      router.use() for protection any more;
 *   2. RBAC — the route's permission (config/adminPermissions.js) must be granted;
 *   3. audit — every state-changing call is written to AuditLog with actor,
 *      target, before/after snapshot of key fields and the stated reason.
 */
const mongoose = require('mongoose');
const { authenticate } = require('./authMiddleware');
const { permissionFor, hasPermission } = require('../config/adminPermissions');
const { effectivePermissions } = require('../services/adminRbac.service');

const OBJECT_ID = /^[a-f0-9]{24}$/i;
// /<resource>/<id>/... — the second segment must be an ObjectId unless it is a static route
const ID_ROUTE = /^\/(users|vendors|workers|engineers|b2b-companies|bookings|admins|disputes)\/([^/]+)/;
const STATIC_SUBROUTES = new Set([
  'bookings/analytics', 'engineers/jobs', 'engineers/payments', 'users/bookings',
  'vendors/bookings', 'vendors/payments', 'workers/jobs', 'workers/payments'
]);
const SECRET_KEYS = /pass(word)?|secret|token|otp|pin|cvv|accountNumber|signature/i;

// Resources whose key fields are snapshotted before/after a change.
const SNAPSHOTS = [
  { re: /^\/users\/([a-f0-9]{24})/i, model: 'User', fields: 'name email phone isActive' },
  { re: /^\/vendors\/([a-f0-9]{24})/i, model: 'Vendor', fields: 'approvalStatus isActive status commissionOverride approvedServices.categoryCode approvedServices.status wallet.cashLimit wallet.isBlocked' },
  { re: /^\/workers\/([a-f0-9]{24})/i, model: 'Worker', fields: 'approvalStatus isActive status vendorId' },
  { re: /^\/engineers\/([a-f0-9]{24})/i, model: 'Engineer', fields: 'approvalStatus isActive status vendorId serviceCategories geoLocation.coordinates' },
  { re: /^\/b2b-companies\/([a-f0-9]{24})/i, model: 'B2BCompany', fields: 'verificationStatus accountStatus isActive allowedServices allowedLocations pricingProfile slaProfile billingMode bulkUploadLimit' },
  { re: /^\/b2b-wallets\/([a-f0-9]{24})/i, model: 'B2BWallet', by: 'companyId', fields: 'balance escrowBalance' },
  { re: /^\/admins\/([a-f0-9]{24})/i, model: 'Admin', fields: 'name email role permissions isActive' },
  { re: /^\/settlements\/withdrawals\/([a-f0-9]{24})/i, model: 'Withdrawal', fields: 'status amount' },
  { re: /^\/bookings\/([a-f0-9]{24})/i, model: 'Booking', fields: 'status workerId vendorId paymentStatus' },
  { re: /^\/disputes\/([a-f0-9]{24})/i, model: 'Dispute', fields: 'status resolution refundAmount' },
  { re: /^\/settings$/, model: 'Settings', query: { type: 'global' }, fields: '-razorpayKeySecret -razorpayWebhookSecret -cloudinaryApiSecret -__v -createdAt -updatedAt' }
];

const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined || depth > 3) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
};

const loadSnapshot = async (spec, path) => {
  const m = path.match(spec.re);
  const Model = mongoose.models[spec.model] || (() => { try { return require(`../models/${spec.model}`); } catch (_) { return null; } })();
  if (!Model) return null;
  let q = spec.query;
  if (!q) {
    if (!m) return null;
    q = spec.by ? { [spec.by]: m[1] } : { _id: m[1] };
  }
  return Model.findOne(q).select(spec.fields).lean();
};

const diff = (before, after) => {
  if (!before || !after) return { oldValue: before || null, newValue: after || null };
  const oldValue = {};
  const newValue = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === '_id') continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      oldValue[k] = before[k];
      newValue[k] = after[k];
    }
  }
  return { oldValue, newValue };
};

const writeAudit = async (req, res, snapshotSpec, before, path) => {
  try {
    const AuditLog = require('../models/AuditLog');
    let changes = { oldValue: null, newValue: null };
    if (snapshotSpec && res.statusCode < 400) {
      const after = await loadSnapshot(snapshotSpec, path);
      changes = diff(before, after);
    }
    const targetMatch = path.match(/[a-f0-9]{24}/i);
    const body = req.body || {};
    await AuditLog.create({
      actionType: `ADMIN_${req.method}_${(path.split('/')[1] || 'root').toUpperCase().replace(/-/g, '_')}`,
      eventMessage: `${req.method} /api/admin${path}`,
      actorId: req.user?._id || req.userId,
      actorRole: `admin:${req.user?.role || 'admin'}`,
      targetId: targetMatch ? targetMatch[0] : undefined,
      targetType: snapshotSpec?.model || path.split('/')[1],
      changes: sanitize(body),
      oldValue: changes.oldValue,
      newValue: changes.newValue,
      reason: body.reason || body.remark || body.remarks || body.notes || body.rejectionReason || undefined,
      ipAddress: req.ip,
      userAgent: req.get ? req.get('user-agent') : undefined,
      status: res.statusCode < 400 ? 'success' : 'failed',
      errorMessage: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined
    });
  } catch (err) {
    console.error('[AdminAudit] failed to write audit log:', err.message);
  }
};

const adminAccess = (req, res, next) => {
  // Login/logout/profile under /auth have their own handling
  if (req.path.startsWith('/auth')) return next();

  return authenticate(req, res, async () => {
    try {
      const role = String(req.userRole || '').toUpperCase();
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
      }
      if (req.user?.isActive === false) {
        return res.status(403).json({ success: false, message: 'Admin account is inactive.' });
      }

      const granted = await effectivePermissions(req.user);
      req.adminPermissions = granted;
      const needed = permissionFor(req.method, req.path);
      if (!hasPermission(granted, needed)) {
        return res.status(403).json({
          success: false,
          code: 'PERMISSION_DENIED',
          requiredPermission: needed,
          message: `Your admin role cannot do this. It needs '${needed}'.`
        });
      }

      // Malformed ids in the URL are a client error, never a 500
      const idSeg = req.path.match(ID_ROUTE);
      if (idSeg && !OBJECT_ID.test(idSeg[2]) && !STATIC_SUBROUTES.has(`${idSeg[1]}/${idSeg[2]}`)) {
        return res.status(400).json({ success: false, message: `Invalid ${idSeg[1].replace(/s$/, '')} id` });
      }

      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

      const spec = SNAPSHOTS.find((s) => s.re.test(req.path)) || null;
      const before = spec ? await loadSnapshot(spec, req.path).catch(() => null) : null;
      // Sub-routers rewrite req.path; keep the /api/admin-relative path seen here
      const auditPath = req.path;
      res.on('finish', () => { writeAudit(req, res, spec, before, auditPath); });
      return next();
    } catch (err) {
      console.error('[AdminAccess] error:', err);
      return res.status(500).json({ success: false, message: 'Authorization check failed' });
    }
  });
};

module.exports = { adminAccess, sanitize };
