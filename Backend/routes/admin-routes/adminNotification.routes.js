const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getDeliveryLogs,
  announce,
  listEvents,
  testEmit
} = require('../../controllers/adminControllers/adminNotificationController');

router.use(authenticate, isAdmin);

router.get('/delivery-logs', getDeliveryLogs);
router.get('/events', listEvents);
router.post('/announce', announce);
router.post('/test-emit', testEmit);

// ── Editable templates (overrides of services/notification/eventCatalog.js) ──
const { EVENT_CATALOG } = require('../../services/notification/eventCatalog');
const NotificationTemplate = require('../../models/NotificationTemplate');
const { clearTemplateCache, describeDefault } = require('../../services/notification/notificationTemplate.service');

router.get('/templates', async (req, res) => {
  const overrides = new Map((await NotificationTemplate.find({}).lean()).map((t) => [t.eventKey, t]));
  const data = Object.entries(EVENT_CATALOG).map(([eventKey, def]) => {
    const o = overrides.get(eventKey);
    return {
      eventKey,
      category: def.category,
      recipients: def.recipients,
      priority: def.priority,
      defaultChannels: def.channels,
      defaultTitle: describeDefault(def.title),
      defaultMessage: describeDefault(def.message),
      override: o ? { enabled: o.enabled, channels: o.channels, title: o.title, message: o.message, updatedAt: o.updatedAt } : null
    };
  });
  res.json({ success: true, data });
});

router.put('/templates/:eventKey', async (req, res) => {
  const { eventKey } = req.params;
  if (!EVENT_CATALOG[eventKey]) return res.status(404).json({ success: false, message: 'Unknown event' });
  const { enabled, channels, title, message } = req.body || {};
  const set = { updatedBy: req.user?._id || null };
  if (enabled !== undefined) set.enabled = Boolean(enabled);
  if (channels !== undefined) set.channels = Array.isArray(channels) ? channels : [];
  if (title !== undefined) set.title = String(title || '').trim() || undefined;
  if (message !== undefined) set.message = String(message || '').trim() || undefined;
  try {
    const doc = await NotificationTemplate.findOneAndUpdate({ eventKey }, { $set: set }, { upsert: true, new: true, runValidators: true });
    clearTemplateCache();
    res.json({ success: true, message: 'Template saved', data: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.delete('/templates/:eventKey', async (req, res) => {
  await NotificationTemplate.deleteOne({ eventKey: req.params.eventKey });
  clearTemplateCache();
  res.json({ success: true, message: 'Template reverted to default' });
});

module.exports = router;
