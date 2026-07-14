const mongoose = require('mongoose');

const milestoneDefSchema = new mongoose.Schema({
  order: { type: Number, required: true },
  title: { type: String, required: true },
  description: String,
  slaDays: { type: Number, default: 7 },
  requiresApproval: { type: Boolean, default: false },
  requiresInvoice: { type: Boolean, default: false },
  invoicePercentage: { type: Number, default: 0 }, // % of contract value to invoice at this milestone
  defaultFormTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'FormTemplate' },
  color: { type: String, default: '#10B981' } // for timeline display
}, { _id: false });

const milestoneTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  projectTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProjectTemplate',
    required: true,
    index: true
  },
  milestones: {
    type: [milestoneDefSchema],
    validate: {
      validator: (arr) => arr.length > 0,
      message: 'At least one milestone must be defined'
    }
  },
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'], default: 'DRAFT' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('MilestoneTemplate', milestoneTemplateSchema);
