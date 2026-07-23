const NotificationDeliveryLog = require('../../models/NotificationDeliveryLog');
const { emit, emitAsync } = require('../../services/notification/notificationOrchestrator.service');
const { listEventKeys } = require('../../services/notification/eventCatalog');
const crypto = require('crypto');

/**
 * GET /api/admin/notifications/delivery-logs
 */
exports.getDeliveryLogs = async (req, res) => {
  try {
    const {
      eventKey,
      status,
      channel,
      recipientRole,
      page = 1,
      limit = 50
    } = req.query;
    const filter = {};
    if (eventKey) filter.eventKey = eventKey;
    if (status) filter.status = status;
    if (channel) filter.channel = channel;
    if (recipientRole) filter.recipientRole = recipientRole;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      NotificationDeliveryLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      NotificationDeliveryLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (err) {
    console.error('getDeliveryLogs:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/admin/notifications/announce
 * Body: { title, message, actionUrl?, roles?: string[], channels?: string[] }
 */
exports.announce = async (req, res) => {
  try {
    const { title, message, actionUrl = null, roles, channels } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'title and message are required' });
    }

    const announcementId = `ann-${crypto.randomBytes(8).toString('hex')}`;
    const result = await emit('system_announcement', {
      actorId: req.user._id || req.user.id,
      targets: {
        broadcastAll: true,
        broadcastRoles: Array.isArray(roles) && roles.length
          ? roles
          : ['vendor', 'user', 'engineer', 'b2b', 'admin']
      },
      data: {
        title,
        message,
        actionUrl,
        announcementId,
        dedupeSeed: announcementId
      },
      channels: Array.isArray(channels) && channels.length ? channels : ['in_app', 'push']
    });

    res.status(201).json({ success: true, data: result, announcementId });
  } catch (err) {
    console.error('announce:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/admin/notifications/events — catalog keys for ops
 */
exports.listEvents = async (_req, res) => {
  res.json({ success: true, data: listEventKeys() });
};

/**
 * POST /api/admin/notifications/test-emit — staging only
 */
exports.testEmit = async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.NOTIF_ALLOW_TEST_EMIT !== 'true') {
    return res.status(403).json({ success: false, message: 'Disabled in production' });
  }
  try {
    const { eventKey, targets, data, channels } = req.body;
    const result = await emit(eventKey, { targets, data, channels, actorId: req.user._id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports.emitAsync = emitAsync;
