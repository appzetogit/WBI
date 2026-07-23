const B2BUser = require('../models/B2BUser');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { sendNotificationToB2B } = require('./firebaseAdmin');

async function notifyB2B(b2bUserId, {
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  data = {},
  priority = 'normal',
  category = 'account',
  skipPush = false,
  b2bCompanyId = null
}) {
  if (!b2bUserId) return null;
  const user = await B2BUser.findById(b2bUserId)
    .select('status companyId notificationPreferences')
    .lean();
  if (!user || user.status === 'blocked' || user.status === 'inactive') return null;

  const prefs = user.notificationPreferences || {};
  if (prefs[category] === false) return null;

  const companyId = b2bCompanyId || user.companyId;

  const notification = await createNotification({
    b2bUserId,
    b2bCompanyId: companyId,
    type,
    title,
    message,
    relatedId,
    relatedType,
    data: { ...data, notifyCategory: category },
    skipPush: true,
    priority
  });

  if (!skipPush && prefs.push !== false) {
    try {
      await sendNotificationToB2B(b2bUserId, {
        title,
        body: message,
        data: { type, ...(data || {}) },
        priority
      });
    } catch (e) {
      console.warn('[notifyB2B] push failed:', e.message);
    }
  }

  return notification;
}

/** Notify all active users for a B2B company */
async function notifyB2BCompany(companyId, payload) {
  if (!companyId) return [];
  const users = await B2BUser.find({ companyId, status: 'active' }).select('_id').lean();
  const results = [];
  for (const u of users) {
    results.push(await notifyB2B(u._id, { ...payload, b2bCompanyId: companyId }));
  }
  return results;
}

module.exports = { notifyB2B, notifyB2BCompany };
