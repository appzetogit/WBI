/** Admin dispute desk. Permissions: disputes.read / disputes.manage (adminAccess guard). */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Dispute = require('../../models/Dispute');
const { addNote, resolveDispute } = require('../../services/dispute.service');

const send = (res, fn) => fn().catch((e) => res.status(e.status || 500).json({ success: false, message: e.message }));

router.get('/disputes', (req, res) => send(res, async () => {
  const { status, sourceType, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (sourceType) filter.sourceType = sourceType;
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ disputeNumber: rx }, { sourceRef: rx }, { reason: rx }];
  }
  const [rows, total, counts] = await Promise.all([
    Dispute.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Dispute.countDocuments(filter),
    Dispute.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
  ]);
  res.json({ success: true, data: rows, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])), pagination: { page, limit, total } });
}));

router.get('/disputes/:id', (req, res) => send(res, async () => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid dispute id' });
  const d = await Dispute.findById(req.params.id).lean();
  if (!d) return res.status(404).json({ success: false, message: 'Dispute not found' });
  const Model = require(`../../models/${d.sourceType === 'booking' ? 'Booking' : 'B2BJob'}`);
  const source = await Model.findById(d.sourceId)
    .select('bookingNumber jobId status paymentStatus finalAmount charge pricing.totalAmount refundedAmount serviceName serviceType customerName companyId userId workerId assignedTo')
    .lean();
  res.json({ success: true, data: { ...d, source } });
}));

router.post('/disputes/:id/notes', (req, res) => send(res, async () => {
  const d = await addNote({ disputeId: req.params.id, note: req.body?.note, status: req.body?.status, adminId: req.user._id });
  res.json({ success: true, message: 'Dispute updated', data: d });
}));

router.post('/disputes/:id/resolve', (req, res) => send(res, async () => {
  const { resolution, note, refundAmount } = req.body || {};
  const d = await resolveDispute({ disputeId: req.params.id, resolution, note, refundAmount, adminId: req.user._id });
  res.json({ success: true, message: `Dispute resolved (${d.resolution})`, data: d });
}));

router.post('/disputes/:id/reject', (req, res) => send(res, async () => {
  const d = await resolveDispute({ disputeId: req.params.id, note: req.body?.note, adminId: req.user._id, reject: true });
  res.json({ success: true, message: 'Dispute rejected', data: d });
}));

module.exports = router;
