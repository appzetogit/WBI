const mongoose = require('mongoose');

/**
 * Backend-sourced job timeline. Every lifecycle transition written by
 * services/jobLifecycle.service.js lands here with its canonical from/to
 * states; older rows only carry the legacy `status`.
 */
const jobHistorySchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'B2BJob',
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true
  },
  /** Canonical lifecycle state before / after this event (jobStateMachine). */
  fromStatus: {
    type: String,
    default: null
  },
  toStatus: {
    type: String,
    default: null
  },
  /** Machine key for non-transition events, e.g. ENGINEER_ASSIGNED, ROUTING_RETRY. */
  event: {
    type: String,
    default: null
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  role: {
    type: String,
    enum: ['system', 'admin', 'company', 'engineer', 'vendor'],
    default: 'system'
  },
  remark: {
    type: String,
    default: ''
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  }
}, {
  timestamps: true
});

jobHistorySchema.index({ jobId: 1, createdAt: -1 });

module.exports = mongoose.model('JobHistory', jobHistorySchema);
