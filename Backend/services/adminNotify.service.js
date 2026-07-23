const Admin = require('../models/Admin');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { sendNotificationToAdmin } = require('./firebaseAdmin');

async function notifyAdmin(adminId, {
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  data = {},
  priority = 'normal',
  skipPush = false
}) {
  if (!adminId) return null;
  const admin = await Admin.findById(adminId).select('isActive').lean();
  if (!admin || admin.isActive === false) return null;

  const notification = await createNotification({
    adminId,
    type,
    title,
    message,
    relatedId,
    relatedType,
    data,
    skipPush: true,
    priority
  });

  if (!skipPush) {
    try {
      await sendNotificationToAdmin(adminId, {
        title,
        body: message,
        data: { type, ...(data || {}) },
        priority
      });
    } catch (e) {
      console.warn('[notifyAdmin] push failed:', e.message);
    }
  }

  return notification;
}

/** Notify all active admins (in-app + push) */
async function notifyAllAdmins(payload) {
  const admins = await Admin.find({ isActive: true }).select('_id').lean();
  const results = [];
  for (const a of admins) {
    results.push(await notifyAdmin(a._id, payload));
  }
  return results;
}

module.exports = { notifyAdmin, notifyAllAdmins };
