const mongoose = require('mongoose');

/**
 * Append-only audit trail for Service Management System changes.
 */
const serviceConfigAuditSchema = new mongoose.Schema(
  {
    categoryCode: { type: String, required: true, uppercase: true, index: true },
    action: {
      type: String,
      enum: [
        'create',
        'update',
        'status_change',
        'archive',
        'activate',
        'deactivate',
        'publish',
        'subcategory_upsert',
        'form_upsert',
        'rollback'
      ],
      required: true,
      index: true
    },
    versionBefore: { type: Number, default: null },
    versionAfter: { type: Number, default: null },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    actorEmail: { type: String, default: '' },
    summary: { type: String, default: '' },
    diff: { type: mongoose.Schema.Types.Mixed, default: {} },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

serviceConfigAuditSchema.index({ categoryCode: 1, createdAt: -1 });

module.exports = mongoose.model('ServiceConfigAudit', serviceConfigAuditSchema);
