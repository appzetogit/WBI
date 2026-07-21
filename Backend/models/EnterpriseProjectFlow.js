const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/** Enterprise B2B lifecycle — admin-configurable; maps to WorkflowTemplate + ServiceConfig */
const FLOW_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'escrow_locked',
  'assignment_active',
  'vendor_assigned',
  'engineer_assigned',
  'started',
  'in_progress',
  'qa_review',
  'awaiting_customer_approval',
  'awaiting_b2b_approval',
  'customer_approved',
  'milestone_released',
  'payment_released',
  'closed',
  'cancelled',
  'admin_escalation'
];

const timelineSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const enterpriseProjectFlowSchema = new mongoose.Schema(
  {
    flowCode: { type: String, unique: true, index: true },
    categoryCode: { type: String, uppercase: true, index: true },
    categoryName: { type: String, default: '' },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', default: null, index: true },
    vendorOpsProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorOpsProject',
      default: null,
      index: true
    },
    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', default: null },
    b2bCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BCompany', default: null },
    b2bJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'B2BJob', default: null, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    status: { type: String, enum: FLOW_STATUSES, default: 'draft', index: true },
    templateSnapshot: {
      serviceConfigVersion: { type: Number, default: 1 },
      projectTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectTemplate', default: null },
      workflowTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowTemplate', default: null },
      milestoneTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'MilestoneTemplate', default: null }
    },
    configSnapshot: {
      paymentRules: { type: mongoose.Schema.Types.Mixed, default: {} },
      commissionRules: { type: mongoose.Schema.Types.Mixed, default: {} },
      approvalFlow: { type: mongoose.Schema.Types.Mixed, default: {} },
      slaRules: { type: mongoose.Schema.Types.Mixed, default: [] }
    },
    escrow: {
      currency: { type: String, default: 'INR' },
      grossAmount: { type: Number, default: 0 },
      heldAmount: { type: Number, default: 0 },
      releasedAmount: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['none', 'pending', 'held', 'partial_release', 'released', 'refunded'],
        default: 'none'
      }
    },
    assignmentPhase: { type: String, default: '' },
    jobSignoffs: {
      customer: {
        type: String,
        enum: ['not_required', 'pending', 'approved', 'rejected'],
        default: 'not_required'
      },
      b2b: {
        type: String,
        enum: ['not_required', 'pending', 'approved', 'rejected'],
        default: 'not_required'
      },
      customerAt: { type: Date, default: null },
      b2bAt: { type: Date, default: null }
    },
    timeline: [timelineSchema],
    lastEventAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

enterpriseProjectFlowSchema.statics.FLOW_STATUSES = FLOW_STATUSES;

enterpriseProjectFlowSchema.pre('save', async function assignFlowCode(next) {
  if (this.flowCode) return next();
  try {
    const year = new Date().getFullYear();
    const counter = await Counter.findByIdAndUpdate(
      `ent_flow_${year}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.flowCode = `EF-${year}-${String(counter.seq).padStart(5, '0')}`;
  } catch (e) {
    console.error('[EnterpriseProjectFlow] flowCode error:', e.message);
  }
  next();
});

module.exports = mongoose.model('EnterpriseProjectFlow', enterpriseProjectFlowSchema);
