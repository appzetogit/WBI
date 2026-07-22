const mongoose = require('mongoose');

/**
 * Platform-wide Vendor Support module configuration.
 * All categories, priorities, statuses, forms, SLA, assignment, KB, etc. live here.
 * Optional serviceCategoryCode scopes a config overlay for a specific registered service.
 */
const labeledItem = {
  code: { type: String, required: true, trim: true, lowercase: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  color: { type: String, default: '#64748b' },
  icon: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
};

const customFieldSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true },
  type: {
    type: String,
    enum: ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'file', 'phone', 'email'],
    default: 'text'
  },
  required: { type: Boolean, default: false },
  options: [{ label: String, value: String }],
  placeholder: { type: String, default: '' },
  appliesToCategories: { type: [String], default: [] },
  appliesToServices: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const statusSchema = new mongoose.Schema({
  ...labeledItem,
  isTerminal: { type: Boolean, default: false },
  isInitial: { type: Boolean, default: false },
  vendorVisible: { type: Boolean, default: true },
  countsTowardOpen: { type: Boolean, default: true },
  allowedRoles: { type: [String], default: ['admin', 'support_executive', 'manager', 'vendor'] }
}, { _id: false });

const workflowTransitionSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  action: { type: String, required: true },
  label: { type: String, default: '' },
  allowedRoles: { type: [String], default: ['admin', 'support_executive', 'manager', 'vendor'] },
  requiresComment: { type: Boolean, default: false },
  autoNotify: { type: [String], default: ['email', 'push'] }
}, { _id: false });

const slaRuleSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  priorityCode: { type: String, default: '' },
  categoryCode: { type: String, default: '' },
  serviceCategoryCode: { type: String, default: '' },
  firstResponseMinutes: { type: Number, default: 60 },
  resolutionMinutes: { type: Number, default: 1440 },
  businessHoursOnly: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const assignmentRuleSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  priority: { type: Number, default: 0 },
  match: {
    categoryCodes: { type: [String], default: [] },
    priorityCodes: { type: [String], default: [] },
    serviceCategoryCodes: { type: [String], default: [] },
    tags: { type: [String], default: [] }
  },
  assignToDepartmentCode: { type: String, default: '' },
  assignToTeamCode: { type: String, default: '' },
  assignToRole: { type: String, default: 'support_executive' },
  assignToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  strategy: { type: String, enum: ['round_robin', 'least_open', 'fixed', 'manual'], default: 'least_open' },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const escalationStepSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  afterMinutes: { type: Number, required: true },
  escalateToRole: { type: String, default: 'manager' },
  escalateToDepartmentCode: { type: String, default: '' },
  notifyChannels: { type: [String], default: ['email', 'push', 'sms'] },
  bumpPriorityTo: { type: String, default: '' }
}, { _id: false });

const departmentSchema = new mongoose.Schema({
  code: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  teamCodes: { type: [String], default: [] },
  memberAdminIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  isActive: { type: Boolean, default: true }
}, { _id: false });

const knowledgeArticleSchema = new mongoose.Schema({
  code: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  body: { type: String, default: '' },
  categoryCode: { type: String, default: '' },
  serviceCategoryCodes: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isPublic: { type: Boolean, default: true }
}, { _id: false });

const notificationTemplateSchema = new mongoose.Schema({
  code: { type: String, required: true },
  event: { type: String, required: true },
  channel: { type: String, enum: ['email', 'sms', 'push', 'in_app'], required: true },
  subject: { type: String, default: '' },
  body: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const permissionSchema = new mongoose.Schema({
  role: { type: String, required: true },
  canCreate: { type: Boolean, default: true },
  canViewAll: { type: Boolean, default: false },
  canAssign: { type: Boolean, default: false },
  canComment: { type: Boolean, default: true },
  canInternalNote: { type: Boolean, default: false },
  canResolve: { type: Boolean, default: false },
  canClose: { type: Boolean, default: false },
  canReopen: { type: Boolean, default: false },
  canConfigure: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false }
}, { _id: false });

const attachmentRuleSchema = new mongoose.Schema({
  maxFiles: { type: Number, default: 5 },
  maxSizeMb: { type: Number, default: 10 },
  allowedMimeTypes: {
    type: [String],
    default: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']
  },
  requiredOnCreate: { type: Boolean, default: false }
}, { _id: false });

const ticketNumberSchema = new mongoose.Schema({
  prefix: { type: String, default: 'SUP' },
  includeYear: { type: Boolean, default: true },
  includeServiceCode: { type: Boolean, default: false },
  padding: { type: Number, default: 5 },
  separator: { type: String, default: '-' }
}, { _id: false });

const supportModuleConfigSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'service'],
      default: 'global',
      index: true
    },
    serviceCategoryCode: { type: String, default: '', index: true },
    name: { type: String, default: 'Vendor Support' },
    isActive: { type: Boolean, default: true, index: true },
    categories: { type: [new mongoose.Schema(labeledItem, { _id: false })], default: [] },
    priorities: { type: [new mongoose.Schema({ ...labeledItem, weight: { type: Number, default: 0 }, slaMultiplier: { type: Number, default: 1 } }, { _id: false })], default: [] },
    statuses: { type: [statusSchema], default: [] },
    workflow: { type: [workflowTransitionSchema], default: [] },
    slaRules: { type: [slaRuleSchema], default: [] },
    assignmentRules: { type: [assignmentRuleSchema], default: [] },
    escalationMatrix: { type: [escalationStepSchema], default: [] },
    departments: { type: [departmentSchema], default: [] },
    tags: { type: [new mongoose.Schema(labeledItem, { _id: false })], default: [] },
    knowledgeBase: { type: [knowledgeArticleSchema], default: [] },
    notificationTemplates: { type: [notificationTemplateSchema], default: [] },
    rolePermissions: { type: [permissionSchema], default: [] },
    customFields: { type: [customFieldSchema], default: [] },
    attachmentRules: { type: attachmentRuleSchema, default: () => ({}) },
    ticketNumber: { type: ticketNumberSchema, default: () => ({}) },
    dashboardStatStatusCodes: { type: [String], default: [] },
    linkableEntities: {
      type: [String],
      default: ['vendor', 'service', 'project', 'client', 'engineer', 'worker', 'branch', 'company']
    },
    version: { type: Number, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
  },
  { timestamps: true }
);

supportModuleConfigSchema.index({ scope: 1, serviceCategoryCode: 1 }, { unique: true });

module.exports = mongoose.model('SupportModuleConfig', supportModuleConfigSchema);
