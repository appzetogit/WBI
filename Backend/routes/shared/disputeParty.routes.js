/**
 * Customer / B2B side of disputes: raise one and follow its progress.
 *   /api/users/disputes  (user token)      sourceType = booking
 *   /api/b2b/disputes    (B2B token)       sourceType = b2b_job
 */
const express = require('express');
const { authenticate } = require('../../middleware/authMiddleware');
const Dispute = require('../../models/Dispute');
const { raiseDispute } = require('../../services/dispute.service');

const build = (role) => {
  const router = express.Router();
  router.use(authenticate);
  router.use((req, res, next) => {
    const r = String(req.userRole || '').toLowerCase();
    if (role === 'user' ? r !== 'user' : r !== 'b2b') return res.status(403).json({ success: false, message: 'Access denied' });
    next();
  });
  const owner = (req) => (role === 'user' ? { raisedById: req.userId } : { companyId: req.companyId });

  router.post('/', async (req, res) => {
    try {
      const { sourceId, bookingId, jobId, category, reason, description, attachments } = req.body || {};
      const d = await raiseDispute({
        sourceType: role === 'user' ? 'booking' : 'b2b_job',
        sourceId: sourceId || bookingId || jobId,
        role, actorId: req.userId, companyId: role === 'b2b' ? req.companyId : null,
        category, reason, description, attachments
      });
      try {
        const io = require('../../sockets').getIO();
        if (io) io.to('admin:wbi').emit('admin:disputeRaised', { disputeId: d._id, disputeNumber: d.disputeNumber });
      } catch (_) { /* non-blocking */ }
      res.status(201).json({ success: true, message: `Dispute ${d.disputeNumber} raised`, data: d });
    } catch (e) {
      res.status(e.status || 500).json({ success: false, message: e.message });
    }
  });

  router.get('/', async (req, res) => {
    const rows = await Dispute.find(owner(req)).sort({ createdAt: -1 }).limit(100)
      .select('-timeline.actorId').lean();
    res.json({ success: true, data: rows });
  });

  router.get('/:id', async (req, res) => {
    const d = await Dispute.findOne({ _id: req.params.id, ...owner(req) }).select('-timeline.actorId').lean().catch(() => null);
    if (!d) return res.status(404).json({ success: false, message: 'Dispute not found' });
    res.json({ success: true, data: d });
  });
  return router;
};

module.exports = { userDisputeRoutes: build('user'), b2bDisputeRoutes: build('b2b') };
