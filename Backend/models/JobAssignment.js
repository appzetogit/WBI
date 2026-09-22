const mongoose = require('mongoose');

/**
 * JobAssignment — append-only assignment history for a job.
 *
 * One row per engineer-holding period. A row is opened when an engineer is
 * assigned and closed exactly once (accepted→completed, rejected, reassigned,
 * cancelled). Closed rows are frozen: the job, vendor and engineer on a row
 * can never change, rows are never deleted, and every reassignment opens a
 * NEW row instead of overwriting the old one.
 */

const OPEN_STATUSES = ['assigned', 'accepted'];
const CLOSED_STATUSES = ['rejected', 'reassigned', 'cancelled', 'completed', 'released', 'expired'];

/** Fields fixed at creation. */
const IMMUTABLE_PATHS = [
  'jobId', 'jobCode', 'assignmentType', 'vendorId', 'engineerId',
  'assignedBy.actorId', 'assignedBy.role', 'assignedAt',
  'previousEngineerId', 'previousAssignmentId', 'routingMode'
];

/** Fields the closing update may set (plus acceptance while still open). */
const CLOSE_PATHS = [
  'status', 'isOpen', 'acceptedAt', 'rejectedAt', 'reassignedAt', 'completedAt',
  'cancelledAt', 'expiredAt', 'closedAt', 'newEngineerId', 'nextAssignmentId', 'closeReason',
  'closedBy', 'updatedAt'
];

const jobAssignmentSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', required: true, index: true },
  jobCode: { type: String, default: '' },
  assignmentType: {
    type: String,
    enum: ['vendor_engineer', 'freelancer', 'worker'],
    required: true
  },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
  engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', required: true, index: true },
  engineerName: { type: String, default: '' },
  assignedBy: {
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, enum: ['admin', 'vendor', 'company', 'engineer', 'system'], required: true }
  },
  routingMode: { type: String, enum: ['auto', 'manual', 'hybrid'], default: 'manual' },
  reason: { type: String, default: '' },
  /** Why this engineer was eligible at assignment time (skill/location/workload). */
  eligibility: { type: mongoose.Schema.Types.Mixed, default: undefined },

  previousEngineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', default: null },
  previousAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobAssignment', default: null },

  status: { type: String, enum: [...OPEN_STATUSES, ...CLOSED_STATUSES], default: 'assigned', index: true },
  isOpen: { type: Boolean, default: true },

  assignedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  reassignedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  expiredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },

  newEngineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Engineer', default: null },
  nextAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobAssignment', default: null },
  closeReason: { type: String, default: '' },
  closedBy: {
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    role: { type: String, default: null }
  }
}, { timestamps: true });

// At most one open assignment per job.
jobAssignmentSchema.index(
  { jobId: 1 },
  { unique: true, partialFilterExpression: { isOpen: true }, name: 'one_open_assignment_per_job' }
);
jobAssignmentSchema.index({ jobId: 1, assignedAt: -1 });
jobAssignmentSchema.index({ vendorId: 1, assignedAt: -1 });
jobAssignmentSchema.index({ engineerId: 1, status: 1 });

class AssignmentHistoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssignmentHistoryError';
    this.status = 500;
    this.code = 'ASSIGNMENT_HISTORY_IMMUTABLE';
  }
}

jobAssignmentSchema.post('init', function () {
  this.$locals.persistedStatus = this.status;
});

jobAssignmentSchema.pre('save', function (next) {
  if (this.isNew) return next();
  if (CLOSED_STATUSES.includes(this.$locals.persistedStatus)) {
    return next(new AssignmentHistoryError('Closed assignment rows are immutable'));
  }
  const changedImmutable = IMMUTABLE_PATHS.filter((p) => this.isModified(p));
  if (changedImmutable.length) {
    return next(new AssignmentHistoryError(`Assignment fields are immutable: ${changedImmutable.join(', ')}`));
  }
  return next();
});

jobAssignmentSchema.post('save', function () {
  this.$locals.persistedStatus = this.status;
});

const updatedPaths = (update = {}) => {
  const paths = [];
  for (const [key, value] of Object.entries(update || {})) {
    if (key.startsWith('$')) {
      // Mongoose's timestamps plugin adds $setOnInsert: { createdAt }.
      const onlyCreatedAt = key === '$setOnInsert' && Object.keys(value || {}).every((k) => k === 'createdAt');
      if (onlyCreatedAt) continue;
      if (!['$set', '$currentDate'].includes(key)) paths.push(key);
      else paths.push(...Object.keys(value || {}));
    } else {
      paths.push(key);
    }
  }
  return paths;
};

jobAssignmentSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
  const update = this.getUpdate();
  if (Array.isArray(update)) {
    return next(new AssignmentHistoryError('Pipeline updates are not allowed on assignment history'));
  }
  const illegal = updatedPaths(update).filter((p) => !CLOSE_PATHS.includes(p));
  if (illegal.length) {
    return next(new AssignmentHistoryError(`Only open assignments can be closed; cannot update: ${illegal.join(', ')}`));
  }
  // Closed rows never match, so they can never be modified.
  this.where({ isOpen: true });
  return next();
});

const refuse = function (next) {
  next(new AssignmentHistoryError('Assignment history cannot be deleted or bulk-modified'));
};
jobAssignmentSchema.pre(['updateMany', 'replaceOne', 'findOneAndReplace'], refuse);
jobAssignmentSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], { document: false, query: true }, refuse);
jobAssignmentSchema.pre('deleteOne', { document: true, query: false }, refuse);

jobAssignmentSchema.statics.OPEN_STATUSES = OPEN_STATUSES;
jobAssignmentSchema.statics.CLOSED_STATUSES = CLOSED_STATUSES;

module.exports = mongoose.model('JobAssignment', jobAssignmentSchema);
module.exports.AssignmentHistoryError = AssignmentHistoryError;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
module.exports.CLOSED_STATUSES = CLOSED_STATUSES;
