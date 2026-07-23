const Vendor = require('../models/Vendor');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { publishVendorNotification } = require('./vendorNotificationCenter.service');
const { sendNotificationToVendor } = require('./firebaseAdmin');

/** @typedef {'leads'|'jobs'|'payments'|'account'} VendorNotifyCategory */

const TYPE_CATEGORY = {
  client_request: 'leads',
  opportunity_new: 'leads',
  new_booking_request: 'leads',
  booking_request: 'leads',
  ops_engineer_assigned: 'jobs',
  ops_job_accepted: 'jobs',
  ops_job_rejected: 'jobs',
  ops_job_completed: 'jobs',
  job_engineer_accepted: 'jobs',
  job_completed: 'jobs',
  payment_received: 'payments',
  payment_success: 'payments',
  payout_requested: 'payments',
  invoice_generated: 'payments',
  withdrawal_paid: 'payments',
  withdrawal_approved: 'payments',
  withdrawal_rejected: 'payments',
  general: 'account'
};

function normalizePrefs(settings) {
  const masterPush = settings?.notifications !== false;
  const np = settings?.notificationPreferences || {};
  return {
    masterPush,
    soundAlerts: settings?.soundAlerts !== false,
    leads: masterPush && np.leads !== false,
    jobs: masterPush && np.jobs !== false,
    payments: masterPush && np.payments !== false,
    account: masterPush && np.account !== false
  };
}

function categoryAllowed(prefs, category) {
  if (category === 'leads') return prefs.leads;
  if (category === 'jobs') return prefs.jobs;
  if (category === 'payments') return prefs.payments;
  if (category === 'account') return prefs.account;
  return prefs.masterPush;
}

/**
 * In-app Notification Center + classic Notification + sockets + FCM.
 */
async function notifyVendor(
  vendorId,
  {
    type,
    title,
    message,
    relatedId = null,
    relatedType = null,
    data = {},
    priority = null,
    category = null,
    pushType = null,
    skipInApp = false,
    module: moduleHint = null,
    actionUrl = null
  }
) {
  if (!vendorId) return null;

  const vendor = await Vendor.findById(vendorId).select('settings').lean();
  if (!vendor) return null;

  const prefs = normalizePrefs(vendor.settings);
  /** @type {VendorNotifyCategory} */
  const cat = category || TYPE_CATEGORY[type] || 'account';
  if (!categoryAllowed(prefs, cat)) return null;

  let notification = null;
  if (!skipInApp) {
    notification = await createNotification({
      vendorId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      data: {
        ...data,
        notifyCategory: cat,
        module: moduleHint || data.module,
        actionUrl: actionUrl || data.actionUrl || data.link
      },
      skipPush: true,
      priority,
      pushData: { type: pushType || type, notifyCategory: cat }
    });
    // createNotification already bridges to Notification Center
  } else {
    // Center-only path
    await publishVendorNotification({
      vendorId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      metadata: { ...data, notifyCategory: cat },
      priority: priority || 'normal',
      module: moduleHint,
      actionUrl,
      category: cat,
      skipPush: true
    });
  }

  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io) {
      const id = String(vendorId);
      const rooms = [`vendor:${id}`, `vendor_${id}`];
      for (const room of rooms) {
        if (notification) io.to(room).emit('notification', notification);
        io.to(room).emit('vendorNotificationsUpdated');
        if (cat === 'leads') io.to(room).emit('vendorJobsUpdated');
        if (cat === 'jobs') io.to(room).emit('vendorOpsUpdated', { title, message, ...data });
      }
    }
  } catch (_) {
    /* non-blocking */
  }

  if (prefs.masterPush) {
    const fcmData = {
      type: pushType || type,
      notifyCategory: cat,
      relatedId: relatedId ? String(relatedId) : '',
      relatedType: relatedType ? String(relatedType) : '',
      soundAlerts: prefs.soundAlerts ? '1' : '0'
    };
    Object.entries(data).forEach(([key, val]) => {
      if (val !== undefined && val !== null) fcmData[key] = String(val);
    });

    await sendNotificationToVendor(vendorId, {
      title,
      body: message,
      priority: priority || (cat === 'leads' ? 'high' : 'normal'),
      data: fcmData
    });
  }

  return notification;
}

module.exports = {
  notifyVendor,
  normalizePrefs,
  TYPE_CATEGORY
};
