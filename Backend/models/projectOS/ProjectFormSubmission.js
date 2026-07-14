const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  fieldId: { type: String, required: true },
  url: { type: String, required: true },
  publicId: String,
  fileType: String,
  fileName: String,
  fileSizeMB: Number
}, { _id: false });

const projectFormSubmissionSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectOS', required: true, index: true },
  site: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectSite' },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTask', index: true },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectMilestone' },

  // Form reference — snapshot version at submission time
  formTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'FormTemplate', required: true },
  formVersion: { type: Number, required: true },

  // Submission versioning (allows re-submission after rejection)
  submissionVersion: { type: Number, default: 1 },

  // Actor
  submittedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  submitterRole: String,
  submitterName: String,

  // Data — key: fieldId, value: submitted value
  values: { type: mongoose.Schema.Types.Mixed, default: {} },

  // File attachments — kept in a separate array for indexing
  attachments: [attachmentSchema],

  // Validation
  validationStatus: { type: String, enum: ['VALID', 'INVALID', 'PENDING'], default: 'PENDING' },
  validationErrors: [String],

  // Approval
  approvalStatus: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NOT_REQUIRED' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId },
  approvedAt: Date,
  rejectionReason: String,

  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

projectFormSubmissionSchema.index({ task: 1, formTemplateId: 1 });
projectFormSubmissionSchema.index({ project: 1, submittedBy: 1 });

module.exports = mongoose.model('ProjectFormSubmission', projectFormSubmissionSchema);
