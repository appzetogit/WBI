/**
 * Dispute workflow: raise (customer / B2B) → in_review → resolved | rejected.
 * Resolving with a refund moves real money: B2C via bookingRefund.service,
 * B2B back to the company wallet through the ledger (idempotent per dispute).
 */
const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const Booking = require('../models/Booking');
const B2BJob = require('../models/B2BJob');

class DisputeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const OPEN = ['open', 'in_review'];

const raiseDispute = async ({ sourceType, sourceId, role, actorId, companyId = null, category, reason, description, attachments }) => {
  if (!mongoose.Types.ObjectId.isValid(sourceId)) throw new DisputeError('Invalid id');
  if (!String(reason || '').trim()) throw new DisputeError('A reason is required');

  let sourceRef; let amount = 0;
  if (sourceType === 'booking') {
    const b = await Booking.findById(sourceId).select('userId bookingNumber finalAmount status').lean();
    if (!b || String(b.userId) !== String(actorId)) throw new DisputeError('Booking not found', 404);
    sourceRef = b.bookingNumber; amount = b.finalAmount || 0;
  } else {
    const j = await B2BJob.findById(sourceId).select('companyId jobId charge pricing.totalAmount').lean();
    if (!j || String(j.companyId) !== String(companyId)) throw new DisputeError('Job not found', 404);
    sourceRef = j.jobId; amount = j.charge || j.pricing?.totalAmount || 0;
  }

  const existing = await Dispute.findOne({ sourceType, sourceId, status: { $in: OPEN } }).lean();
  if (existing) throw new DisputeError(`A dispute is already open for this ${sourceType === 'booking' ? 'booking' : 'job'} (${existing.disputeNumber})`, 409);

  return Dispute.create({
    sourceType, sourceId, sourceRef, raisedByRole: role, raisedById: actorId, companyId,
    category: category || 'other', reason: String(reason).trim(), description, attachments: attachments || [],
    amountInDispute: amount,
    timeline: [{ status: 'open', note: String(reason).trim(), actorRole: role, actorId }]
  });
};

const addNote = async ({ disputeId, note, status, adminId }) => {
  const d = await Dispute.findById(disputeId);
  if (!d) throw new DisputeError('Dispute not found', 404);
  if (!OPEN.includes(d.status)) throw new DisputeError(`Dispute is already ${d.status}`, 409);
  if (status && !OPEN.includes(status)) throw new DisputeError('Use resolve to close a dispute');
  if (status) d.status = status;
  if (!d.assignedTo) d.assignedTo = adminId;
  d.timeline.push({ status: d.status, note, actorRole: 'admin', actorId: adminId });
  await d.save();
  return d;
};

const resolveDispute = async ({ disputeId, resolution, note, refundAmount, adminId, reject = false }) => {
  const d = await Dispute.findById(disputeId);
  if (!d) throw new DisputeError('Dispute not found', 404);
  if (!OPEN.includes(d.status)) throw new DisputeError(`Dispute is already ${d.status}`, 409);
  if (!String(note || '').trim()) throw new DisputeError('A resolution note is required');

  if (reject) {
    d.status = 'rejected';
    d.resolution = 'no_action';
  } else {
    if (!['refund', 'partial_refund', 'rework', 'no_action'].includes(resolution)) throw new DisputeError('Unknown resolution');
    if (resolution === 'refund' || resolution === 'partial_refund') {
      if (d.sourceType === 'booking') {
        const { refundBooking } = require('./bookingRefund.service');
        const out = await refundBooking({
          bookingId: d.sourceId, amount: resolution === 'refund' ? null : refundAmount,
          reason: `Dispute ${d.disputeNumber}: ${note}`, adminId, disputeId: d._id
        });
        d.refundAmount = out.refund.amount;
        d.refundRef = out.refund.refundId || out.refund.method;
      } else {
        const job = await B2BJob.findById(d.sourceId).select('companyId charge pricing.totalAmount jobId').lean();
        const cap = Number(job?.charge || job?.pricing?.totalAmount || 0);
        const amt = resolution === 'refund' ? cap : Math.round(Number(refundAmount) * 100) / 100;
        if (!(amt > 0) || amt > cap) throw new DisputeError(`Refund must be between ₹1 and ₹${cap}`);
        const walletLedger = require('./b2bWalletLedger.service');
        const posted = await walletLedger.refund({
          companyId: job.companyId, amount: amt, jobId: job._id,
          reason: `Dispute ${d.disputeNumber}: ${note}`,
          actor: { actorId: adminId, role: 'admin' },
          idempotencyKey: `dispute-refund:${d._id}`
        });
        d.refundAmount = amt;
        d.refundRef = posted?.transaction?.transactionId || 'wallet';
      }
    }
    d.status = 'resolved';
    d.resolution = resolution;
  }
  d.resolutionNote = String(note).trim();
  d.resolvedBy = adminId;
  d.resolvedAt = new Date();
  d.timeline.push({ status: d.status, note: d.resolutionNote, actorRole: 'admin', actorId: adminId });
  await d.save();
  return d;
};

module.exports = { raiseDispute, addNote, resolveDispute, DisputeError };
