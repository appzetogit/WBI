const mongoose = require('mongoose');

// ─── Approved Field Types ─────────────────────────────────────────────────────
const FIELD_TYPES = [
  'TEXT', 'TEXTAREA', 'NUMBER', 'DECIMAL', 'DATE', 'DATETIME',
  'SELECT', 'MULTISELECT', 'RADIO', 'CHECKBOX',
  'FILE', 'IMAGE', 'VIDEO', 'SIGNATURE', 'LOCATION',
  'OTP', 'URL', 'SERIAL_NUMBER', 'REPEATABLE_GROUP'
];

// ─── Validation sub-schema ────────────────────────────────────────────────────
const fieldValidationSchema = new mongoose.Schema({
  min: Number,
  max: Number,
  minLength: Number,
  maxLength: Number,
  pattern: String,
  acceptedTypes: [String], // e.g. ['image/jpeg', 'application/pdf']
  maxFileSizeMB: { type: Number, default: 10 },
  maxFiles: { type: Number, default: 5 }
}, { _id: false });

// ─── Conditional visibility ────────────────────────────────────────────────────
const conditionalSchema = new mongoose.Schema({
  dependsOnField: String, // fieldId
  operator: { type: String, enum: ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IS_EMPTY', 'IS_NOT_EMPTY'], default: 'EQUALS' },
  showWhenValue: mongoose.Schema.Types.Mixed
}, { _id: false });

// ─── Single field definition ──────────────────────────────────────────────────
const formFieldSchema = new mongoose.Schema({
  fieldId: { type: String, required: true }, // unique within form, e.g. "panel_count"
  label: { type: String, required: true },
  placeholder: String,
  helpText: String,
  fieldType: { type: String, enum: FIELD_TYPES, required: true },

  required: { type: Boolean, default: false },
  options: [String], // for SELECT, RADIO, MULTISELECT, CHECKBOX
  defaultValue: mongoose.Schema.Types.Mixed,

  validation: fieldValidationSchema,
  conditionalVisibility: conditionalSchema,

  // For REPEATABLE_GROUP — nested sub-fields
  subFields: [{ type: mongoose.Schema.Types.Mixed }], // self-referential, kept as Mixed

  // Permission controls
  visibleToRoles: [String], // empty = visible to all
  editableByRoles: [String], // empty = editable by all

  order: { type: Number, default: 0 },
  section: String // optional section grouping label
}, { _id: false });

// ─── Form Template Schema ─────────────────────────────────────────────────────
const formTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate', index: true },
  appliesTo: {
    type: String,
    enum: ['TASK', 'SITE_INSPECTION', 'MILESTONE_SIGN_OFF', 'ISSUE_REPORT', 'INDUCTION', 'STANDALONE'],
    default: 'TASK'
  },

  version: { type: Number, default: 1 },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'DEPRECATED'], default: 'DRAFT', index: true },

  fields: {
    type: [formFieldSchema],
    validate: {
      validator: (fields) => {
        // Ensure no duplicate fieldIds within a form
        const ids = fields.map(f => f.fieldId);
        return ids.length === new Set(ids).size;
      },
      message: 'Form fields must have unique fieldIds'
    }
  },

  // Submission settings
  allowEditing: { type: Boolean, default: false }, // can submitter edit after submission?
  requiresApproval: { type: Boolean, default: false },
  submissionLabel: { type: String, default: 'Submit' }, // custom button label

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  publishedAt: Date,

  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

formTemplateSchema.index({ projectTemplateId: 1, status: 1 });
formTemplateSchema.statics.FIELD_TYPES = FIELD_TYPES;

module.exports = mongoose.model('FormTemplate', formTemplateSchema);
