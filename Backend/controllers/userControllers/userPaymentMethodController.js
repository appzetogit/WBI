const svc = require('../../services/userPaymentMethod.service');

function handle(err, res) {
  const status = err.status || 500;
  console.error('[userPaymentMethod]', err.message);
  return res.status(status).json({
    success: false,
    message: err.message || 'Request failed',
    code: err.code || undefined
  });
}

exports.getConfig = async (req, res) => {
  try {
    const data = await svc.getPublicConfig();
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.listMethods = async (req, res) => {
  try {
    const [methods, config] = await Promise.all([
      svc.listMethods(req.user.id),
      svc.getPublicConfig()
    ]);
    res.json({ success: true, data: { methods, config } });
  } catch (err) {
    handle(err, res);
  }
};

exports.startInstrument = async (req, res) => {
  try {
    const data = await svc.startInstrument(req.user.id, { methodType: req.body.methodType }, req);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.confirmInstrument = async (req, res) => {
  try {
    const data = await svc.confirmInstrument(req.user.id, req.body, req);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.verifyUpi = async (req, res) => {
  try {
    const data = await svc.verifyUpi(req.user.id, { vpa: req.body.vpa }, req);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.setDefault = async (req, res) => {
  try {
    const data = await svc.setDefault(req.user.id, req.params.id, { otp: req.body.otp }, req);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.deleteMethod = async (req, res) => {
  try {
    const data = await svc.deleteMethod(req.user.id, req.params.id, { otp: req.body.otp }, req);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.setCodPreference = async (req, res) => {
  try {
    const data = await svc.setCodPreference(req.user.id, { enabled: !!req.body.enabled }, req);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.sendSensitiveOtp = async (req, res) => {
  try {
    const data = await svc.sendSensitiveOtp(req.user.id);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.getHistory = async (req, res) => {
  try {
    const data = await svc.getHistory(req.user.id, req.query);
    res.json({ success: true, data: data.items, pagination: data.pagination });
  } catch (err) {
    handle(err, res);
  }
};

exports.getReceipt = async (req, res) => {
  try {
    const data = await svc.getReceipt(req.user.id, req.params.id);
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      return res.send(data.html);
    }
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};

exports.retryPayment = async (req, res) => {
  try {
    const data = await svc.retryFailedPayment(req.user.id, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    handle(err, res);
  }
};
