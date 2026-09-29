const mongoose = require('mongoose');

/**
 * Editable permission set for an admin role. Missing roles fall back to the
 * defaults in config/adminPermissions.js.
 */
const adminRoleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, trim: true },
  permissions: { type: [String], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

module.exports = mongoose.model('AdminRole', adminRoleSchema);
