const Engineer = require('../models/Engineer');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { sendNotificationToEngineer } = require('./firebaseAdmin');

/** @typedef {'jobs'|'workUpdates'|'payments'|'account'} NotifyCategory */

const TYPE_CATEGORY = {
  worker_assigned: 'jobs',
  job_accepted: 'jobs',
  job_rejected: 'jobs',
  job_cancelled: 'jobs',
  booking_request: 'jobs',
  work_completed: 'workUpdates',
  worker_started: 'workUpdates',
  worker_completed: 'workUpdates',
  work_done: 'workUpdates',
  payment_received: 'payments',
  payment_success: 'payments',
  wallet_topup: 'payments',
  payout_requested: 'payments',
  payout_processed: 'payments',
  general: 'account'
};

function normalizePrefs(settings) {
  const masterPush = settings?.notifications !== false;
  const np = settings?.notificationPreferences || {};
  return {
    masterPush,
    soundAlerts: settings?.soundAlerts !== false,
    jobs: masterPush && np.jobs !== false,
    workUpdates: masterPush && np.workUpdates !== false,
    payments: masterPush && np.payments !== false,
    account: masterPush && np.account !== false
  };
}

function categoryAllowed(prefs, category) {
  if (category === 'jobs') return prefs.jobs;
  if (category === 'workUpdates') return prefs.workUpdates;
  if (category === 'payments') return prefs.payments;
  if (category === 'account') return prefs.account;
  return prefs.masterPush;
}

/**
 * In-app notification + engineer socket room + FCM (respects engineer settings).
 */
async function notifyEngineer(
  engineerId,
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
    skipInApp = false
  }
) {
  if (!engineerId) return null;

  const engineer = await Engineer.findById(engineerId).select('settings').lean();
  if (!engineer) return null;

  const prefs = normalizePrefs(engineer.settings);
  /** @type {NotifyCategory} */
  const cat = category || TYPE_CATEGORY[type] || 'jobs';
  if (!categoryAllowed(prefs, cat)) return null;

  let notification = null;
  if (!skipInApp) {
    notification = await createNotification({
      workerId: engineerId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      data: { ...data, notifyCategory: cat },
      skipPush: true,
      priority,
      pushData: { type: pushType || type, notifyCategory: cat }
    });
  }

  try {
    const { getIO } = require('../sockets');
    const io = getIO();
    if (io) {
      const room = `engineer:${String(engineerId)}`;
      if (notification) io.to(room).emit('notification', notification);
      io.to(room).emit('workerNotificationsUpdated');
      if (cat === 'jobs') io.to(room).emit('engineerJobsUpdated');
      if (cat === 'payments') {
        io.to(room).emit('wallet:updated', { title, message, ...data });
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

    await sendNotificationToEngineer(engineerId, {
      title,
      body: message,
      priority: priority || (cat === 'jobs' ? 'high' : 'normal'),
      data: fcmData
    });
  }

  return notification;
}

module.exports = {
  notifyEngineer,
  normalizePrefs,
  TYPE_CATEGORY
};
