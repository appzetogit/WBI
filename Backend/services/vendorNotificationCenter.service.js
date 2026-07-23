/**
 * Vendor Notification Center — single publisher for all vendor in-app alerts.
 * Every notification originates from a real backend event (no mocks).
 */
const crypto = require('crypto');
const Vendor = require('../models/Vendor');
const VendorGlobalNotification = require('../models/VendorGlobalNotification');
const VendorGlobalSetting = require('../models/VendorGlobalSetting');
const { getRedis, isRedisConnected } = require('./redisService');
const { sendNotificationToVendor } = require('./firebaseAdmin');
const { sendSMS } = require('./smsService');

const TYPE_TO_MODULE = {
  booking_request: 'business-intake',
  booking_created: 'business-intake',
  booking_accepted: 'business-intake',
  booking_cancelled: 'business-intake',
  booking_confirmed: 'business-intake',
  booking_completed: 'business-intake',
  client_request: 'business-intake',
  opportunity_new: 'business-intake',
  new_opportunity: 'business-intake',
  new_booking_request: 'business-intake',
  bid_accepted: 'clients-contracts',
  bid_rejected: 'clients-contracts',
  contract_update: 'clients-contracts',
  project_assigned: 'project-ops',
  engineer_assigned: 'project-ops',
  ops_engineer_assigned: 'project-ops',
  ops_job_accepted: 'project-ops',
  ops_job_rejected: 'project-ops',
  ops_job_completed: 'project-ops',
  job_engineer_accepted: 'project-ops',
  job_completed: 'project-ops',
  worker_assigned: 'workforce',
  worker_started: 'workforce',
  worker_completed: 'workforce',
  payout_requested: 'workforce',
  quality_failed: 'quality',
  rework: 'quality',
  approval_pending: 'quality',
  qa_approved: 'quality',
  qa_rejected: 'quality',
  payment_received: 'finance',
  payment_success: 'finance',
  invoice_generated: 'finance',
  withdrawal_paid: 'finance',
  withdrawal_approved: 'finance',
  withdrawal_rejected: 'finance',
  withdrawal_failed: 'finance',
  withdrawal_request: 'finance',
  escrow_released: 'finance',
  settlement_completed: 'finance',
  document_expiry: 'compliance',
  compliance_alert: 'compliance',
  document_verification: 'compliance',
  new_chat: 'support',
  support_ticket_update: 'support',
  support_ticket_created: 'support',
  support_ticket_resolved: 'support',
  vendor_approved: 'settings',
  vendor_rejected: 'settings',
  system_announcement: 'system',
  general: 'system'
};

const TYPE_TO_ACTION = {
  booking_request: 'dashboard',
  booking_created: 'dashboard',
  client_request: 'business-intake',
  opportunity_new: 'business-intake',
  payment_received: 'finance/wallet',
  payment_success: 'finance/wallet',
  invoice_generated: 'finance/invoices',
  withdrawal_paid: 'finance/wallet',
  withdrawal_approved: 'finance/wallet',
  withdrawal_rejected: 'finance/wallet',
  withdrawal_failed: 'finance/wallet',
  withdrawal_request: 'finance/wallet',
  escrow_released: 'finance/wallet',
  settlement_completed: 'finance/wallet',
  support_ticket_update: 'support',
  support_ticket_created: 'support',
  support_ticket_resolved: 'support',
  compliance_alert: 'compliance',
  document_expiry: 'compliance',
  document_verification: 'compliance',
  ops_engineer_assigned: 'project-operations',
  project_assigned: 'project-operations',
  engineer_assigned: 'workforce',
  quality_failed: 'quality-control',
  qa_approved: 'quality-control',
  qa_rejected: 'quality-control',
  vendor_approved: 'settings',
  vendor_rejected: 'settings'
};

const TYPE_CATEGORY = {
  booking_request: 'leads',
  client_request: 'leads',
  opportunity_new: 'leads',
  new_booking_request: 'leads',
  ops_engineer_assigned: 'jobs',
  ops_job_accepted: 'jobs',
  ops_job_rejected: 'jobs',
  ops_job_completed: 'jobs',
  payment_received: 'payments',
  payment_success: 'payments',
  withdrawal_paid: 'payments',
  invoice_generated: 'payments',
  general: 'account'
};

const RATE_LIMIT_PER_MIN = Number(process.env.VENDOR_NOTIF_RATE_LIMIT || 60);

function mapPriority(priority) {
  const p = String(priority || 'normal').toLowerCase();
  if (p === 'critical' || p === 'urgent') return p === 'critical' ? 'critical' : 'urgent';
  if (p === 'high') return 'high';
  if (p === 'low') return 'low';
  if (p === 'medium') return 'medium';
  return 'normal';
}

function resolveModule(type, moduleHint) {
  if (moduleHint) return moduleHint;
  return TYPE_TO_MODULE[type] || 'system';
}

function resolveActionUrl(type, actionUrl, relatedId) {
  if (actionUrl) return actionUrl;
  const base = TYPE_TO_ACTION[type];
  if (!base) return '';
  if (relatedId && (base === 'support' || base.startsWith('support'))) {
    return `support?ticketId=${relatedId}`;
  }
  return base;
}

async function checkRateLimit(vendorId) {
  if (!isRedisConnected()) return true;
  try {
    const key = `notif:rate:vendor:${vendorId}`;
    const n = await getRedis().incr(key);
    if (n === 1) await getRedis().expire(key, 60);
    return n <= RATE_LIMIT_PER_MIN;
  } catch {
    return true;
  }
}

async function checkDedupe(dedupeKey) {
  if (!dedupeKey) return false;
  if (isRedisConnected()) {
    try {
      const set = await getRedis().set(`notif:center:dedup:${dedupeKey}`, '1', 'EX', 30, 'NX');
      if (set === null) return true;
    } catch {
      /* fall through */
    }
  }
  const recent = await VendorGlobalNotification.findOne({
    dedupeKey,
    createdAt: { $gt: new Date(Date.now() - 30000) },
    deleted: false
  }).lean();
  return Boolean(recent);
}

function channelPrefs(settingsDoc, vendorSettings) {
  const ns = settingsDoc?.notificationSettings || {};
  const master = vendorSettings?.notifications !== false;
  return {
    in_app: true,
    email: master && ns.email !== false,
    sms: master && ns.sms === true,
    push: master && ns.push !== false,
    whatsapp: master && ns.whatsapp === true,
    systemAlerts: ns.systemAlerts !== false,
    marketing: ns.marketing === true
  };
}

function categoryAllowed(vendorSettings, category) {
  const master = vendorSettings?.notifications !== false;
  if (!master) return false;
  const np = vendorSettings?.notificationPreferences || {};
  if (category === 'leads') return np.leads !== false;
  if (category === 'jobs') return np.jobs !== false;
  if (category === 'payments') return np.payments !== false;
  if (category === 'account') return np.account !== false;
  return true;
}

function emitRealtime(vendorId, payload) {
  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (!io) return;
    const id = String(vendorId);
    for (const room of [`vendor:${id}`, `vendor_${id}`]) {
      io.to(room).emit('notification', payload);
      io.to(room).emit('vendor:notification', payload);
      io.to(room).emit('vendorNotificationsUpdated', {
        unreadHint: true,
        notificationId: payload?._id
      });
    }
  } catch (err) {
    console.warn('[VendorNotifCenter] socket emit failed:', err.message);
  }
}

async function deliverChannels(doc, vendor, prefs, { skipPush = false } = {}) {
  const attempts = [];
  const channels = [];

  // In-app always persisted
  channels.push('in_app');
  attempts.push({ channel: 'in_app', status: 'sent', at: new Date() });

  if (prefs.email && vendor.email) {
    channels.push('email');
    try {
      const { sendMailSafe } = require('./emailService');
      // sendMailSafe may not be exported — fallback inline
      const emailMod = require('./emailService');
      if (typeof emailMod.sendMailSafe === 'function') {
        await emailMod.sendMailSafe({
          to: vendor.email,
          subject: doc.title,
          title: doc.title,
          preheader: doc.message,
          html: `<p>${doc.message}</p><p style="color:#64748b;font-size:13px;">Module: ${doc.module} · Priority: ${doc.priority}</p>`
        });
      } else {
        const nodemailer = require('nodemailer');
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
          const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
          });
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'WBI <noreply@wbi.com>',
            to: vendor.email,
            subject: `[WBI] ${doc.title}`,
            text: doc.message
          });
        }
      }
      attempts.push({ channel: 'email', status: 'sent', at: new Date() });
    } catch (err) {
      attempts.push({ channel: 'email', status: 'failed', error: err.message, at: new Date() });
      scheduleRetry(doc._id, 'email');
    }
  }

  if (prefs.sms && vendor.phone) {
    channels.push('sms');
    try {
      await sendSMS(vendor.phone, `WBI: ${doc.title} — ${doc.message}`.slice(0, 160));
      attempts.push({ channel: 'sms', status: 'sent', at: new Date() });
    } catch (err) {
      attempts.push({ channel: 'sms', status: 'failed', error: err.message, at: new Date() });
      scheduleRetry(doc._id, 'sms');
    }
  }

  if (prefs.push && !skipPush) {
    channels.push('push');
    try {
      await sendNotificationToVendor(vendor._id || doc.vendorId, {
        title: doc.title,
        body: doc.message,
        priority: doc.priority === 'critical' || doc.priority === 'urgent' ? 'high' : 'normal',
        data: {
          type: doc.type,
          module: doc.module,
          relatedId: doc.relatedId ? String(doc.relatedId) : '',
          relatedType: doc.relatedType || '',
          actionUrl: doc.actionUrl || '',
          notificationId: String(doc._id)
        }
      });
      attempts.push({ channel: 'push', status: 'sent', at: new Date() });
    } catch (err) {
      attempts.push({ channel: 'push', status: 'failed', error: err.message, at: new Date() });
      scheduleRetry(doc._id, 'push');
    }
  }

  const failed = attempts.some((a) => a.status === 'failed');
  const sent = attempts.some((a) => a.status === 'sent');
  doc.channels = [...new Set(channels)];
  doc.deliveryAttempts = [...(doc.deliveryAttempts || []), ...attempts];
  doc.deliveryStatus = failed && sent ? 'partial' : failed ? 'failed' : 'delivered';
  await doc.save();
  return doc;
}

const retryQueues = new Map();

function scheduleRetry(notificationId, channel, attempt = 1) {
  if (attempt > 3) return;
  const key = `${notificationId}:${channel}:${attempt}`;
  if (retryQueues.has(key)) return;
  const delay = Math.min(30000, 2000 * 2 ** (attempt - 1));
  const timer = setTimeout(async () => {
    retryQueues.delete(key);
    try {
      const doc = await VendorGlobalNotification.findById(notificationId);
      if (!doc || doc.deleted) return;
      const vendor = await Vendor.findById(doc.vendorId).select('email phone').lean();
      if (!vendor) return;
      if (channel === 'email' && vendor.email) {
        const nodemailer = require('nodemailer');
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
          const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
          });
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'WBI <noreply@wbi.com>',
            to: vendor.email,
            subject: `[WBI] ${doc.title}`,
            text: doc.message
          });
        }
      } else if (channel === 'sms' && vendor.phone) {
        await sendSMS(vendor.phone, `WBI: ${doc.title}`.slice(0, 160));
      } else if (channel === 'push') {
        await sendNotificationToVendor(doc.vendorId, {
          title: doc.title,
          body: doc.message,
          data: { type: doc.type, notificationId: String(doc._id) }
        });
      }
      doc.deliveryAttempts.push({ channel, status: 'sent', at: new Date() });
      doc.deliveryStatus = 'delivered';
      await doc.save();
    } catch (err) {
      scheduleRetry(notificationId, channel, attempt + 1);
    }
  }, delay);
  retryQueues.set(key, timer);
}

/**
 * Publish a vendor notification from a real backend event.
 */
async function publishVendorNotification({
  vendorId,
  type,
  title,
  message,
  module: moduleHint = null,
  priority = 'normal',
  relatedId = null,
  relatedType = null,
  actionUrl = null,
  metadata = {},
  actorType = 'system',
  actorId = null,
  serviceCategoryCode = '',
  serviceCategoryName = '',
  dedupeKey = null,
  skipPush = false,
  skipChannels = false,
  classicNotificationId = null,
  category = null
}) {
  if (!vendorId || !title || !type) return null;

  const vendor = await Vendor.findById(vendorId).select('email phone settings name companyName').lean();
  if (!vendor) return null;

  const cat = category || TYPE_CATEGORY[type] || 'account';
  if (!categoryAllowed(vendor.settings, cat)) {
    return null;
  }

  const allowed = await checkRateLimit(vendorId);
  if (!allowed) {
    console.warn(`[VendorNotifCenter] rate limited vendor ${vendorId}`);
    return null;
  }

  const key =
    dedupeKey ||
    crypto
      .createHash('sha1')
      .update(`${vendorId}:${type}:${relatedId || ''}:${title}`)
      .digest('hex');

  if (await checkDedupe(key)) {
    return null;
  }

  const settingsDoc = await VendorGlobalSetting.findOne({ vendorId }).lean();
  const prefs = channelPrefs(settingsDoc, vendor.settings);

  if (type === 'system_announcement' && !prefs.systemAlerts) return null;

  const doc = await VendorGlobalNotification.create({
    vendorId,
    title: String(title).trim(),
    message: String(message || '').trim(),
    type: String(type),
    eventType: String(type),
    module: resolveModule(type, moduleHint),
    priority: mapPriority(priority),
    channels: ['in_app'],
    actionUrl: resolveActionUrl(type, actionUrl, relatedId),
    relatedId: relatedId || null,
    relatedType: relatedType || null,
    metadata: { ...metadata, notifyCategory: cat },
    actorType,
    actorId: actorId || null,
    serviceCategoryCode: serviceCategoryCode || '',
    serviceCategoryName: serviceCategoryName || '',
    dedupeKey: key,
    classicNotificationId: classicNotificationId || null,
    auditLog: [
      {
        action: 'created',
        actorType,
        actorId: actorId || null,
        meta: { type, module: resolveModule(type, moduleHint) },
        at: new Date()
      }
    ]
  });

  emitRealtime(vendorId, {
    _id: doc._id,
    title: doc.title,
    message: doc.message,
    type: doc.type,
    module: doc.module,
    priority: doc.priority,
    actionUrl: doc.actionUrl,
    relatedId: doc.relatedId,
    relatedType: doc.relatedType,
    read: false,
    createdAt: doc.createdAt,
    source: 'vendor_notification_center'
  });

  if (!skipChannels) {
    // Async channel delivery — don't block caller
    setImmediate(() => {
      deliverChannels(doc, vendor, prefs, { skipPush }).catch((err) =>
        console.error('[VendorNotifCenter] channel delivery failed:', err.message)
      );
    });
  }

  return doc;
}

/**
 * Bridge classic Notification → center (idempotent via classicNotificationId / dedupe).
 */
async function bridgeFromClassicNotification(notification, extras = {}) {
  if (!notification?.vendorId) return null;
  return publishVendorNotification({
    vendorId: notification.vendorId,
    type: notification.type || 'general',
    title: notification.title,
    message: notification.message,
    relatedId: notification.relatedId,
    relatedType: notification.relatedType,
    metadata: notification.data || {},
    priority: extras.priority || notification.data?.priority || 'normal',
    module: extras.module || notification.data?.module || null,
    actionUrl: extras.actionUrl || notification.data?.actionUrl || notification.data?.link || null,
    classicNotificationId: notification._id,
    dedupeKey: `classic:${notification._id}`,
    skipPush: true, // classic path already handled push
    skipChannels: extras.skipChannels === true,
    category: extras.category || notification.data?.notifyCategory || null,
    actorType: extras.actorType || 'system'
  });
}

module.exports = {
  publishVendorNotification,
  bridgeFromClassicNotification,
  TYPE_TO_MODULE,
  TYPE_TO_ACTION,
  mapPriority,
  resolveModule,
  resolveActionUrl
};
