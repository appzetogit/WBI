const mongoose = require('mongoose');

/**
 * Audit + rate-limit log for public vendor company code validation.
 */
const vendorCodeAttemptSchema = new mongoose.Schema({
  ipAddress: { type: String, default: '', index: true },
  sessionId: { type: String, default: '', index: true },
  codeAttempted: { type: String, default: '' },
  success: { type: Boolean, default: false },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  attemptedAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: false
});

vendorCodeAttemptSchema.index({ ipAddress: 1, attemptedAt: -1 });
vendorCodeAttemptSchema.index({ sessionId: 1, attemptedAt: -1 });

module.exports = mongoose.model('VendorCodeAttempt', vendorCodeAttemptSchema);
