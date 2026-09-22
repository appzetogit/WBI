const mongoose = require('mongoose');

/**
 * DeviceToken — one row per device that can receive a push.
 *
 * Replaces the per-role `fcmTokens[]` arrays as the registry push reads: a
 * token belongs to one user on one device, is refreshed on every app start,
 * and is deactivated (never silently kept) when FCM reports it invalid.
 */

const deviceTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  role: {
    type: String,
    enum: ['user', 'engineer', 'vendor', 'worker', 'admin', 'b2b', 'b2b_user'],
    required: true,
    index: true
  },
  /** Company the device belongs to, for B2B users (tenant-scoped fan-out). */
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BCompany',
    default: null,
    index: true
  },
  /** Stable per-installation id, so a refreshed token replaces the old row. */
  deviceId: { type: String, required: true, trim: true },
  token: { type: String, required: true, trim: true, index: true },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web', 'unknown'],
    default: 'unknown'
  },
  appVersion: { type: String, default: '' },
  deviceModel: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
  lastSeenAt: { type: Date, default: Date.now },
  /** Set when FCM rejected the token; the row is kept for one audit cycle. */
  invalidatedAt: { type: Date, default: null },
  invalidReason: { type: String, default: null }
}, { timestamps: true });

// One row per device per user; a new token on the same device overwrites it.
deviceTokenSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
deviceTokenSchema.index({ role: 1, active: 1, lastSeenAt: -1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
