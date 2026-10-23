/**
 * Account lifecycle events for every panel: registration, verification,
 * approval, status changes, security changes and team membership.
 *
 * Merged into EVENT_CATALOG. Each `email(d, role)` returns the presentation
 * for the email channel (see sendTemplatedNotification); title/message are
 * the in-app/push text and the fallback email body.
 *
 * Several events are email-only because the flow that raises them already
 * writes its own in-app notification.
 */

const { brandName } = require('../mail/mailer');

const PRIORITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

const ROLE_NAME = {
  user: 'customer',
  vendor: 'vendor',
  engineer: 'engineer',
  worker: 'service partner',
  b2b: 'business',
  admin: 'admin'
};

const DASHBOARD = {
  user: '/user/home',
  vendor: '/vendor/dashboard',
  engineer: '/engineer/dashboard',
  worker: '/worker/dashboard',
  b2b: '/b2b/dashboard',
  admin: '/admin/dashboard'
};

const LOGIN = {
  user: '/user/login',
  vendor: '/vendor/login',
  engineer: '/engineer/login',
  worker: '/worker/login',
  b2b: '/b2b/login',
  admin: '/admin/login'
};

const PROFILE = {
  user: '/user/update-profile',
  vendor: '/vendor/profile',
  engineer: '/engineer/profile',
  worker: '/worker/profile',
  b2b: '/b2b/company-profile',
  admin: '/admin/dashboard'
};

const ADMIN_LIST = {
  vendor: '/admin/vendors',
  engineer: '/admin/engineers',
  worker: '/admin/workers',
  user: '/admin/users',
  b2b: '/admin/b2b-companies'
};

const hi = (d) => (d.name ? `Hi ${d.name},` : 'Hello,');
const when = (v) => {
  const date = v ? new Date(v) : new Date();
  return `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v || '');
/** 10-minute bucket so a burst of saves sends one email. */
const bucket = () => Math.floor(Date.now() / (10 * 60 * 1000));

const SECURITY_NOTE =
  'If you did not make this change, reset your password immediately and contact support.';

const WELCOME_COPY = {
  user: {
    heading: 'Welcome aboard!',
    body: 'Your account is ready. Book verified professionals, track jobs live and pay securely.',
    cta: 'Book a service'
  },
  vendor: {
    heading: 'Your vendor registration is received',
    body: 'Thank you for registering as a vendor partner. Our team is verifying your documents — we will email you as soon as your account is reviewed.',
    cta: 'Check application status'
  },
  engineer: {
    heading: 'Your engineer registration is received',
    body: 'Thank you for registering. Your documents are under review; you will start receiving jobs once your account is approved.',
    cta: 'Open engineer app'
  },
  vendor_engineer: {
    heading: 'Your engineer registration is received',
    body: 'Your request to join your company has been sent to your vendor for approval. WBI will also verify your documents before you can receive jobs.',
    cta: 'Open engineer app'
  },
  worker: {
    heading: 'Your registration is received',
    body: 'Thank you for registering as a service partner. We are verifying your documents and will let you know once your account is approved.',
    cta: 'Open partner app'
  },
  b2b: {
    heading: 'Your business registration is received',
    body: 'Thank you for registering your company. Our team will verify your GST, documents and details; we will email you as soon as the account is approved.',
    cta: 'Continue onboarding'
  }
};

const STATUS_COPY = {
  suspended: { title: 'Account suspended', tone: 'danger', body: 'Your account has been suspended. You cannot receive or take new work until it is reinstated.' },
  deactivated: { title: 'Account deactivated', tone: 'warning', body: 'Your account has been deactivated.' },
  reactivated: { title: 'Account reactivated', tone: 'success', body: 'Your account is active again. You can sign in and continue as usual.' },
  activated: { title: 'Account activated', tone: 'success', body: 'Your account is now active. You can sign in and continue as usual.' },
  deleted: { title: 'Account deleted', tone: 'neutral', body: 'Your account has been deleted from the platform.' },
  rejected: { title: 'Account rejected', tone: 'danger', body: 'Your account could not be approved.' },
  pending: { title: 'Account under review', tone: 'info', body: 'Your account has been moved back to review.' },
  blocked: { title: 'Account blocked', tone: 'danger', body: 'Your access has been blocked by an administrator.' }
};

/** @type {Record<string, import('./eventCatalog').EventDef>} */
const ACCOUNT_EVENTS = {
  /* ---------------------------------------------------------------- */
  /* Registration                                                     */
  /* ---------------------------------------------------------------- */

  account_welcome: {
    recipients: ['user', 'vendor', 'engineer', 'worker', 'b2b'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => (WELCOME_COPY[d.variant] || WELCOME_COPY.user).heading,
    message: (d) => (WELCOME_COPY[d.variant] || WELCOME_COPY.user).body,
    actionUrl: (d, role) => DASHBOARD[role],
    dedupe: (d, role, id) => `account_welcome:${role}:${id}`,
    email: (d, role) => {
      const copy = WELCOME_COPY[d.variant] || WELCOME_COPY[role] || WELCOME_COPY.user;
      return {
        subject: `Welcome to ${brandName()} — ${copy.heading.toLowerCase()}`,
        badge: 'Welcome',
        tone: 'success',
        heading: copy.heading,
        greeting: hi(d),
        paragraphs: [copy.body],
        rows: [
          ['Account type', d.accountLabel || ROLE_NAME[role]],
          ['Company', d.companyName],
          ['Registered email', d.email],
          ['Mobile', d.phone],
          ['Linked vendor', d.vendorName],
          ['Status', d.statusLabel || 'Pending verification']
        ],
        ctaLabel: copy.cta
      };
    }
  },

  engineer_registered: {
    recipients: ['admin'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'New engineer registration',
    message: (d) => `${d.name || 'An engineer'} (${d.engineerType === 'vendor_engineer' ? 'vendor engineer' : 'freelancer'}) registered and is awaiting verification.`,
    actionUrl: () => ADMIN_LIST.engineer,
    dedupe: (d, role, id) => `engineer_registered:${d.engineerId}:${id}`,
    email: (d) => ({
      badge: 'New registration',
      tone: 'info',
      rows: [
        ['Name', d.name],
        ['Type', d.engineerType === 'vendor_engineer' ? 'Vendor engineer' : 'Freelancer'],
        ['Vendor', d.vendorName],
        ['Mobile', d.phone],
        ['Email', d.email],
        ['City', d.city],
        ['Joining fee', d.joiningFeePaid ? inr(d.joiningFeeAmount) : undefined]
      ],
      ctaLabel: 'Review engineer'
    })
  },

  worker_registered: {
    recipients: ['admin'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: () => 'New service partner registration',
    message: (d) => `${d.name || 'A service partner'} registered and is awaiting approval.`,
    actionUrl: () => ADMIN_LIST.worker,
    dedupe: (d, role, id) => `worker_registered:${d.workerId}:${id}`,
    email: (d) => ({
      badge: 'New registration',
      rows: [['Name', d.name], ['Mobile', d.phone], ['Email', d.email], ['City', d.city]],
      ctaLabel: 'Review partner'
    })
  },

  engineer_join_request: {
    recipients: ['vendor'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'New engineer join request',
    message: (d) => `${d.name || 'An engineer'} wants to join your team using company code ${d.code || ''}.`,
    actionUrl: () => '/vendor/engineers',
    dedupe: (d, role, id) => `engineer_join_request:${d.engineerId}:${id}`,
    email: (d) => ({
      badge: 'Team',
      tone: 'info',
      paragraphs: [
        `${d.name || 'An engineer'} registered with your company code and is waiting for your approval.`,
        'Approve the request to add them to your team. WBI verifies their documents separately before they can receive jobs.'
      ],
      rows: [['Engineer', d.name], ['Mobile', d.phone], ['Email', d.email], ['Company code', d.code]],
      ctaLabel: 'Review join request'
    })
  },

  engineer_added_by_vendor: {
    recipients: ['engineer'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => `${d.vendorName || 'Your vendor'} added you to their team`,
    message: (d) => `${d.vendorName || 'Your vendor'} created your engineer account on WBI. Sign in with your mobile number ${d.phone || ''}.`,
    actionUrl: () => LOGIN.engineer,
    dedupe: (d, role, id) => `engineer_added_by_vendor:${id}`,
    email: (d) => ({
      badge: 'Welcome',
      tone: 'success',
      greeting: hi(d),
      paragraphs: [
        `${d.vendorName || 'Your vendor'} has added you as an engineer on WBI.`,
        'Sign in to the engineer app with your mobile number and complete your profile and documents. You will receive jobs once WBI verifies them.'
      ],
      rows: [['Company', d.vendorName], ['Login mobile', d.phone], ['Skills', list(d.skills)], ['Base city', d.city]],
      ctaLabel: 'Sign in'
    })
  },

  /* ---------------------------------------------------------------- */
  /* Verification and approval                                        */
  /* ---------------------------------------------------------------- */

  vendor_application_submitted: {
    recipients: ['vendor', 'admin'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => 'Vendor application submitted',
    message: (d) => `${d.businessName || 'Vendor'} submitted the onboarding application for review.`,
    actionUrl: (d, role) => (role === 'admin' ? ADMIN_LIST.vendor : '/vendor/pending-approval'),
    dedupe: (d, role, id) => `vendor_application_submitted:${d.vendorId}:${d.submittedAt || ''}:${role}:${id}`,
    email: (d, role) => (role === 'admin'
      ? {
        badge: 'Review required',
        tone: 'warning',
        heading: 'Vendor application waiting for review',
        rows: [['Business', d.businessName], ['Contact', d.name], ['Mobile', d.phone], ['Email', d.email], ['Services', list(d.services)]],
        ctaLabel: 'Review application'
      }
      : {
        subject: 'We received your vendor application',
        badge: 'Application received',
        tone: 'info',
        heading: 'Your application is under review',
        greeting: hi(d),
        paragraphs: ['Thank you for completing your onboarding. Our verification team is reviewing your documents and details. This usually takes 1–2 business days; we will email you the outcome.'],
        rows: [['Business', d.businessName], ['Submitted', when(d.submittedAt)]],
        ctaLabel: 'Track status'
      })
  },

  engineer_rejected: {
    recipients: ['engineer'],
    channels: ['in_app', 'push', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'Engineer registration not approved',
    message: (d) => d.reason ? `Your registration was not approved: ${d.reason}` : 'Your registration was not approved. Please contact support.',
    actionUrl: () => PROFILE.engineer,
    dedupe: (d, role, id) => `engineer_rejected:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Not approved',
      tone: 'danger',
      greeting: hi(d),
      paragraphs: ['We reviewed your engineer registration and could not approve it at this time.'],
      rows: [['Reason', d.reason || 'Not specified']],
      note: 'You can update your details and documents in the app and contact support to request another review.',
      ctaLabel: 'Update my profile'
    })
  },

  worker_approval_updated: {
    recipients: ['worker'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => (d.approved ? 'Your account is approved' : 'Registration not approved'),
    message: (d) => (d.approved
      ? 'Your service partner account is approved. You can now go online and accept jobs.'
      : `Your registration was not approved${d.reason ? `: ${d.reason}` : '.'}`),
    actionUrl: () => DASHBOARD.worker,
    dedupe: (d, role, id) => `worker_approval:${id}:${d.approved ? 'ok' : 'no'}:${bucket()}`,
    email: (d) => ({
      badge: d.approved ? 'Approved' : 'Not approved',
      tone: d.approved ? 'success' : 'danger',
      greeting: hi(d),
      rows: d.approved ? [] : [['Reason', d.reason || 'Not specified']],
      ctaLabel: d.approved ? 'Go online' : 'Open app'
    })
  },

  verification_status_updated: {
    recipients: ['vendor', 'engineer', 'worker'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => `${d.subject || 'Verification'} ${d.status === 'verified' ? 'verified' : d.status === 'rejected' ? 'rejected' : 'updated'}`,
    message: (d) => (d.status === 'verified'
      ? `Your ${d.subject || 'details'} have been verified.`
      : d.status === 'rejected'
        ? `Your ${d.subject || 'details'} were rejected${d.reason ? `: ${d.reason}` : ''}. Please update and resubmit.`
        : `Your ${d.subject || 'details'} status is now ${d.status}.`),
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/documents' : PROFILE[role]),
    dedupe: (d, role, id) => `verification_status:${d.subject}:${d.status}:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Verification',
      tone: d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'danger' : 'info',
      greeting: hi(d),
      rows: [['Item', d.subject], ['Status', d.status], ['Reason', d.status === 'rejected' ? d.reason : undefined]],
      ctaLabel: d.status === 'rejected' ? 'Update and resubmit' : 'View details'
    })
  },

  account_status_changed: {
    recipients: ['vendor', 'engineer', 'worker', 'user', 'b2b'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => (STATUS_COPY[d.status] || { title: 'Account status updated' }).title,
    message: (d) => `${(STATUS_COPY[d.status] || { body: `Your account status is now ${d.status}.` }).body}${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d, role) => (['deleted', 'suspended', 'deactivated', 'blocked'].includes(d.status) ? null : DASHBOARD[role]),
    dedupe: (d, role, id) => `account_status:${d.status}:${role}:${id}:${bucket()}`,
    email: (d) => {
      const copy = STATUS_COPY[d.status] || { tone: 'info' };
      return {
        badge: 'Account',
        tone: copy.tone,
        greeting: hi(d),
        rows: [
          ['Account', d.accountLabel],
          ['New status', d.status],
          ['Reason', d.reason],
          ['Changed by', d.changedBy],
          ['Date', when()]
        ],
        note: ['deleted', 'suspended', 'deactivated', 'blocked', 'rejected'].includes(d.status)
          ? 'If you believe this is a mistake, please contact support.'
          : undefined,
        ctaLabel: 'Sign in'
      };
    }
  },

  /* ---------------------------------------------------------------- */
  /* Security and profile changes                                     */
  /* ---------------------------------------------------------------- */

  password_changed: {
    recipients: ['user', 'vendor', 'engineer', 'worker', 'b2b', 'admin'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'Your password was changed',
    message: (d) => `The password for your account was ${d.method === 'reset' ? 'reset' : 'changed'} on ${when(d.at)}.`,
    actionUrl: (d, role) => LOGIN[role],
    dedupe: (d, role, id) => `password_changed:${role}:${id}:${d.at || bucket()}`,
    email: (d) => ({
      badge: 'Security alert',
      tone: 'warning',
      greeting: hi(d),
      rows: [
        ['Action', d.method === 'reset' ? 'Password reset' : 'Password changed'],
        ['When', when(d.at)],
        ['IP address', d.ip],
        ['Device', d.device],
        ['Other sessions', d.sessionsRevoked ? 'Signed out' : undefined]
      ],
      note: SECURITY_NOTE,
      ctaLabel: 'Sign in'
    })
  },

  profile_updated: {
    recipients: ['user', 'vendor', 'engineer', 'worker', 'b2b'],
    channels: ['email'],
    priority: PRIORITY.LOW,
    category: 'account',
    title: () => 'Your profile was updated',
    message: (d) => `These details on your account were changed: ${list(d.changes) || 'profile information'}.`,
    actionUrl: (d, role) => PROFILE[role],
    dedupe: (d, role, id) => `profile_updated:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Account update',
      tone: 'info',
      greeting: hi(d),
      rows: [['Changed', list(d.changes)], ['Changed by', d.changedBy], ['When', when()]],
      note: SECURITY_NOTE,
      ctaLabel: 'Review my profile'
    })
  },

  bank_details_updated: {
    recipients: ['vendor', 'engineer', 'worker', 'b2b'],
    channels: ['email', 'in_app'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'Bank account details changed',
    message: (d) => `The payout bank account on your profile was updated${d.accountMasked ? ` to ${d.accountMasked}` : ''}.`,
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/finance' : role === 'b2b' ? '/b2b/company-profile' : `${PROFILE[role]}/bank-details`),
    dedupe: (d, role, id) => `bank_details_updated:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Security alert',
      tone: 'warning',
      greeting: hi(d),
      paragraphs: ['The bank account used for your payouts was changed. Future payouts will go to this account once it is verified.'],
      rows: [['Account holder', d.holderName], ['Bank', d.bankName], ['Account', d.accountMasked], ['IFSC', d.ifsc], ['When', when()]],
      note: SECURITY_NOTE,
      ctaLabel: 'Review bank details'
    })
  },

  /* ---------------------------------------------------------------- */
  /* Vendor ↔ engineer team                                           */
  /* ---------------------------------------------------------------- */

  engineer_team_update: {
    recipients: ['engineer'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => d.title || 'Team update',
    message: (d) => d.message || 'Your vendor updated your team membership.',
    actionUrl: () => DASHBOARD.engineer,
    dedupe: (d, role, id) => `engineer_team_update:${d.type}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Team',
      tone: /approved|reactivated/.test(d.type || '') ? 'success' : 'warning',
      greeting: hi(d),
      rows: [['Company', d.vendorName], ['Reason', d.reason]],
      ctaLabel: 'Open engineer app'
    })
  },

  /* ---------------------------------------------------------------- */
  /* B2B company                                                      */
  /* ---------------------------------------------------------------- */

  b2b_company_reviewed: {
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    emailScope: 'company',
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => (d.approved ? 'Your company account is approved' : 'Company registration needs changes'),
    message: (d) => (d.approved
      ? `${d.companyName || 'Your company'} is verified. You can now create jobs and manage your workspace.`
      : `${d.companyName || 'Your company'} could not be approved: ${d.reason || 'see details'}.`),
    actionUrl: (d) => (d.approved ? DASHBOARD.b2b : '/b2b/company-profile'),
    dedupe: (d, role, id) => `b2b_company_reviewed:${d.companyId}:${d.approved ? 'ok' : 'no'}:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: d.approved ? 'Approved' : 'Action required',
      tone: d.approved ? 'success' : 'danger',
      rows: [
        ['Company', d.companyName],
        ['GSTIN', d.gstNumber],
        ['Reason', d.approved ? undefined : d.reason],
        ['Documents to re-upload', d.approved ? undefined : list(d.rejectedDocuments)]
      ],
      ctaLabel: d.approved ? 'Go to dashboard' : 'Fix and resubmit'
    })
  },

  b2b_company_status_changed: {
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    emailScope: 'company',
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => `Company account ${String(d.status || '').toLowerCase()}`,
    message: (d) => `${d.companyName || 'Your company'} account status is now ${d.status}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: () => DASHBOARD.b2b,
    dedupe: (d, role, id) => `b2b_company_status:${d.companyId}:${d.status}:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Account',
      tone: ['ACTIVE', 'APPROVED'].includes(d.status) ? 'success' : ['SUSPENDED', 'REJECTED', 'INACTIVE'].includes(d.status) ? 'danger' : 'info',
      rows: [['Company', d.companyName], ['Previous status', d.previousStatus], ['New status', d.status], ['Reason', d.reason], ['Date', when()]],
      note: ['SUSPENDED', 'REJECTED', 'INACTIVE'].includes(d.status) ? 'Contact support if you believe this is a mistake.' : undefined,
      ctaLabel: 'Open workspace'
    })
  },

  b2b_verification_updated: {
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    emailScope: 'company',
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => `${d.subject || 'Document'} ${d.status}`,
    message: (d) => (d.status === 'rejected'
      ? `${d.subject || 'A document'} was rejected${d.reason ? `: ${d.reason}` : ''}. Please re-upload it.`
      : `${d.subject || 'A document'} has been ${d.status}.`),
    actionUrl: () => '/b2b/company-profile',
    dedupe: (d, role, id) => `b2b_verification:${d.companyId}:${d.subject}:${d.status}:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Verification',
      tone: d.status === 'rejected' ? 'danger' : 'success',
      rows: [['Company', d.companyName], ['Item', d.subject], ['Status', d.status], ['Reason', d.reason]],
      ctaLabel: d.status === 'rejected' ? 'Re-upload document' : 'View company profile'
    })
  },

  b2b_onboarding_submitted: {
    recipients: ['b2b', 'admin'],
    channels: ['in_app', 'email'],
    emailScope: 'company',
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'Enterprise onboarding submitted',
    message: (d) => `${d.companyName || 'A company'} submitted enterprise onboarding for review.`,
    actionUrl: (d, role) => (role === 'admin' ? '/admin/b2b' : '/b2b/onboarding'),
    dedupe: (d, role, id) => `b2b_onboarding_submitted:${d.companyId}:${d.submittedAt || ''}:${role}:${id}`,
    email: (d, role) => (role === 'admin'
      ? { badge: 'Review required', tone: 'warning', rows: [['Company', d.companyName], ['Submitted', when(d.submittedAt)]], ctaLabel: 'Review onboarding' }
      : {
        subject: 'We received your onboarding submission',
        badge: 'Submitted',
        tone: 'info',
        heading: 'Your onboarding is under review',
        paragraphs: ['Thank you for completing enterprise onboarding. Our team will verify your details and get back to you shortly.'],
        rows: [['Company', d.companyName], ['Submitted', when(d.submittedAt)]],
        ctaLabel: 'View onboarding'
      })
  },

  b2b_onboarding_reviewed: {
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    emailScope: 'company',
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => `Onboarding ${d.decisionLabel || 'updated'}`,
    message: (d) => `Your enterprise onboarding was ${d.decisionLabel || 'updated'}.${d.remarks ? ` ${d.remarks}` : ''}`,
    actionUrl: () => '/b2b/onboarding',
    dedupe: (d, role, id) => `b2b_onboarding_reviewed:${d.companyId}:${d.action}:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Onboarding',
      tone: /approv|activ/i.test(d.action || '') ? 'success' : /reject/i.test(d.action || '') ? 'danger' : 'warning',
      rows: [['Company', d.companyName], ['Decision', d.decisionLabel], ['Remarks', d.remarks]],
      ctaLabel: 'Open onboarding'
    })
  },

  b2b_member_updated: {
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => d.title || 'Your workspace access changed',
    message: (d) => d.message || 'An administrator updated your access.',
    actionUrl: (d) => (d.status === 'removed' || d.status === 'inactive' ? null : DASHBOARD.b2b),
    dedupe: (d, role, id) => `b2b_member_updated:${d.change}:${role}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Workspace access',
      tone: d.status === 'removed' || d.status === 'inactive' || d.status === 'blocked' ? 'warning' : 'info',
      greeting: hi(d),
      rows: [['Company', d.companyName], ['Role', d.role], ['Status', d.status], ['Changed by', d.changedBy], ['When', when()]],
      note: 'Contact your company administrator if you have questions about this change.',
      ctaLabel: 'Open workspace'
    })
  },

  b2b_member_joined: {
    recipients: ['b2b'],
    channels: ['in_app', 'email'],
    priority: PRIORITY.LOW,
    category: 'account',
    title: () => 'Invitation accepted',
    message: (d) => `${d.memberName || 'A team member'} accepted the invitation and joined as ${d.role || 'a member'}.`,
    actionUrl: () => '/b2b/users',
    dedupe: (d, role, id) => `b2b_member_joined:${d.memberId}:${id}`,
    email: (d) => ({
      badge: 'Team',
      tone: 'success',
      rows: [['Member', d.memberName], ['Email', d.memberEmail], ['Role', d.role]],
      ctaLabel: 'Manage users'
    })
  },

  /* ---------------------------------------------------------------- */
  /* Payments tied to accounts                                        */
  /* ---------------------------------------------------------------- */

  joining_fee_paid: {
    recipients: ['engineer'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'payments',
    title: () => 'Joining fee payment received',
    message: (d) => `We received your joining fee of ${inr(d.amount)}. Continue your registration to submit your profile.`,
    actionUrl: () => '/engineer/signup',
    dedupe: (d, role, id) => `joining_fee_paid:${d.paymentId || d.orderId}:${id}`,
    email: (d) => ({
      subject: `Payment receipt — joining fee ${inr(d.amount)}`,
      badge: 'Payment received',
      tone: 'success',
      greeting: hi(d),
      rowsTitle: 'Receipt',
      rows: [
        ['Amount paid', inr(d.amount)],
        ['Fee', d.baseAmount ? inr(d.baseAmount) : undefined],
        ['Discount', d.discount ? inr(d.discount) : undefined],
        ['Coupon', d.couponCode],
        ['Payment ID', d.paymentId],
        ['Order ID', d.orderId],
        ['Date', when(d.paidAt)]
      ],
      ctaLabel: 'Continue registration'
    })
  },

  withdrawal_status_updated: {
    recipients: ['vendor', 'engineer', 'worker'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'payments',
    title: (d) => `Withdrawal ${d.statusLabel || d.status}`,
    message: (d) => `Your withdrawal of ${inr(d.amount)} is ${d.statusLabel || d.status}.${d.reason ? ` ${d.reason}` : ''}`,
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/wallet' : `/${role}/wallet`),
    dedupe: (d, role, id) => `withdrawal_status:${d.withdrawalId}:${d.status}:${id}`,
    email: (d) => ({
      badge: 'Payout',
      tone: d.status === 'paid' || d.status === 'completed' ? 'success' : d.status === 'rejected' || d.status === 'failed' ? 'danger' : 'info',
      greeting: hi(d),
      rows: [
        ['Amount', inr(d.amount)],
        ['Fees', d.fee ? inr(d.fee) : undefined],
        ['Net payout', d.netAmount ? inr(d.netAmount) : undefined],
        ['Status', d.statusLabel || d.status],
        ['Bank account', d.accountMasked],
        ['UTR / reference', d.utr],
        ['Reason', d.reason],
        ['Date', when()]
      ],
      ctaLabel: 'View wallet'
    })
  },

  /* ---------------------------------------------------------------- */
  /* Enquiries                                                        */
  /* ---------------------------------------------------------------- */

  enquiry_received: {
    recipients: ['user'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'enquiry',
    title: (d) => `We received your ${d.enquiryLabel || 'service'} enquiry`,
    message: () => 'Thank you for contacting us. Our team will review your request and get back to you shortly.',
    actionUrl: () => null,
    dedupe: (d, role, id) => `enquiry_received:${d.enquiryId}:${id}`,
    email: (d) => ({
      subject: `We received your ${d.enquiryLabel || 'service'} enquiry${d.reference ? ` (#${d.reference})` : ''}`,
      badge: 'Enquiry received',
      tone: 'success',
      greeting: d.name ? `Hi ${d.name},` : 'Hello,',
      paragraphs: [
        'Thank you for contacting us. Our team will review your request and get back to you shortly — usually within one business day.'
      ],
      rowsTitle: 'Your request',
      rows: [
        ['Service', d.enquiryLabel],
        ['Reference', d.reference],
        ['Company', d.companyName],
        ['City', d.city],
        ['Contact', [d.phone, d.email].filter(Boolean).join(' · ')],
        ['Submitted', when(d.submittedAt)]
      ],
      note: 'Please keep this reference handy if you contact us about this request.',
      noCta: true
    })
  },

  enquiry_submitted_admin: {
    recipients: ['admin'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'enquiry',
    title: (d) => `New ${d.enquiryLabel || 'service'} enquiry`,
    message: (d) => `${d.name || 'A visitor'} submitted a ${d.enquiryLabel || 'service'} enquiry.`,
    actionUrl: (d) => d.adminPath || '/admin/dashboard',
    dedupe: (d, role, id) => `enquiry_admin:${d.enquiryId}:${id}`,
    email: (d) => ({
      badge: 'New enquiry',
      tone: 'info',
      rows: [
        ['Service', d.enquiryLabel],
        ['Reference', d.reference],
        ['Name', d.name],
        ['Company', d.companyName],
        ['Mobile', d.phone],
        ['Email', d.email],
        ['City', d.city],
        ['Submitted', when(d.submittedAt)]
      ],
      ctaLabel: 'Open in admin'
    })
  },

  /* ---------------------------------------------------------------- */
  /* Admin accounts                                                   */
  /* ---------------------------------------------------------------- */

  admin_account_created: {
    recipients: ['admin'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: () => 'Your admin account was created',
    message: (d) => `${d.createdBy || 'A super admin'} created an admin account for you.`,
    actionUrl: () => LOGIN.admin,
    dedupe: (d, role, id) => `admin_account_created:${d.adminId}:${id}`,
    email: (d) => ({
      subject: 'Your WBI admin account is ready',
      badge: 'Admin access',
      tone: 'success',
      greeting: d.name ? `Hi ${d.name},` : undefined,
      paragraphs: [
        `${d.createdBy || 'A super admin'} created an admin account for you.`,
        'Sign in with this email address and the password your administrator shared with you, then change it from your profile.'
      ],
      rows: [['Login email', d.email], ['Role', d.roleLabel], ['City', d.cityName]],
      note: 'For your security the password is never sent by email.',
      ctaLabel: 'Sign in'
    })
  },

  admin_account_changed: {
    recipients: ['admin'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'account',
    title: (d) => (d.change === 'removed' ? 'Your admin access was removed' : 'Your admin role changed'),
    message: (d) => (d.change === 'removed'
      ? 'Your admin account has been removed.'
      : `Your admin role is now ${d.roleLabel}.`),
    actionUrl: (d) => (d.change === 'removed' ? null : LOGIN.admin),
    dedupe: (d, role, id) => `admin_account_changed:${d.change}:${d.adminId}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Admin access',
      tone: d.change === 'removed' ? 'danger' : 'info',
      greeting: d.name ? `Hi ${d.name},` : undefined,
      rows: [
        ['Change', d.change === 'removed' ? 'Account removed' : 'Role updated'],
        ['Previous role', d.previousRoleLabel],
        ['New role', d.change === 'removed' ? undefined : d.roleLabel],
        ['Changed by', d.changedBy],
        ['When', when()]
      ],
      noCta: d.change === 'removed',
      ctaLabel: 'Sign in'
    })
  },

  /* ---------------------------------------------------------------- */
  /* Vendor roster members (people without a WBI login)               */
  /* ---------------------------------------------------------------- */

  team_member_update: {
    recipients: ['vendor'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'account',
    title: (d) => d.title || 'Team update',
    message: (d) => d.message || '',
    actionUrl: () => null,
    dedupe: (d, role, id) => `team_member_update:${d.change}:${d.memberId || d.leaveId}:${id}:${bucket()}`,
    email: (d) => ({
      badge: 'Team',
      tone: d.tone || 'info',
      greeting: d.name ? `Hi ${d.name},` : undefined,
      paragraphs: [d.message].filter(Boolean),
      rows: d.rows || [['Company', d.vendorName]],
      noCta: true
    })
  },

  /* ---------------------------------------------------------------- */
  /* Bookings (customer and vendor)                                   */
  /* ---------------------------------------------------------------- */

  booking_status_update: {
    recipients: ['user'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'jobs',
    title: (d) => d.title || 'Booking update',
    message: (d) => d.message || '',
    actionUrl: (d) => `/user/booking/${d.bookingId}`,
    dedupe: (d, role, id) => `booking_status:${d.bookingId}:${d.status}:${id}`,
    email: (d) => ({
      subject: `${d.title || 'Booking update'} — #${d.bookingNumber || ''}`.trim(),
      badge: 'Booking',
      tone: d.status === 'arrived' || d.status === 'journey_started' ? 'info' : 'success',
      paragraphs: [d.message].filter(Boolean),
      rowsTitle: 'Booking details',
      rows: [
        ['Booking', d.bookingNumber ? `#${d.bookingNumber}` : undefined],
        ['Service', d.serviceName],
        ['Date', d.scheduledDate ? new Date(d.scheduledDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : undefined],
        ['Time', d.scheduledTime],
        ['Amount', d.amount ? inr(d.amount) : undefined]
      ],
      ctaLabel: 'Track booking'
    })
  },

  booking_cancelled: {
    recipients: ['user', 'vendor'],
    channels: ['email'],
    priority: PRIORITY.HIGH,
    category: 'jobs',
    title: () => 'Booking cancelled',
    message: (d) => `Booking #${d.bookingNumber || ''} has been cancelled.`,
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/bookings' : `/user/booking/${d.bookingId}`),
    dedupe: (d, role, id) => `booking_cancelled:${d.bookingId}:${role}:${id}`,
    email: (d, role) => ({
      subject: `Booking #${d.bookingNumber || ''} cancelled`,
      badge: 'Cancelled',
      tone: 'danger',
      paragraphs: [role === 'vendor'
        ? `The customer cancelled booking #${d.bookingNumber || ''}.`
        : d.cancelledBy === 'user'
          ? `Your booking #${d.bookingNumber || ''} has been cancelled as requested.`
          : `Your booking #${d.bookingNumber || ''} has been cancelled.`],
      rowsTitle: 'Booking details',
      rows: [
        ['Service', d.serviceName],
        ['Was scheduled', d.scheduledDate ? new Date(d.scheduledDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : undefined],
        ['Reason', d.reason],
        ['Refund', role === 'vendor' ? undefined : (d.refundedAmount ? inr(d.refundedAmount) : undefined)]
      ],
      note: role === 'vendor' ? undefined : (d.refundedAmount ? 'Your refund has been initiated and will reach you per your payment method.' : undefined),
      ctaLabel: role === 'vendor' ? 'Open bookings' : 'View booking'
    })
  },

  booking_rescheduled: {
    recipients: ['user', 'vendor'],
    channels: ['email'],
    priority: PRIORITY.MEDIUM,
    category: 'jobs',
    title: () => 'Booking rescheduled',
    message: (d) => `Booking #${d.bookingNumber || ''} has been rescheduled.`,
    actionUrl: (d, role) => (role === 'vendor' ? '/vendor/bookings' : `/user/booking/${d.bookingId}`),
    dedupe: (d, role, id) => `booking_rescheduled:${d.bookingId}:${d.stamp}:${role}:${id}`,
    email: (d, role) => ({
      subject: `Booking #${d.bookingNumber || ''} rescheduled`,
      badge: 'Rescheduled',
      tone: 'warning',
      rowsTitle: 'New schedule',
      rows: [
        ['Booking', d.bookingNumber ? `#${d.bookingNumber}` : undefined],
        ['Service', d.serviceName],
        ['Date', d.scheduledDate ? new Date(d.scheduledDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : undefined],
        ['Time', d.scheduledTime]
      ],
      ctaLabel: role === 'vendor' ? 'Open bookings' : 'View booking'
    })
  }
};

module.exports = { ACCOUNT_EVENTS, ROLE_NAME, DASHBOARD, PROFILE, LOGIN };
