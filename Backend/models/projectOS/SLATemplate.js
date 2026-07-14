const mongoose = require('mongoose');

const SLA_TYPES = [
  'ASSIGNMENT', 'ACCEPTANCE', 'ARRIVAL', 'TASK_COMPLETION',
  'MILESTONE', 'APPROVAL', 'ISSUE_RESOLUTION'
];

const escalationStepSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  role: { type: String, required: true }, // e.g. 'SUPERVISOR', 'VENDOR_OWNER', 'WBI_ADMIN'
  notifyByEmail: { type: Boolean, default: true },
  notifyByPush: { type: Boolean, default: true }
}, { _id: false });

const slaRuleSchema = new mongoose.Schema({
  slaType: { type: String, enum: SLA_TYPES, required: true },
  warningHours: { type: Number, required: true },
  breachHours: { type: Number, required: true },
  escalationPath: [escalationStepSchema],
  pauseOnHold: { type: Boolean, default: true }, // pause SLA clock when task is ON_HOLD
  businessHoursOnly: { type: Boolean, default: false }
}, { _id: false });

const slaTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate', index: true },
  rules: {
    type: [slaRuleSchema],
    validate: {
      validator: (arr) => arr.length > 0,
      message: 'At least one SLA rule must be defined'
    }
  },
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'], default: 'DRAFT' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('SLATemplate', slaTemplateSchema);
