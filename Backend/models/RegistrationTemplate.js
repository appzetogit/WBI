const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema(
  {
    fieldName: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['text', 'textarea', 'number', 'dropdown', 'select', 'radio', 'checkbox', 'multiselect', 'date', 'file', 'email', 'phone'],
      default: 'text'
    },
    required: { type: Boolean, default: false },
    options: [{ type: String }],
    placeholder: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 }
  },
  { _id: false }
);

const documentReqSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    required: { type: Boolean, default: true },
    expiryTracked: { type: Boolean, default: false }
  },
  { _id: false }
);

/**
 * Per-service vendor registration requirements (documents, skills, team, extra fields).
 * Keyed by categoryCode — no hardcoded wizard branches.
 */
const registrationTemplateSchema = new mongoose.Schema(
  {
    categoryCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    categoryName: { type: String, required: true },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    requiredDocuments: [documentReqSchema],
    requiredCertifications: [documentReqSchema],
    requiredSkills: [{ type: String, trim: true }],
    teamFields: [fieldSchema],
    extraFields: [fieldSchema],
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegistrationTemplate', registrationTemplateSchema);
