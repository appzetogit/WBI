const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorType: { type: String, enum: ['system', 'vendor', 'admin', 'worker', 'engineer', 'user'], default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const deliveryAttemptSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['in_app', 'email', 'sms', 'push', 'whatsapp'], required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed', 'skipped'], default: 'queued' },
    error: { type: String, default: '' },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

/**
 * Vendor Notification Center — production store for in-app alerts.
 * Written only by vendorNotificationCenter.service (real backend events).
 */
const vendorGlobalNotificationSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },

    title: { type: String, required: true, trim: true },
    message: { type: String, default: '', trim: true },

    /** Canonical event / type key from publisher */
    type: { type: String, required: true, index: true },
    eventType: { type: String, default: '', index: true },

    module: {
      type: String,
      default: 'system',
      index: true
    },

    priority: {
      type: String,
      enum: ['low', 'normal', 'medium', 'high', 'urgent', 'critical'],
      default: 'normal',
      index: true
    },

    channels: [{ type: String, enum: ['in_app', 'email', 'sms', 'push', 'whatsapp'] }],

    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    archived: { type: Boolean, default: false, index: true },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    /** Path relative to /vendor/:serviceSlug/ e.g. finance/wallet */
    actionUrl: { type: String, default: '' },

    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    relatedType: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    actorType: { type: String, default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },

    serviceCategoryCode: { type: String, default: '', index: true },
    serviceCategoryName: { type: String, default: '' },

    /** Dedup fingerprint */
    dedupeKey: { type: String, default: null, index: true },

    deliveryStatus: {
      type: String,
      enum: ['pending', 'delivered', 'partial', 'failed'],
      default: 'pending'
    },
    deliveryAttempts: { type: [deliveryAttemptSchema], default: [] },
    auditLog: { type: [auditEventSchema], default: [] },

    classicNotificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },

    demoTag: { type: String, default: null, index: true }
  },
  { timestamps: true }
);

vendorGlobalNotificationSchema.index({ vendorId: 1, deleted: 1, archived: 1, createdAt: -1 });
vendorGlobalNotificationSchema.index({ vendorId: 1, read: 1, deleted: 1, createdAt: -1 });
vendorGlobalNotificationSchema.index({ vendorId: 1, dedupeKey: 1 }, { sparse: true });

module.exports = mongoose.model('VendorGlobalNotification', vendorGlobalNotificationSchema);
