const mongoose = require('mongoose');

// ─── Approved Registries ──────────────────────────────────────────────────────

const MODULE_KEYS = [
  'OVERVIEW', 'SITES', 'MILESTONES', 'TASKS', 'TEAM',
  'INVENTORY', 'ASSETS', 'DOCUMENTS', 'APPROVALS', 'ISSUES',
  'FINANCE', 'SLA', 'REPORTS', 'ACTIVITY', 'SETTINGS'
];

const WIDGET_TYPES = [
  'KPI_CARD', 'LINE_CHART', 'BAR_CHART', 'DONUT_CHART', 'DATA_TABLE',
  'SITE_MAP', 'GANTT_CHART', 'MILESTONE_TIMELINE', 'TASK_BOARD',
  'APPROVAL_QUEUE', 'ISSUE_LIST', 'INVENTORY_SUMMARY', 'FINANCE_SUMMARY',
  'SLA_MONITOR', 'ACTIVITY_FEED'
];

const APPROVED_METRIC_KEYS = [
  'PROJECT_PROGRESS', 'TOTAL_SITES', 'COMPLETED_SITES', 'PENDING_SITES',
  'IN_PROGRESS_SITES', 'OVERDUE_TASKS', 'OPEN_TASKS', 'OPEN_ISSUES',
  'ENGINEERS_ACTIVE', 'MILESTONES_DUE', 'PENDING_APPROVALS', 'PROJECT_VALUE',
  'INVOICED_AMOUNT', 'RECEIVED_AMOUNT', 'OUTSTANDING_AMOUNT', 'SLA_COMPLIANCE'
];

const EXECUTION_TYPES = [
  'MULTI_SITE_INSTALLATION', 'SINGLE_SITE_INSTALLATION',
  'SOFTWARE_DELIVERY', 'EQUIPMENT_DEPLOYMENT', 'AUDIT_INSPECTION',
  'AMC_PROGRAM', 'INFRASTRUCTURE_ROLLOUT'
];

const TEMPLATE_STATUSES = ['DRAFT', 'VALIDATION_FAILED', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED'];

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const moduleConfigSchema = new mongoose.Schema({
  key: { type: String, enum: MODULE_KEYS, required: true },
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  label: { type: String } // Optional custom label override
}, { _id: false });

const widgetConfigSchema = new mongoose.Schema({
  widgetId: { type: String, required: true }, // uuid for ordering
  widgetType: { type: String, enum: WIDGET_TYPES, required: true },
  metricKey: { type: String, enum: [...APPROVED_METRIC_KEYS, null] },
  title: { type: String },
  subtitle: { type: String },
  size: { type: String, enum: ['SM', 'MD', 'LG', 'XL'], default: 'MD' },
  position: { row: Number, col: Number },
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const changelogSchema = new mongoose.Schema({
  version: Number,
  note: String,
  actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  actionAt: { type: Date, default: Date.now }
}, { _id: false });

const validationResultSchema = new mongoose.Schema({
  passed: { type: Boolean, default: false },
  validationErrors: [String],   // renamed from 'errors' — Mongoose reserved keyword
  warnings: [String],
  validatedAt: Date
}, { _id: false });

// ─── Main Schema ──────────────────────────────────────────────────────────────

const projectTemplateSchema = new mongoose.Schema({

  // Identity
  templateKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9_-]+$/, 'Template key must be lowercase alphanumeric with hyphens/underscores']
  },
  name: { type: String, required: true, trim: true },
  description: { type: String },
  icon: { type: String }, // emoji or icon name

  // Versioning
  version: { type: Number, default: 1 },
  status: { type: String, enum: TEMPLATE_STATUSES, default: 'DRAFT', index: true },

  // Inheritance
  baseTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate' },

  // Category mapping
  category: { type: String, required: true }, // e.g. "CCTV", "SOLAR", "DIGITAL"
  subcategory: { type: String },
  supportedProjectTypes: [String],

  // Execution type defines site/task behavior
  executionType: { type: String, enum: EXECUTION_TYPES, required: true },

  // Module visibility configuration
  modules: {
    type: [moduleConfigSchema],
    default: MODULE_KEYS.map((key, i) => ({ key, enabled: true, order: i }))
  },

  // Dashboard widgets
  widgets: [widgetConfigSchema],

  // Linked template references
  milestoneTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'MilestoneTemplate' },
  formTemplateIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FormTemplate' }],
  approvalTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalTemplate' },
  financeTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceTemplate' },
  inventoryTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryTemplate' },
  documentTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentTemplate' },
  workflowTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowTemplate' },
  slaTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SLATemplate' },

  // Validation & publishing
  validationResult: validationResultSchema,
  changelog: [changelogSchema],

  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  publishedAt: Date,
  deprecatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  deprecatedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },

  // Snapshot flag (frozen copy attached to a live project)
  isSnapshot: { type: Boolean, default: false },
  snapshotOf: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate' },

  // Soft delete
  isDeleted: { type: Boolean, default: false }

}, { timestamps: true });

// ─── Indexes ──────────────────────────────────────────────────────────────────
projectTemplateSchema.index({ category: 1, status: 1 });
projectTemplateSchema.index({ isSnapshot: 1 });

// ─── Guard: Published templates are immutable ──────────────────────────────────
projectTemplateSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew && this._original?.status === 'PUBLISHED') {
    const allowedFields = ['status', 'deprecatedBy', 'deprecatedAt', 'changelog'];
    const modifiedPaths = this.modifiedPaths();
    const illegal = modifiedPaths.filter(p => !allowedFields.some(f => p.startsWith(f)));
    if (illegal.length > 0) {
      return next(new Error(`Published templates are immutable. Mutated fields: ${illegal.join(', ')}`));
    }
  }
  next();
});

// Export registries for use in validation
projectTemplateSchema.statics.WIDGET_TYPES = WIDGET_TYPES;
projectTemplateSchema.statics.MODULE_KEYS = MODULE_KEYS;
projectTemplateSchema.statics.APPROVED_METRIC_KEYS = APPROVED_METRIC_KEYS;
projectTemplateSchema.statics.EXECUTION_TYPES = EXECUTION_TYPES;

module.exports = mongoose.model('ProjectTemplate', projectTemplateSchema);
