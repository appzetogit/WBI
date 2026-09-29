/**
 * Admin RBAC + audit log APIs. Access is enforced by the central adminAccess
 * guard (rbac/me: any admin; rbac/*: admins.manage; audit-logs: audit.read).
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Admin = require('../../models/Admin');
const AuditLog = require('../../models/AuditLog');
const { PERMISSIONS, ADMIN_ROLE_KEYS } = require('../../config/adminPermissions');
const { getRoles, saveRole, effectivePermissions } = require('../../services/adminRbac.service');

router.get('/rbac/me', async (req, res) => {
  const permissions = await effectivePermissions(req.user);
  res.json({ success: true, data: { role: req.user.role, permissions } });
});

router.get('/rbac/roles', async (req, res) => {
  const roles = await getRoles();
  res.json({ success: true, data: { roles: Object.values(roles), catalog: PERMISSIONS } });
});

router.put('/rbac/roles/:key', async (req, res) => {
  const { key } = req.params;
  if (key === 'super_admin') {
    return res.status(400).json({ success: false, message: 'Super Admin always has every permission' });
  }
  if (!/^[a-z_]{3,40}$/.test(key)) return res.status(400).json({ success: false, message: 'Invalid role key' });
  const { label, permissions } = req.body || {};
  if (!Array.isArray(permissions)) return res.status(400).json({ success: false, message: 'permissions must be an array' });
  const doc = await saveRole({ key, label, permissions, adminId: req.user._id });
  res.json({ success: true, message: 'Role permissions saved', data: doc });
});

// Role + extra permission grants for one admin
router.put('/rbac/admins/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid admin id' });
  const { role, permissions } = req.body || {};
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
  if (String(admin._id) === String(req.user._id) && role && role !== admin.role) {
    return res.status(400).json({ success: false, message: 'You cannot change your own role' });
  }
  if (role !== undefined) {
    if (!ADMIN_ROLE_KEYS.includes(role)) return res.status(400).json({ success: false, message: 'Unknown role' });
    admin.role = role;
  }
  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) return res.status(400).json({ success: false, message: 'permissions must be an array' });
    admin.permissions = permissions.filter((p) => PERMISSIONS[p]);
  }
  await admin.save();
  res.json({ success: true, message: 'Admin access updated', data: { id: admin._id, role: admin.role, permissions: admin.permissions } });
});

router.get('/audit-logs', async (req, res) => {
  const { actorId, targetId, targetType, actionType, status, q, from, to } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = {};
  if (actorId && mongoose.Types.ObjectId.isValid(actorId)) filter.actorId = actorId;
  if (targetId && mongoose.Types.ObjectId.isValid(targetId)) filter.targetId = targetId;
  if (targetType) filter.targetType = targetType;
  if (actionType) filter.actionType = new RegExp(String(actionType).replace(/[^A-Z0-9_]/gi, ''), 'i');
  if (status) filter.status = status;
  if (req.query.adminOnly === 'true') filter.actorRole = /^admin/;
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ eventMessage: rx }, { reason: rx }, { actionType: rx }];
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter)
  ]);
  const adminIds = [...new Set(rows.filter((r) => /^admin/.test(r.actorRole)).map((r) => String(r.actorId)))];
  const admins = await Admin.find({ _id: { $in: adminIds } }).select('name email').lean();
  const names = new Map(admins.map((a) => [String(a._id), a.name || a.email]));
  res.json({
    success: true,
    data: rows.map((r) => ({ ...r, actorName: names.get(String(r.actorId)) || null })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

module.exports = router;
