const mongoose = require('mongoose');

/**
 * Outbox / audit trail for every channel delivery attempt.
 */
const notificationDeliveryLogSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, index: true },
  dedupeKey: { type: String, default: null },
  recipientRole: {
    type: String,
    enum: ['admin', 'vendor', 'engineer', 'user', 'worker', 'b2b', 'broadcast'],
    required: true,
    index: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  channel: {
    type: String,
    enum: ['in_app', 'push', 'email', 'sms', 'whatsapp'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['queued', 'sent', 'failed', 'skipped', 'read'],
    default: 'queued',
    index: true
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  providerRef: { type: String, default: null },
  skipReason: { type: String, default: null },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  actionUrl: { type: String, default: null },
  payloadSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  scheduledAt: { type: Date, default: null, index: true },
  sentAt: { type: Date, default: null }
}, { timestamps: true });

notificationDeliveryLogSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string', $gt: '' } } }
);
notificationDeliveryLogSchema.index({ recipientRole: 1, recipientId: 1, createdAt: -1 });
notificationDeliveryLogSchema.index({ status: 1, scheduledAt: 1 });
notificationDeliveryLogSchema.index({ eventKey: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationDeliveryLog', notificationDeliveryLogSchema);
