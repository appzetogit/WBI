const User = require('../models/User');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { sendNotificationToUser } = require('./firebaseAdmin');

async function notifyUser(userId, {
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  data = {},
  priority = 'normal',
  skipPush = false
}) {
  if (!userId) return null;
  const user = await User.findById(userId).select('settings').lean();
  if (!user) return null;
  if (user.settings?.notifications === false) return null;

  const notification = await createNotification({
    userId,
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
      await sendNotificationToUser(userId, {
        title,
        body: message,
        data: { type, ...(data || {}) },
        priority
      });
    } catch (e) {
      console.warn('[notifyUser] push failed:', e.message);
    }
  }

  return notification;
}

module.exports = { notifyUser };
