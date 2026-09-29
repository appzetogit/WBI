const AdminRole = require('../models/AdminRole');
const { DEFAULT_ROLES, PERMISSIONS } = require('../config/adminPermissions');

const CACHE_MS = 30 * 1000;
let cache = { at: 0, roles: null };

/** Role key → { label, permissions }, DB overrides merged over the defaults. */
const getRoles = async () => {
  if (cache.roles && Date.now() - cache.at < CACHE_MS) return cache.roles;
  const roles = {};
  for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
    roles[key] = { key, label: def.label, permissions: [...def.permissions], isDefault: true };
  }
  const saved = await AdminRole.find({}).lean();
  for (const r of saved) {
    // super_admin always keeps everything, whatever is stored
    if (r.key === 'super_admin') continue;
    roles[r.key] = { key: r.key, label: r.label || roles[r.key]?.label || r.key, permissions: r.permissions || [], isDefault: false };
  }
  cache = { at: Date.now(), roles };
  return roles;
};

const clearRoleCache = () => { cache = { at: 0, roles: null }; };

/** Effective permission list for an admin document. */
const effectivePermissions = async (admin) => {
  if (!admin) return [];
  const roles = await getRoles();
  const base = roles[admin.role]?.permissions || [];
  return [...new Set([...base, ...(admin.permissions || [])])];
};

const saveRole = async ({ key, label, permissions, adminId }) => {
  const valid = (permissions || []).filter((p) => p === '*' || PERMISSIONS[p]);
  const doc = await AdminRole.findOneAndUpdate(
    { key },
    { $set: { label, permissions: valid, updatedBy: adminId || null } },
    { upsert: true, new: true }
  );
  clearRoleCache();
  return doc;
};

module.exports = { getRoles, effectivePermissions, saveRole, clearRoleCache };
