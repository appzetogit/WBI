/**
 * Admin controls on people that were missing from the panel (spec §2, §4, §5):
 *   users     — addresses, activity, refunds, edit profile
 *   engineers — assign vendor, skills/services, location, availability, force offline
 *   workers   — services, location, availability, force offline
 *   vendors   — commission override, performance scorecard
 * Permissions come from the central adminAccess guard (users.*, workforce.*, vendors.*).
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error('[adminPeople]', e);
  res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Request failed' });
});
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const model = (name) => mongoose.models[name] || require(`../../models/${name}`);

// ── Users ─────────────────────────────────────────────────────────────────
router.get('/users/:id/addresses', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid user id');
  const rows = await model('Address').find({ userId: req.params.id }).sort({ isDefault: -1, createdAt: -1 }).lean();
  res.json({ success: true, data: rows });
}));

router.get('/users/:id/refunds', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid user id');
  const rows = await model('Transaction').find({ userId: req.params.id, type: 'refund' })
    .populate('bookingId', 'bookingNumber').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: rows });
}));

router.get('/users/:id/activity', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid user id');
  const id = req.params.id;
  const [bookings, audits, disputes] = await Promise.all([
    model('Booking').find({ userId: id }).select('bookingNumber serviceName status createdAt updatedAt').sort({ createdAt: -1 }).limit(30).lean(),
    model('AuditLog').find({ targetId: id }).select('actionType eventMessage reason oldValue newValue actorRole createdAt').sort({ createdAt: -1 }).limit(30).lean(),
    model('Dispute').find({ raisedById: id }).select('disputeNumber reason status createdAt').sort({ createdAt: -1 }).limit(20).lean()
  ]);
  const events = [
    ...bookings.map((b) => ({ at: b.createdAt, kind: 'booking', text: `Booked ${b.serviceName || 'service'} (#${b.bookingNumber}) — now ${b.status}` })),
    ...audits.map((a) => ({ at: a.createdAt, kind: 'admin', text: `${a.eventMessage}${a.reason ? ` — ${a.reason}` : ''}`, oldValue: a.oldValue, newValue: a.newValue })),
    ...disputes.map((d) => ({ at: d.createdAt, kind: 'dispute', text: `Raised dispute ${d.disputeNumber}: ${d.reason} (${d.status})` }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ success: true, data: events });
}));

router.put('/users/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid user id');
  const { name, email } = req.body || {};
  const set = {};
  if (name !== undefined) {
    if (!String(name).trim()) throw bad('Name cannot be empty');
    set.name = String(name).trim();
  }
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Invalid email');
    if (e && await model('User').exists({ email: e, _id: { $ne: req.params.id } })) throw bad('Email already used by another account', 409);
    set.email = e || null;
  }
  if (!Object.keys(set).length) throw bad('Nothing to update');
  const user = await model('User').findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).select('name email phone isActive');
  if (!user) throw bad('User not found', 404);
  res.json({ success: true, message: 'User updated', data: user });
}));

// ── Engineers & workers ───────────────────────────────────────────────────
const applyLocation = (doc, { city, state, pincode, lat, lng }) => {
  if (city !== undefined || state !== undefined || pincode !== undefined) {
    doc.address = { ...(doc.address?.toObject ? doc.address.toObject() : doc.address || {}) };
    if (city !== undefined) doc.address.city = city;
    if (state !== undefined) doc.address.state = state;
    if (pincode !== undefined) {
      if (pincode && !/^[1-9][0-9]{5}$/.test(String(pincode))) throw bad('Invalid pincode');
      doc.address.pincode = pincode;
    }
  }
  if (lat !== undefined && lng !== undefined) {
    const la = Number(lat); const ln = Number(lng);
    if (!(la >= -90 && la <= 90 && ln >= -180 && ln <= 180)) throw bad('Invalid coordinates');
    return { la, ln };
  }
  return null;
};

const setAvailability = (doc, { availability, forceOffline, status }) => {
  if (availability !== undefined) doc.availability = availability;
  if (forceOffline === true || status === 'OFFLINE') doc.status = 'OFFLINE';
};

router.patch('/engineers/:id/admin-controls', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid engineer id');
  const Engineer = model('Engineer');
  const eng = await Engineer.findById(req.params.id);
  if (!eng) throw bad('Engineer not found', 404);
  const b = req.body || {};

  if (b.vendorId !== undefined) {
    if (b.vendorId === null || b.vendorId === '') {
      eng.vendorId = null;
      eng.engineerType = 'freelancer';
      eng.vendorApprovalStatus = 'not_required';
    } else {
      if (!isId(b.vendorId)) throw bad('Invalid vendor id');
      const vendor = await model('Vendor').findById(b.vendorId).select('approvalStatus').lean();
      if (!vendor) throw bad('Vendor not found', 404);
      if (vendor.approvalStatus !== 'approved') throw bad('Vendor is not approved');
      eng.vendorId = b.vendorId;
      eng.engineerType = 'vendor_engineer';
      eng.vendorApprovalStatus = 'approved';
    }
  }
  if (Array.isArray(b.serviceCategories)) eng.serviceCategories = b.serviceCategories.map(String);
  if (Array.isArray(b.subServices)) {
    eng.subServices = b.subServices.filter((s) => s && (s.subServiceId || s.name)).map((s) => ({
      subServiceId: isId(s.subServiceId) ? s.subServiceId : undefined, name: s.name, skills: s.skills || [], customSkills: s.customSkills || []
    }));
  }
  if (Array.isArray(b.secondarySkills)) eng.secondarySkills = b.secondarySkills.map(String);
  const coords = applyLocation(eng, b);
  if (coords) {
    eng.location = { lat: coords.la, lng: coords.ln, updatedAt: new Date() };
    eng.geoLocation = { type: 'Point', coordinates: [coords.ln, coords.la] };
  }
  setAvailability(eng, b);
  await eng.save();
  res.json({
    success: true,
    message: 'Engineer updated',
    data: {
      id: eng._id, engineerType: eng.engineerType, vendorId: eng.vendorId, serviceCategories: eng.serviceCategories,
      subServices: (eng.subServices || []).map((s) => s.name), address: eng.address, geoLocation: eng.geoLocation,
      availability: eng.availability, status: eng.status
    }
  });
}));

router.patch('/workers/:id/admin-controls', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid worker id');
  const worker = await model('Worker').findById(req.params.id);
  if (!worker) throw bad('Worker not found', 404);
  const b = req.body || {};
  if (Array.isArray(b.workerServices)) {
    for (const ws of b.workerServices) {
      if (!isId(ws.categoryId) || !isId(ws.serviceId)) throw bad('Each service needs a valid categoryId and serviceId');
    }
    worker.workerServices = b.workerServices.map((ws) => ({
      categoryId: ws.categoryId, serviceId: ws.serviceId, experienceYears: ws.experienceYears || 0, experienceMonths: ws.experienceMonths || 0, specificSkills: ws.specificSkills || []
    }));
    worker.serviceCategoryRefs = [...new Set(b.workerServices.map((ws) => String(ws.categoryId)))];
  }
  const coords = applyLocation(worker, b);
  if (coords) worker.location = { type: 'Point', coordinates: [coords.ln, coords.la], updatedAt: new Date() };
  setAvailability(worker, b);
  await worker.save();
  res.json({
    success: true,
    message: 'Worker updated',
    data: { id: worker._id, workerServices: worker.workerServices, address: worker.address, location: worker.location, availability: worker.availability, status: worker.status }
  });
}));

// ── Vendors ───────────────────────────────────────────────────────────────
router.patch('/vendors/:id/commission', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid vendor id');
  const { percent, reason } = req.body || {};
  const value = percent === null || percent === '' ? null : Number(percent);
  if (value !== null && !(value >= 0 && value <= 100)) throw bad('Commission must be between 0 and 100');
  if (!String(reason || '').trim()) throw bad('A reason is required for commission changes');
  const vendor = await model('Vendor').findByIdAndUpdate(req.params.id, { $set: { commissionOverride: value } }, { new: true }).select('name businessName commissionOverride');
  if (!vendor) throw bad('Vendor not found', 404);
  res.json({ success: true, message: value === null ? 'Vendor now uses the default commission' : `Vendor commission set to ${value}%`, data: vendor });
}));

router.get('/vendors/:id/performance', wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid vendor id');
  const vid = new mongoose.Types.ObjectId(req.params.id);
  const [b2c, b2b, engineers, reviews] = await Promise.all([
    model('Booking').aggregate([{ $match: { vendorId: vid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    model('B2BJob').aggregate([
      { $match: { assignedVendorId: vid } },
      { $group: {
        _id: null, total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $in: ['$status', ['completed', 'closed']] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'rejected', 'failed']] }, 1, 0] } },
        slaBreached: { $sum: { $cond: [{ $and: [{ $ifNull: ['$slaDueAt', false] }, { $ifNull: ['$completedAt', false] }, { $gt: ['$completedAt', '$slaDueAt'] }] }, 1, 0] } },
        avgCompletionMins: { $avg: { $cond: [{ $and: [{ $ifNull: ['$completedAt', false] }, { $ifNull: ['$acceptedAt', false] }] }, { $divide: [{ $subtract: ['$completedAt', '$acceptedAt'] }, 60000] }, null] } }
      } }
    ]),
    model('Engineer').countDocuments({ vendorId: vid, approvalStatus: 'approved' }),
    model('Vendor').findById(vid).select('rating totalReviews commissionOverride').lean()
  ]);
  const count = (arr, states) => arr.filter((r) => states.includes(r._id)).reduce((a, r) => a + r.n, 0);
  const b2cTotal = b2c.reduce((a, r) => a + r.n, 0);
  const s = b2b[0] || { total: 0, completed: 0, cancelled: 0, slaBreached: 0, avgCompletionMins: null };
  const completed = count(b2c, ['completed', 'paid', 'closed']) + s.completed;
  const total = b2cTotal + s.total;
  const cancelled = count(b2c, ['cancelled', 'rejected']) + s.cancelled;
  res.json({
    success: true,
    data: {
      jobs: { total, completed, cancelled, b2c: b2cTotal, b2b: s.total },
      completionRate: total ? Math.round((completed / total) * 1000) / 10 : null,
      cancellationRate: total ? Math.round((cancelled / total) * 1000) / 10 : null,
      slaCompliance: s.completed ? Math.round(((s.completed - s.slaBreached) / s.completed) * 1000) / 10 : null,
      avgCompletionMins: s.avgCompletionMins ? Math.round(s.avgCompletionMins) : null,
      rating: reviews?.rating || null,
      reviews: reviews?.totalReviews || 0,
      activeEngineers: engineers,
      commissionOverride: reviews?.commissionOverride ?? null
    }
  });
}));

module.exports = router;
