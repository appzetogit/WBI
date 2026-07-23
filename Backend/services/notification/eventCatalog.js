/**
 * Enterprise notification event catalog.
 * Every product alert must be declared here before emit().
 */

const PRIORITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

/** @typedef {'admin'|'vendor'|'engineer'|'user'|'worker'|'b2b'|'broadcast'} RecipientRole */
/** @typedef {'in_app'|'push'|'email'|'sms'|'whatsapp'} Channel */

/**
 * @typedef {Object} EventDef
 * @property {RecipientRole[]} recipients
 * @property {Channel[]} channels
 * @property {'high'|'medium'|'low'} priority
 * @property {string} category
 * @property {string} [emailTemplate]
 * @property {string} [smsTemplate] - env key for DLT template id
 * @property {boolean} [fallbackOnPushFail]
 * @property {(data: object) => string} title
 * @property {(data: object) => string} message
 * @property {(data: object, role: string) => string|null} actionUrl
 * @property {(data: object, role: string, id: string) => string} dedupe
 */

/** @type {Record<string, EventDef>} */
const EVENT_CATALOG = {
  user_registered: {
    recipients: ['admin'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => 'New user registered',
    message: (d) => `${d.name || 'A user'} (${d.phone || d.email || '—'}) just signed up.`,
    actionUrl: () => '/admin/users',
    dedupe: (d, role, id) => `user_registered:${d.userId || d.entityId}:${id}`
  },
  vendor_registered: {
    recipients: ['admin'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'admin_vendor_registered',
    fallbackOnPushFail: true,
    title: (d) => 'New vendor registration',
    message: (d) => `${d.businessName || d.name || 'Vendor'} submitted onboarding for review.`,
    actionUrl: () => '/admin/vendors/all',
    dedupe: (d, role, id) => `vendor_registered:${d.vendorId || d.entityId}:${id}`
  },
  b2b_registered: {
    recipients: ['admin'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'admin_b2b_registered',
    fallbackOnPushFail: true,
    title: (d) => 'New B2B company registration',
    message: (d) => `${d.companyName || 'A company'} registered for enterprise onboarding.`,
    actionUrl: () => '/admin/b2b',
    dedupe: (d, role, id) => `b2b_registered:${d.companyId || d.entityId}:${id}`
  },
  vendor_approved: {
    recipients: ['vendor'],
    channels: ['in_app', 'push', 'email', 'sms'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'vendor_approved',
    smsTemplate: 'SMS_DLT_VENDOR_APPROVED',
    fallbackOnPushFail: true,
    title: () => 'Vendor registration approved',
    message: () => 'Your vendor registration has been approved. You can now start accepting bookings.',
    actionUrl: () => 'dashboard',
    dedupe: (d, role, id) => `vendor_approved:${id}`
  },
  vendor_rejected: {
    recipients: ['vendor'],
    channels: ['in_app', 'push', 'email', 'sms'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'vendor_rejected',
    smsTemplate: 'SMS_DLT_VENDOR_REJECTED',
    fallbackOnPushFail: true,
    title: () => 'Vendor registration rejected',
    message: (d) => d.reason || 'Your vendor registration was rejected. Please contact support.',
    actionUrl: () => 'pending-approval',
    dedupe: (d, role, id) => `vendor_rejected:${id}`
  },
  engineer_approved: {
    recipients: ['engineer'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'engineer_approved',
    fallbackOnPushFail: true,
    title: () => 'Account approved',
    message: (d) => d.message || 'Your engineer account has been approved. You can now receive jobs.',
    actionUrl: () => '/engineer/dashboard',
    dedupe: (d, role, id) => `engineer_approved:${id}`
  },
  engineer_vendor_approved: {
    recipients: ['engineer'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.HIGH,
    category: 'jobs',
    fallbackOnPushFail: true,
    title: () => 'Vendor approved you',
    message: (d) => d.message || 'Your vendor approved your join request. You can now receive assigned jobs.',
    actionUrl: () => '/engineer/dashboard',
    dedupe: (d, role, id) => `engineer_vendor_approved:${id}:${d.vendorId || ''}`
  },
  project_assigned_vendor: {
    recipients: ['vendor'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.HIGH,
    category: 'jobs',
    fallbackOnPushFail: true,
    title: (d) => 'Engineer assigned',
    message: (d) => `${d.engineerName || 'Engineer'} assigned to ${d.projectTitle || 'project'}.`,
    actionUrl: (d) => d.actionUrl || 'workforce/assignments',
    dedupe: (d, role, id) => `project_assigned_vendor:${d.projectId}:${d.engineerId || ''}`
  },
  project_assigned_engineer: {
    recipients: ['engineer'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'jobs',
    emailTemplate: 'engineer_ops_job_assigned',
    fallbackOnPushFail: true,
    title: (d) => 'New job assigned',
    message: (d) => d.message || `New job assigned: ${d.projectTitle || d.title || 'Project'}`,
    actionUrl: () => '/engineer/jobs',
    dedupe: (d, role, id) => `project_assigned_engineer:${d.jobId || d.projectId}:${id}`
  },
  quote_submitted: {
    recipients: ['b2b', 'admin'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'jobs',
    emailTemplate: 'quote_submitted',
    fallbackOnPushFail: true,
    title: (d) => 'Quote submitted',
    message: (d) => d.message || `${d.vendorName || 'Vendor'} submitted a quote for ${d.projectTitle || 'your request'}.`,
    actionUrl: (d, role) => (role === 'admin' ? '/admin/opportunities' : '/b2b/quotes'),
    dedupe: (d, role, id) => `quote_submitted:${d.quoteId || d.opportunityId}:${role}:${id}`
  },
  quote_approved: {
    recipients: ['vendor', 'engineer'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'jobs',
    emailTemplate: 'quote_approved',
    fallbackOnPushFail: true,
    title: () => 'Quote approved',
    message: (d) => d.message || 'Your quote was approved. Proceed with project execution.',
    actionUrl: (d, role) => (role === 'engineer' ? '/engineer/jobs' : 'project-operations'),
    dedupe: (d, role, id) => `quote_approved:${d.quoteId || d.opportunityId}:${role}:${id}`
  },
  milestone_completed: {
    recipients: ['admin', 'user', 'b2b', 'vendor'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'jobs',
    emailTemplate: 'milestone_completed',
    title: (d) => 'Milestone completed',
    message: (d) => d.message || `Milestone "${d.milestoneName || 'step'}" completed on ${d.projectTitle || 'project'}.`,
    actionUrl: (d, role) => {
      if (role === 'admin') return '/admin/projects';
      if (role === 'b2b') return '/b2b/projects';
      if (role === 'vendor') return 'project-operations';
      return '/user/bookings';
    },
    dedupe: (d, role, id) => `milestone_completed:${d.milestoneId || d.projectId}:${role}:${id}`
  },
  payment_released: {
    recipients: ['vendor'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'payments',
    emailTemplate: 'payment_released',
    fallbackOnPushFail: true,
    title: () => 'Payment released',
    message: (d) => d.message || `Payment of ₹${d.amount || 0} has been released to your wallet.`,
    actionUrl: () => 'finance/wallet',
    dedupe: (d, role, id) => `payment_released:${d.paymentId || d.txnId}:${id}`
  },
  invoice_generated: {
    recipients: ['vendor', 'b2b'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'payments',
    emailTemplate: 'invoice_generated',
    title: (d) => 'Invoice generated',
    message: (d) => d.message || `Invoice ${d.invoiceNumber || ''} is ready.`,
    actionUrl: (d, role) => (role === 'b2b' ? '/b2b/invoices' : 'finance/invoices'),
    dedupe: (d, role, id) => `invoice_generated:${d.invoiceId}:${role}:${id}`
  },
  compliance_expiry: {
    recipients: ['vendor'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'compliance_expiry',
    fallbackOnPushFail: true,
    title: (d) => 'Compliance document expiring',
    message: (d) => d.message || `${d.documentName || 'A document'} expires on ${d.expiryDate || 'soon'}.`,
    actionUrl: () => 'compliance',
    dedupe: (d, role, id) => `compliance_expiry:${d.documentId}:${id}`
  },
  document_reupload_required: {
    recipients: ['vendor'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    emailTemplate: 'document_reupload',
    fallbackOnPushFail: true,
    title: () => 'Document re-upload required',
    message: (d) => d.message || 'Please re-upload the requested verification document.',
    actionUrl: () => 'compliance',
    dedupe: (d, role, id) => `document_reupload:${d.documentId}:${id}`
  },
  leave_updated: {
    recipients: ['engineer', 'vendor'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'jobs',
    title: (d) => d.title || 'Leave update',
    message: (d) => d.message || 'Leave request status was updated.',
    actionUrl: (d, role) => (role === 'vendor' ? 'workforce/leave' : '/engineer/leave'),
    dedupe: (d, role, id) => `leave_updated:${d.leaveId}:${role}:${id}`
  },
  attendance_updated: {
    recipients: ['engineer', 'vendor'],
    channels: ['in_app'],
    priority: PRIORITY.LOW,
    category: 'jobs',
    title: (d) => d.title || 'Attendance update',
    message: (d) => d.message || 'Attendance record updated.',
    actionUrl: (d, role) => (role === 'vendor' ? 'workforce/attendance' : '/engineer/attendance'),
    dedupe: (d, role, id) => `attendance_updated:${d.attendanceId || d.date}:${role}:${id}`
  },
  project_status_changed: {
    recipients: ['vendor', 'engineer', 'user', 'b2b', 'admin'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'jobs',
    title: (d) => 'Project status updated',
    message: (d) => d.message || `${d.projectTitle || 'Project'} is now ${d.status || 'updated'}.`,
    actionUrl: (d, role) => {
      if (role === 'admin') return '/admin/projects';
      if (role === 'b2b') return '/b2b/projects';
      if (role === 'vendor') return 'project-operations';
      if (role === 'engineer') return '/engineer/jobs';
      return '/user/bookings';
    },
    dedupe: (d, role, id) => `project_status:${d.projectId}:${d.status}:${role}:${id}`
  },
  support_ticket_updated: {
    recipients: ['vendor', 'user', 'b2b', 'admin'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => d.title || 'Support ticket update',
    message: (d) => d.message || `Ticket ${d.ticketCode || ''} was updated.`,
    actionUrl: (d, role) => {
      if (role === 'admin') return '/admin/support';
      if (role === 'b2b') return '/b2b/support';
      if (role === 'vendor') return 'support';
      return '/user/support';
    },
    dedupe: (d, role, id) => `support_ticket:${d.ticketId}:${d.status || 'upd'}:${role}:${id}`
  },
  system_announcement: {
    recipients: ['broadcast'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => d.title || 'System announcement',
    message: (d) => d.message || '',
    actionUrl: (d) => d.actionUrl || null,
    dedupe: (d, role, id) => `system_announcement:${d.announcementId || d.dedupeSeed}:${role}:${id}`
  },
  opportunity_new: {
    recipients: ['vendor'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'leads',
    emailTemplate: 'vendor_opportunity',
    fallbackOnPushFail: true,
    title: (d) => d.title || 'New opportunity',
    message: (d) => d.message || 'A new lead is available in Business Intake.',
    actionUrl: () => 'business-intake',
    dedupe: (d, role, id) => `opportunity_new:${d.opportunityId}:${id}`
  }
};

function getEventDef(eventKey) {
  return EVENT_CATALOG[eventKey] || null;
}

function listEventKeys() {
  return Object.keys(EVENT_CATALOG);
}

module.exports = {
  EVENT_CATALOG,
  PRIORITY,
  getEventDef,
  listEventKeys
};
