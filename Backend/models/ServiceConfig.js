const mongoose = require('mongoose');



const extraKpiSchema = new mongoose.Schema({

  key: { type: String, required: true },

  label: { type: String, required: true },

  unit: { type: String, default: 'units' },

  icon: { type: String, default: 'activity' },

  color: { type: String, default: 'blue' },

  dataSource: { type: String, default: 'installed_assets' },

  countField: { type: String, default: '' },

  countValue: { type: String, default: '' },

  aggregation: { type: String, enum: ['count', 'sum'], default: 'count' }

}, { _id: false });



const inventoryCategorySchema = new mongoose.Schema({

  name: { type: String, required: true },

  unit: { type: String, default: 'piece' },

  lowStockThreshold: { type: Number, default: 5 },

  icon: { type: String, default: 'box' }

}, { _id: false });



const toolCategorySchema = new mongoose.Schema({

  name: { type: String, required: true },

  type: { type: String, default: 'hand_tool' }

}, { _id: false });



const milestoneSchema = new mongoose.Schema({

  order: { type: Number, required: true },

  title: { type: String, required: true },

  description: { type: String, default: '' },

  defaultDays: { type: Number, default: 1 },

  paymentPercent: { type: Number, default: 0 },

  proofRequired: { type: Boolean, default: true },

  proofTypes: [{ type: String }]

}, { _id: false });



const checklistItemSchema = new mongoose.Schema({

  item: { type: String, required: true },

  required: { type: Boolean, default: true }

}, { _id: false });



const complianceDocSchema = new mongoose.Schema({

  name: { type: String, required: true },

  required: { type: Boolean, default: true },

  expiryTracked: { type: Boolean, default: false },

  renewalDays: { type: Number, default: 365 }

}, { _id: false });



const assetFieldSchema = new mongoose.Schema({

  field: { type: String, required: true },

  label: { type: String, required: true },

  required: { type: Boolean, default: false }

}, { _id: false });



const subCategorySchema = new mongoose.Schema({

  subCatCode: { type: String, required: true, trim: true, uppercase: true },

  subCatName: { type: String, required: true, trim: true },

  description: { type: String, default: '' },

  icon: { type: String, default: '' },

  basePrice: { type: Number, default: 999 },

  displayOrder: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true }

}, { _id: false });



const pricingRuleSchema = new mongoose.Schema({

  key: { type: String, required: true },

  label: { type: String, required: true },

  amount: { type: Number, default: 0 },

  currency: { type: String, default: 'INR' },

  unit: { type: String, default: 'visit' }

}, { _id: false });



const slaRuleSchema = new mongoose.Schema({

  key: { type: String, required: true },

  label: { type: String, required: true },

  responseMinutes: { type: Number, default: 60 },

  resolutionHours: { type: Number, default: 24 }

}, { _id: false });



const serviceConfigSchema = new mongoose.Schema({

  categoryCode: { type: String, required: true, unique: true, index: true, uppercase: true },

  categoryName: { type: String, required: true },

  description: { type: String, default: '' },

  tags: [{ type: String, trim: true }],

  displayOrder: { type: Number, default: 0, index: true },

  type: { type: String, default: 'project_based', index: true },

  serviceType: {

    type: String,

    enum: ['project', 'one_time', 'b2b', 'hybrid', 'project_based'],

    default: 'hybrid',

    index: true

  },

  icon: { type: String, default: 'briefcase' },

  image: { type: String, default: null },

  color: { type: String, default: '#3B82F6' },

  requiredVendorType: { type: String, default: 'enterprise' },

  requiredSkills: [{ type: String, trim: true }],

  requiredDocuments: [{ type: String, trim: true }],

  subCategories: [subCategorySchema],

  extraKPIs: [extraKpiSchema],

  inventoryCategories: [inventoryCategorySchema],

  toolCategories: [toolCategorySchema],

  projectMilestones: [milestoneSchema],

  siteChecklist: [checklistItemSchema],

  complianceDocs: [complianceDocSchema],

  assetFields: [assetFieldSchema],

  opportunityMatchFields: [{ type: String }],

  matchAliases: [{ type: String }],

  pricingRules: [pricingRuleSchema],

  paymentRules: { type: mongoose.Schema.Types.Mixed, default: {} },

  commissionRules: { type: mongoose.Schema.Types.Mixed, default: {} },

  slaRules: [slaRuleSchema],

  approvalFlow: { type: mongoose.Schema.Types.Mixed, default: {} },

  /** active | inactive | archived — soft lifecycle; never hard-delete */

  status: {

    type: String,

    enum: ['active', 'inactive', 'archived'],

    default: 'active',

    index: true

  },

  version: { type: Number, default: 1 },

  publishedAt: { type: Date, default: null },

  archivedAt: { type: Date, default: null },

  isActive: { type: Boolean, default: true, index: true }

}, { timestamps: true });



serviceConfigSchema.index({ status: 1, isActive: 1, displayOrder: 1 });

serviceConfigSchema.index({ categoryName: 'text', description: 'text', tags: 'text' });



module.exports = mongoose.model('ServiceConfig', serviceConfigSchema);


