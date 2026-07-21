const mongoose = require('mongoose');

/**
 * Form schemas keyed by subCatCode (e.g. C03-01).
 * Adding a new sub-service = seed a new doc — no frontend code change.
 */
const fieldSchema = new mongoose.Schema({
  fieldName: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['text', 'textarea', 'number', 'dropdown', 'select', 'radio', 'checkbox', 'multiselect', 'date', 'time', 'file', 'email', 'phone'],
    required: true
  },
  required: { type: Boolean, default: false },
  options: [{ type: String }],
  placeholder: { type: String, default: '' },
  validation: {
    min: Number,
    max: Number,
    regex: String
  },
  displayOrder: { type: Number, default: 0 }
}, { _id: false });

const formSchemaSchema = new mongoose.Schema({
  categoryCode: { type: String, required: true, uppercase: true, index: true },
  categoryName: { type: String, required: true },
  subCatCode: { type: String, required: true, uppercase: true, unique: true, index: true },
  subCategoryName: { type: String, required: true },
  description: { type: String, default: '' },
  iconName: { type: String, default: 'FiWifi' },
  basePrice: { type: Number, default: 999 },
  fields: { type: [fieldSchema], default: [] },
  isActive: { type: Boolean, default: true, index: true },
  version: { type: Number, default: 1 }
}, { timestamps: true });

formSchemaSchema.index({ categoryCode: 1, isActive: 1 });

module.exports = mongoose.model('FormSchema', formSchemaSchema);
