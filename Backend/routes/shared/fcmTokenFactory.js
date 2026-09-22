/**
 * Generic FCM token save/remove for Admin and B2B.
 */
const express = require('express');
const { authenticate } = require('../../middleware/authMiddleware');

const MAX_TOKENS = 10;

function buildFcmRouter({ roleCheck, Model, idFromReq, role = 'user' }) {
  const router = express.Router();

  router.post('/save', authenticate, async (req, res) => {
    try {
      if (!roleCheck(req)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { token, platform = 'web' } = req.body;
      if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
      const entityId = idFromReq(req);

      const pullQuery = platform === 'mobile'
        ? { $pull: { fcmTokenMobile: token } }
        : { $pull: { fcmTokens: token } };
      await Model.findByIdAndUpdate(entityId, pullQuery);

      const pushQuery = platform === 'mobile'
        ? { $push: { fcmTokenMobile: { $each: [token], $position: 0, $slice: MAX_TOKENS } } }
        : { $push: { fcmTokens: { $each: [token], $position: 0, $slice: MAX_TOKENS } } };

      const doc = await Model.findByIdAndUpdate(entityId, pushQuery, { new: true });
      if (!doc) return res.status(404).json({ success: false, error: 'Account not found' });

      // The registry is what push reads: one row per device, refreshed here.
      try {
        const { registerDevice } = require('../../services/deviceToken.service');
        await registerDevice({
          userId: entityId,
          role,
          deviceId: req.body.deviceId,
          token,
          platform: req.body.platform === 'mobile' ? (req.body.os || 'android') : 'web',
          appVersion: req.body.appVersion || '',
          deviceModel: req.body.deviceModel || '',
          companyId: req.user?.companyId || null
        });
      } catch (regErr) {
        console.warn('[FCM save] device registry skipped:', regErr.message);
      }

      return res.json({ success: true, message: 'Token saved' });
    } catch (err) {
      console.error('[FCM save]', err.message);
      return res.status(500).json({ success: false, error: 'Failed to save token' });
    }
  });

  router.post('/remove', authenticate, async (req, res) => {
    try {
      if (!roleCheck(req)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const { token, platform = 'web' } = req.body;
      if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
      const entityId = idFromReq(req);
      const pullQuery = platform === 'mobile'
        ? { $pull: { fcmTokenMobile: token } }
        : { $pull: { fcmTokens: token } };
      await Model.findByIdAndUpdate(entityId, pullQuery);
      try {
        const { removeDevice } = require('../../services/deviceToken.service');
        await removeDevice({ userId: entityId, deviceId: req.body.deviceId, token });
      } catch (regErr) {
        console.warn('[FCM remove] device registry skipped:', regErr.message);
      }
      return res.json({ success: true, message: 'Token removed' });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to remove token' });
    }
  });

  return router;
}

module.exports = { buildFcmRouter };
