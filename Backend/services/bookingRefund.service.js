/**
 * Refund a B2C booking for real: online payments go back through Razorpay,
 * cash / collected payments are credited to the customer's wallet. Every
 * refund is capped at what is still refundable and recorded on the booking
 * and as a 'refund' Transaction.
 */
const Booking = require('../models/Booking');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const razorpayService = require('./razorpayService');

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const PAID = ['success', 'collected_by_vendor'];

class RefundError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const refundableAmount = (booking) =>
  round2(Math.max(0, Number(booking.finalAmount || booking.totalAmount || 0) - Number(booking.refundedAmount || 0)));

const refundBooking = async ({ bookingId, amount, reason, adminId, disputeId = null, toWallet = false }) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new RefundError('Booking not found', 404);
  if (!PAID.includes(booking.paymentStatus)) {
    throw new RefundError(`Nothing to refund — payment status is "${booking.paymentStatus}"`);
  }
  const max = refundableAmount(booking);
  const value = amount === undefined || amount === null || amount === '' ? max : round2(amount);
  if (!(value > 0)) throw new RefundError('Refund amount must be greater than 0');
  if (value > max) throw new RefundError(`Refund exceeds the refundable amount of ₹${max}`);
  if (!String(reason || '').trim()) throw new RefundError('A refund reason is required');

  const online = booking.razorpayPaymentId && booking.paymentStatus === 'success' && !toWallet;
  const entry = { amount: value, reason: String(reason).trim(), disputeId, by: adminId, at: new Date() };

  if (online) {
    const result = await razorpayService.refundPayment(booking.razorpayPaymentId, value, {
      bookingId: String(booking._id), reason: entry.reason
    });
    if (!result.success) throw new RefundError(`Razorpay refund failed: ${result.error}`, 502);
    Object.assign(entry, { method: 'razorpay', refundId: result.refund?.id, status: result.refund?.status === 'processed' ? 'processed' : 'pending' });
  } else {
    await User.updateOne({ _id: booking.userId }, { $inc: { 'wallet.balance': value } });
    Object.assign(entry, { method: 'wallet', status: 'processed' });
  }

  booking.refunds.push(entry);
  booking.refundedAmount = round2(Number(booking.refundedAmount || 0) + value);
  if (booking.refundedAmount >= Number(booking.finalAmount || booking.totalAmount || 0)) {
    booking.paymentStatus = 'refunded';
  }
  await booking.save();

  await Transaction.create({
    userId: booking.userId,
    bookingId: booking._id,
    type: 'refund',
    amount: value,
    status: entry.status === 'failed' ? 'failed' : (entry.status === 'processed' ? 'completed' : 'pending'),
    paymentMethod: entry.method === 'razorpay' ? 'razorpay' : 'wallet',
    description: `Refund ₹${value} for booking #${booking.bookingNumber || booking._id}: ${entry.reason}`,
    referenceId: entry.refundId || String(booking._id),
    metadata: { refundId: entry.refundId, method: entry.method, disputeId, adminId: String(adminId || '') }
  });

  return { booking, refund: entry, refundable: refundableAmount(booking) };
};

module.exports = { refundBooking, refundableAmount, RefundError };
