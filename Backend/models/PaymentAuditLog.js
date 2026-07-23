const mongoose = require('mongoose');

const paymentAuditLogSchema = new mongoose.Schema(
  {
    actorRole: {
      type: String,
      enum: ['user', 'admin', 'system'],
      required: true
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    action: {
      type: String,
      required: true,
      index: true
    },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null }
  },
  { timestamps: true }
);

paymentAuditLogSchema.index({ createdAt: -1 });
paymentAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentAuditLog', paymentAuditLogSchema);
