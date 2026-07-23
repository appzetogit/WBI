const RazorpayWebhookEvent = require('../../models/RazorpayWebhookEvent');
const Booking = require('../../models/Booking');
const UserPaymentMethod = require('../../models/UserPaymentMethod');
const razorpayService = require('../../services/razorpayService');
const { writeAudit } = require('../../services/userPaymentMethod.service');

/**
 * Unified Razorpay payments webhook (raw body).
 * POST /api/webhooks/razorpay/payments
 */
exports.handlePaymentsWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body; // Buffer from express.raw

    if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
      console.error('[payment.webhook] invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
    const eventId = payload.id || `${payload.event}:${payload.created_at}:${payload.payload?.payment?.entity?.id || ''}`;
    const event = payload.event;

    try {
      await RazorpayWebhookEvent.create({
        eventId,
        event,
        payload,
        status: 'processed'
      });
    } catch (e) {
      if (e?.code === 11000) {
        console.log('[payment.webhook] duplicate event', eventId);
        return res.json({ success: true, duplicate: true });
      }
      throw e;
    }

    console.log('[payment.webhook]', JSON.stringify({ event, eventId }));

    const payment = payload.payload?.payment?.entity;
    const refund = payload.payload?.refund?.entity;

    if (event === 'payment.captured' && payment) {
      await onPaymentCaptured(payment);
    } else if (event === 'payment.failed' && payment) {
      await onPaymentFailed(payment);
    } else if (event === 'refund.processed' && refund) {
      await onRefundProcessed(refund, payment);
    }

    await writeAudit({
      actorRole: 'system',
      action: 'webhook_' + event,
      meta: { eventId, paymentId: payment?.id, refundId: refund?.id }
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[payment.webhook] error:', err.message);
    try {
      // best-effort mark failed if we have id
    } catch (_) { /* ignore */ }
    return res.status(500).json({ success: false, message: err.message });
  }
};

async function onPaymentCaptured(payment) {
  const notes = payment.notes || {};
  if (notes.purpose === 'instrument_verify') {
    // Confirm path is client-driven; webhook ensures method linkage if needed
    const existing = await UserPaymentMethod.findOne({
      verificationPaymentId: payment.id,
      deletedAt: null
    });
    if (existing && existing.status === 'pending_verification') {
      existing.status = 'active';
      existing.isVerified = true;
      await existing.save();
    }
    return;
  }

  if (notes.bookingId) {
    const booking = await Booking.findById(notes.bookingId);
    if (booking && booking.paymentStatus !== 'success' && booking.paymentStatus !== 'Success') {
      booking.paymentStatus = 'success';
      booking.razorpayPaymentId = payment.id;
      if (payment.order_id) booking.razorpayOrderId = payment.order_id;
      if (!booking.paymentMethod || booking.paymentMethod === 'online') {
        booking.paymentMethod = payment.method || 'razorpay';
      }
      await booking.save();
      try {
        if (global.io && booking.userId) {
          global.io.to(`user:${booking.userId}`).emit('payment:update', {
            type: 'booking_paid',
            bookingId: String(booking._id),
            paymentId: payment.id
          });
        }
      } catch (_) { /* ignore */ }
    }
  }
}

async function onPaymentFailed(payment) {
  const notes = payment.notes || {};
  if (notes.bookingId) {
    const booking = await Booking.findById(notes.bookingId);
    if (booking && booking.paymentStatus !== 'success') {
      booking.paymentStatus = 'failed';
      await booking.save();
      try {
        if (global.io && booking.userId) {
          global.io.to(`user:${booking.userId}`).emit('payment:update', {
            type: 'booking_payment_failed',
            bookingId: String(booking._id)
          });
        }
      } catch (_) { /* ignore */ }
    }
  }
}

async function onRefundProcessed(refund, payment) {
  if (!payment?.id && refund?.payment_id) {
    // attach refund id onto instrument verification if matching
    await UserPaymentMethod.updateOne(
      { verificationPaymentId: refund.payment_id },
      { $set: { verificationRefundId: refund.id } }
    );
  }
}
