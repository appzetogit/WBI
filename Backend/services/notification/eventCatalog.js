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
 * @property {(data: object, role: string) => object} [email] - email presentation (badge, tone, rows, ctaLabel, ...)
 * @property {RecipientRole[]} [emailRoles] - only these recipients get the email channel
 * @property {'company'} [emailScope] - B2B: one email to the company contact instead of every member
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
    dedupe: (d, role, id) => `vendor_registered:${d.vendorId || d.entityId}:${id}`,
    email: (d) => ({
      badge: 'New registration',
      tone: 'info',
      rows: [['Business', d.businessName], ['Contact', d.name], ['Mobile', d.phone], ['Email', d.email]],
      ctaLabel: 'Review vendor'
    })
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
    actionUrl: () => '/admin/b2b-companies',
    dedupe: (d, role, id) => `b2b_registered:${d.companyId || d.entityId}:${id}`,
    email: (d) => ({
      badge: 'New registration',
      tone: 'info',
      rows: [['Company', d.companyName], ['GSTIN', d.gstNumber], ['Contact', d.contactName], ['Mobile', d.phone], ['Email', d.email]],
      ctaLabel: 'Review company'
    })
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
    dedupe: (d, role, id) => `vendor_approved:${id}`,
    email: (d) => ({
      subject: 'Your vendor account is approved',
      badge: 'Approved',
      tone: 'success',
      greeting: d.name ? `Hi ${d.name},` : undefined,
      paragraphs: ['Congratulations — your vendor registration has been approved. You can now sign in, set up your services and team, and start receiving jobs.'],
      rows: [['Business', d.businessName], ['Company code', d.companyCode]],
      note: d.companyCode ? 'Share your company code with your engineers so they can join your team.' : undefined,
      ctaLabel: 'Go to dashboard'
    })
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
    dedupe: (d, role, id) => `vendor_rejected:${id}`,
    email: (d) => ({
      subject: 'Update on your vendor application',
      badge: 'Not approved',
      tone: 'danger',
      greeting: d.name ? `Hi ${d.name},` : undefined,
      paragraphs: ['We reviewed your vendor registration and could not approve it at this time.'],
      rows: [['Reason', d.reason || 'Not specified']],
      note: 'You can correct the details mentioned above and contact support to request another review.',
      ctaLabel: 'View application'
    })
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
    dedupe: (d, role, id) => `engineer_approved:${id}`,
    email: (d) => ({
      subject: 'Your engineer account is approved',
      badge: 'Approved',
      tone: 'success',
      greeting: d.name ? `Hi ${d.name},` : undefined,
      ctaLabel: 'Open engineer app'
    })
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
    channels: ['in_app', 'push', 'email'],
    emailRoles: ['engineer'],
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
    channels: ['in_app', 'push', 'email'],
    emailScope: 'company',
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

/**
 * B2B operational lifecycle events.
 *
 * These are the events the B2B ecosystem announces, from upload to payout.
 * Keys are upper-case to match the operational spec; everything else in the
 * catalog keeps its existing lower-case key.
 */
const jobLink = (d, role) => {
  const id = d.jobId || d.entityId;
  if (!id) return null;
  if (role === 'admin') return `/admin/jobs/${id}`;
  if (role === 'vendor') return `/vendor/jobs?job=${id}`;
  if (role === 'engineer') return `/b2b-jobs/${id}`;
  return `/b2b/jobs?job=${id}`;
};

const jobDedupe = (key) => (d, role, id) => `${key}:${d.jobId || d.entityId}:${role}:${id}`;

const B2B_LIFECYCLE_EVENTS = {
  B2B_UPLOAD_COMPLETED: {
    emailScope: 'company',
    recipients: ['b2b'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'bulk_upload',
    title: () => 'Bulk upload processed',
    message: (d) => d.message || `${d.createdJobs || 0} job(s) created from ${d.fileName || 'your upload'}.`,
    actionUrl: () => '/b2b/bulk-jobs',
    dedupe: jobDedupe('b2b_upload_completed'),
    email: (d) => ({
      subject: `Bulk upload processed — ${d.createdJobs || 0} job(s) created`,
      badge: 'Bulk upload',
      tone: d.failedJobs ? 'warning' : 'success',
      rows: [
        ['Batch', d.batchCode],
        ['File', d.fileName],
        ['Jobs created', d.createdJobs],
        ['Rows not created', d.failedJobs || undefined],
        ['Total rows', d.totalRows]
      ],
      note: d.failedJobs ? 'Download the error report from the Bulk Jobs page to fix and re-upload the rows that failed.' : undefined,
      ctaLabel: 'View bulk jobs'
    })
  },
  B2B_VALIDATION_FAILED: {
    emailScope: 'company',
    recipients: ['b2b'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'bulk_upload',
    title: () => 'Upload needs attention',
    message: (d) => d.message || `${d.invalidRows || 0} row(s) could not be accepted. Download the error report.`,
    actionUrl: () => '/b2b/bulk-jobs',
    dedupe: jobDedupe('b2b_validation_failed'),
    email: (d) => ({
      subject: d.invalidRows ? `Bulk upload needs attention — ${d.invalidRows} row(s) rejected` : 'Bulk upload could not be processed',
      badge: 'Needs attention',
      tone: 'danger',
      rows: [
        ['Batch', d.batchCode],
        ['File', d.fileName],
        ['Valid rows', d.validRows],
        ['Rejected rows', d.invalidRows || undefined],
        ['Reason', d.reason]
      ],
      note: 'Download the error report from the Bulk Jobs page, correct the highlighted rows and upload again.',
      ctaLabel: 'Open bulk jobs'
    })
  },
  PAYMENT_SUCCESS: {
    emailScope: 'company',
    recipients: ['b2b'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'payment',
    title: () => 'Payment received',
    message: (d) => d.message || `₹${Number(d.amount || 0).toLocaleString('en-IN')} credited to your wallet.`,
    actionUrl: () => '/b2b/wallet',
    dedupe: (d, role, id) => `payment_success:${d.transactionId || d.entityId}:${id}`,
    email: (d) => ({
      subject: `Payment received — ₹${Number(d.amount || 0).toLocaleString('en-IN')} added to your wallet`,
      badge: d.simulated ? 'Test payment' : 'Payment received',
      tone: 'success',
      rowsTitle: 'Receipt',
      rows: [
        ['Amount', `₹${Number(d.amount || 0).toLocaleString('en-IN')}`],
        ['Wallet balance', d.balance !== undefined ? `₹${Number(d.balance).toLocaleString('en-IN')}` : undefined],
        ['Payment ID', d.paymentId],
        ['Transaction', d.transactionId],
        ['Date', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })]
      ],
      note: d.simulated ? 'This was a test-mode payment; no real money was charged.' : undefined,
      ctaLabel: 'View wallet'
    })
  },
  PAYMENT_FAILED: {
    emailScope: 'company',
    recipients: ['b2b'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'payment',
    title: () => 'Payment failed',
    message: (d) => d.message || 'A wallet payment could not be completed.',
    actionUrl: () => '/b2b/wallet',
    dedupe: (d, role, id) => `payment_failed:${d.transactionId || d.entityId}:${id}`,
    email: (d) => ({
      badge: 'Payment failed',
      tone: 'danger',
      rows: [
        ['Amount', `₹${Number(d.amount || 0).toLocaleString('en-IN')}`],
        ['Payment ID', d.paymentId],
        ['Transaction', d.transactionId]
      ],
      ctaLabel: 'Try again'
    })
  },
  JOB_CREATED: {
    recipients: ['b2b'],
    channels: ['in_app'],
    priority: PRIORITY.LOW,
    category: 'job',
    title: () => 'Job created',
    message: (d) => d.message || `${d.jobCode || 'A job'} has been created.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('job_created')
  },
  JOB_ROUTED: {
    recipients: ['b2b'],
    channels: ['in_app'],
    priority: PRIORITY.LOW,
    category: 'job',
    title: () => 'Job being routed',
    message: (d) => d.message || `${d.jobCode || 'A job'} is being matched to a provider.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('job_routed')
  },
  VENDOR_ASSIGNED: {
    recipients: ['b2b', 'vendor'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'job',
    title: () => 'Vendor assigned',
    message: (d) => d.message || `${d.vendorName || 'A vendor'} accepted ${d.jobCode || 'the job'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('vendor_assigned')
  },
  ENGINEER_ASSIGNED: {
    recipients: ['b2b', 'engineer', 'vendor'],
    channels: ['in_app', 'push', 'email'],
    emailRoles: ['engineer'],
    priority: PRIORITY.HIGH,
    category: 'job',
    title: () => 'Engineer assigned',
    message: (d) => d.message || `${d.engineerName || 'An engineer'} is assigned to ${d.jobCode || 'the job'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('engineer_assigned')
  },
  FREELANCER_REQUEST: {
    recipients: ['engineer'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.HIGH,
    category: 'job',
    title: () => 'New job request',
    message: (d) => d.message
      || `${d.service || 'A job'} in ${d.city || 'your area'} — ₹${Number(d.earnings || 0).toLocaleString('en-IN')}. Respond before it expires.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('freelancer_request')
  },
  REQUEST_EXPIRED: {
    recipients: ['b2b', 'engineer', 'vendor'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'job',
    title: () => 'Request expired',
    message: (d) => d.message || `No response on ${d.jobCode || 'a job'} in time — it went back to the queue.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('request_expired')
  },
  ENGINEER_ACCEPTED: {
    recipients: ['b2b', 'vendor'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.MEDIUM,
    category: 'job',
    title: () => 'Engineer accepted',
    message: (d) => d.message || `${d.engineerName || 'The engineer'} accepted ${d.jobCode || 'the job'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('engineer_accepted')
  },
  ENGINEER_REJECTED: {
    recipients: ['b2b', 'vendor'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.HIGH,
    category: 'job',
    title: () => 'Engineer declined',
    message: (d) => d.message || `${d.engineerName || 'The engineer'} declined ${d.jobCode || 'the job'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('engineer_rejected')
  },
  EN_ROUTE: {
    recipients: ['b2b'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.LOW,
    category: 'job',
    title: () => 'Engineer on the way',
    message: (d) => d.message || `${d.engineerName || 'The engineer'} is travelling to ${d.jobCode || 'the site'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('en_route')
  },
  ARRIVED: {
    recipients: ['b2b'],
    channels: ['in_app', 'push'],
    priority: PRIORITY.LOW,
    category: 'job',
    title: () => 'Engineer arrived',
    message: (d) => d.message || `${d.engineerName || 'The engineer'} reached the site for ${d.jobCode || 'the job'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('arrived')
  },
  WORK_STARTED: {
    recipients: ['b2b'],
    channels: ['in_app'],
    priority: PRIORITY.LOW,
    category: 'job',
    title: () => 'Work started',
    message: (d) => d.message || `Work has started on ${d.jobCode || 'the job'}.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('work_started')
  },
  WORK_COMPLETED: {
    emailScope: 'company',
    recipients: ['b2b'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'job',
    title: () => 'Work completed',
    message: (d) => d.message || `${d.jobCode || 'A job'} is complete and awaiting verification.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('work_completed')
  },
  JOB_CLOSED: {
    emailScope: 'company',
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.LOW,
    category: 'job',
    title: () => 'Job closed',
    message: (d) => d.message || `${d.jobCode || 'A job'} has been verified and closed.`,
    actionUrl: jobLink,
    dedupe: jobDedupe('job_closed')
  },
  SLA_BREACH: {
    emailScope: 'company',
    recipients: ['b2b', 'admin', 'vendor'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'sla',
    title: () => 'SLA breached',
    message: (d) => d.message
      || `${d.jobCode || 'A job'} missed its ${d.metric || 'SLA'} target by ${d.delayMinutes || 0} minute(s).`,
    actionUrl: jobLink,
    dedupe: (d, role, id) => `sla_breach:${d.jobId || d.entityId}:${d.metric}:${role}:${id}`
  },
  SETTLEMENT_CREATED: {
    recipients: ['vendor', 'engineer'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'payment',
    title: () => 'Settlement created',
    message: (d) => d.message
      || `A settlement of ₹${Number(d.amount || 0).toLocaleString('en-IN')} has been raised.`,
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/finance/settlements' : '/earnings'),
    dedupe: (d, role, id) => `settlement_created:${d.settlementId || d.entityId}:${role}:${id}`
  },
  PAYOUT_COMPLETED: {
    recipients: ['vendor', 'engineer'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'payment',
    title: () => 'Payout completed',
    message: (d) => d.message
      || `₹${Number(d.amount || 0).toLocaleString('en-IN')} has been paid out.`,
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/finance/settlements' : '/earnings'),
    dedupe: (d, role, id) => `payout_completed:${d.payoutId || d.entityId}:${role}:${id}`
  }
};

Object.assign(EVENT_CATALOG, B2B_LIFECYCLE_EVENTS);
Object.assign(EVENT_CATALOG, require('./accountEvents').ACCOUNT_EVENTS);

function getEventDef(eventKey) {
  return EVENT_CATALOG[eventKey] || null;
}

function listEventKeys() {
  return Object.keys(EVENT_CATALOG);
}

module.exports = {
  EVENT_CATALOG,
  B2B_LIFECYCLE_EVENTS,
  PRIORITY,
  getEventDef,
  listEventKeys
};
