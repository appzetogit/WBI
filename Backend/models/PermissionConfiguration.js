const mongoose = require('mongoose');

/**
 * Module ACL keyed by categoryCode + role.
 * Controls which panels/modules a role may see for a given service.
 */
const permissionConfigurationSchema = new mongoose.Schema(
  {
    categoryCode: { type: String, required: true, uppercase: true, index: true },
    role: {
      type: String,
      enum: ['admin', 'vendor', 'engineer', 'worker', 'b2b', 'user'],
      required: true,
      index: true
    },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    allowedModules: [{ type: String }],
    deniedModules: [{ type: String }],
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

permissionConfigurationSchema.index({ categoryCode: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('PermissionConfiguration', permissionConfigurationSchema);
