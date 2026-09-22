const B2BPlatformConfig = require('../../models/B2BPlatformConfig');
const {
  getB2BConfig,
  invalidateB2BConfig,
  DEFAULT_SLA_PROFILES,
  DEFAULT_TOPUP_METHODS
} = require('../../services/b2bPlatformConfig.service');
const { logAudit } = require('../../utils/auditLogger');

/** The signed-in actor, whatever the auth middleware called the field. */
const actorId = (req) => req.user?._id || req.user?.id || null;

/**
 * Admin settings for the B2B ecosystem: routing timeouts and fallback order,
 * SLA profiles, top-up methods, bulk limits, business hours and notification
 * channels. Everything the services read at runtime is editable here.
 */

const SECTIONS = ['routing', 'sla', 'payments', 'businessHours', 'bulkUpload', 'notifications'];

/** GET /api/admin/b2b/settings */
exports.getSettings = async (req, res) => {
  try {
    const config = await getB2BConfig({ fresh: true });
    res.status(200).json({
      success: true,
      data: config,
      defaults: { slaProfiles: DEFAULT_SLA_PROFILES, topUpMethods: DEFAULT_TOPUP_METHODS }
    });
  } catch (error) {
    console.error('[Admin B2B Settings] get error:', error);
    res.status(500).json({ success: false, message: 'Failed to load B2B settings' });
  }
};

/**
 * PATCH /api/admin/b2b/settings
 * Accepts any of the sections; only what is sent is changed.
 */
exports.updateSettings = async (req, res) => {
  try {
    const patch = {};
    for (const section of SECTIONS) {
      if (req.body[section] !== undefined) patch[section] = req.body[section];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({
        success: false,
        message: `Send at least one of: ${SECTIONS.join(', ')}`
      });
    }

    // Guardrails: these values drive real timers and money, so they are checked.
    const r = patch.routing;
    if (r) {
      const positive = ['vendorOfferTimeoutMinutes', 'engineerAcceptTimeoutMinutes', 'engineerMaxActiveJobs', 'maxFallbackAttempts'];
      for (const key of positive) {
        if (r[key] !== undefined && (!Number.isFinite(Number(r[key])) || Number(r[key]) < 1)) {
          return res.status(400).json({ success: false, message: `routing.${key} must be at least 1` });
        }
      }
      if (r.mode && !['vendor_first', 'freelancer_first', 'vendor_only', 'freelancer_only'].includes(r.mode)) {
        return res.status(400).json({ success: false, message: 'routing.mode is not one of the supported modes' });
      }
    }
    if (patch.bulkUpload?.maxRows !== undefined) {
      const n = Number(patch.bulkUpload.maxRows);
      if (!Number.isFinite(n) || n < 1 || n > 10000) {
        return res.status(400).json({ success: false, message: 'bulkUpload.maxRows must be between 1 and 10000' });
      }
    }
    if (patch.sla?.checkCron) {
      const cron = require('node-cron');
      if (!cron.validate(patch.sla.checkCron)) {
        return res.status(400).json({ success: false, message: 'sla.checkCron is not a valid cron expression' });
      }
    }
    if (patch.payments?.topUpMethods) {
      const bad = patch.payments.topUpMethods.find((m) => !m.key || !m.label);
      if (bad) {
        return res.status(400).json({ success: false, message: 'Every top-up method needs a key and a label' });
      }
    }

    const before = await B2BPlatformConfig.findOne({ key: 'default' }).lean();
    const updated = await B2BPlatformConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { ...patch, updatedBy: actorId(req) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    // Services cache the settings for a few seconds; this makes it immediate.
    invalidateB2BConfig();

    await logAudit({
      actionType: 'B2B_SETTINGS_UPDATED',
      actorId: actorId(req),
      actorRole: 'admin',
      targetType: 'B2BPlatformConfig',
      targetId: updated._id,
      oldValue: before ? Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])) : null,
      newValue: patch,
      reason: req.body.reason || '',
      req
    });

    res.status(200).json({ success: true, message: 'B2B settings updated', data: updated });
  } catch (error) {
    console.error('[Admin B2B Settings] update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update B2B settings' });
  }
};
