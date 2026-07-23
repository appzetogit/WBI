const PaymentMethodConfig = require('../../models/PaymentMethodConfig');
const PaymentAuditLog = require('../../models/PaymentAuditLog');
const razorpayService = require('../../services/razorpayService');
const { writeAudit } = require('../../services/userPaymentMethod.service');

exports.getConfig = async (req, res) => {
  try {
    const cfg = await PaymentMethodConfig.getOrCreate();
    const obj = cfg.toObject();
    obj.gateway = {
      ...obj.gateway,
      publicKeyId: razorpayService.getPublicKeyId() || obj.gateway?.publicKeyId,
      keyConfigured: !!process.env.RAZORPAY_KEY_ID,
      secretConfigured: !!process.env.RAZORPAY_KEY_SECRET,
      webhookConfigured: !!process.env.RAZORPAY_WEBHOOK_SECRET,
      testMode: razorpayService.isTestMode()
    };
    res.json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const cfg = await PaymentMethodConfig.getOrCreate();
    const { methods, cod, fraud, gateway } = req.body;

    if (Array.isArray(methods)) {
      cfg.methods = methods.map((m, idx) => ({
        key: m.key,
        enabled: !!m.enabled,
        label: m.label || m.key,
        sortOrder: m.sortOrder ?? idx,
        minAmount: m.minAmount ?? 0,
        maxAmount: m.maxAmount ?? null,
        allowedCategories: m.allowedCategories || [],
        metadata: m.metadata || {}
      }));
    }
    if (cod && typeof cod === 'object') {
      cfg.cod = { ...cfg.cod.toObject?.() || cfg.cod, ...cod };
    }
    if (fraud && typeof fraud === 'object') {
      cfg.fraud = { ...cfg.fraud.toObject?.() || cfg.fraud, ...fraud };
    }
    if (gateway && typeof gateway === 'object') {
      if (gateway.verificationAmount != null) cfg.gateway.verificationAmount = Number(gateway.verificationAmount);
      if (gateway.webhookConfigured != null) cfg.gateway.webhookConfigured = !!gateway.webhookConfigured;
    }

    await cfg.save();
    await writeAudit({
      actorRole: 'admin',
      actorId: req.user.id || req.user._id,
      action: 'payment_config_update',
      targetType: 'PaymentMethodConfig',
      targetId: cfg._id,
      meta: { methods: (cfg.methods || []).map((m) => ({ key: m.key, enabled: m.enabled })) },
      req
    });

    res.json({ success: true, data: cfg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { action, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (action) filter.action = action;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [data, total] = await Promise.all([
      PaymentAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      PaymentAuditLog.countDocuments(filter)
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
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSettlements = async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count || '20', 10), 100);
    const skip = parseInt(req.query.skip || '0', 10);
    const result = await razorpayService.fetchSettlements({ count, skip });
    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error, data: [] });
    }
    res.json({ success: true, data: result.items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
