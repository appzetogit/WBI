const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const BookingEvent = require('../models/BookingEvent');
const { getIO } = require('../sockets');
const { sendNotificationToUser } = require('./firebaseAdmin');

/** Guard: Only run DB queries if Mongoose is connected */
const isDbConnected = () => mongoose.connection.readyState === 1;

async function logBookingEvent(bookingId, statusFrom, statusTo, triggeredBy, remarks) {
  try {
    await BookingEvent.create({
      bookingId,
      statusFrom,
      statusTo,
      triggeredBy,
      remarks
    });
  } catch (err) {
    console.error('Failed to log booking event in scheduler:', err);
  }
}

async function runPaymentExpiryChecks() {
  if (!isDbConnected()) {
    console.warn('[PaymentExpiryScheduler] Skipping — MongoDB not connected.');
    return;
  }

  try {
    const io = getIO();
    const now = new Date();

    // 1. Check completed/initiated but unpaid bookings
    const unpaidBookings = await Booking.find({
      status: { $in: ['completed_pending_payment', 'payment_initiated'] }
    });

    for (const booking of unpaidBookings) {
      const baseTime = booking.visitedAt || booking.updatedAt;
      if (!baseTime) continue;

      const elapsedMs = now - new Date(baseTime);
      const elapsedMins = elapsedMs / (60 * 1000);

      // CASE 1.1 — User doesn't pay within 30 minutes: Send reminder
      if (elapsedMins >= 30 && elapsedMins < 120) {
        // Use custom property/flag inside metadata to prevent repeat alerts
        const metadata = booking.structuredNotes || {};
        if (!metadata.paymentReminderSent) {
          console.log(`[PaymentExpiryScheduler] Sending payment reminder for Booking: ${booking.bookingNumber}`);
          try {
            await sendNotificationToUser(booking.userId, {
              title: 'Payment Reminder 💳',
              body: `Please pay ₹${booking.finalAmount} to complete your service.`,
              data: { bookingId: booking._id.toString(), type: 'payment_reminder' }
            });
            booking.structuredNotes = { ...metadata, paymentReminderSent: true };
            await booking.save();
          } catch (err) {
            console.warn('[FCM] Payment reminder notification failed:', err.message);
          }
        }
      }

      // CASE 1.2 — User doesn't pay within 2 hours: Mark DISPUTED & Alert Admin
      if (elapsedMins >= 120) {
        console.log(`[PaymentExpiryScheduler] Booking ${booking.bookingNumber} unpaid for >2h. Marking as DISPUTED.`);
        const oldStatus = booking.status;
        booking.status = 'disputed';
        booking.cancellationReason = 'Payment timeout: unpaid for more than 2 hours.';
        await booking.save();

        await logBookingEvent(booking._id, oldStatus, 'disputed', 'system', 'Booking marked disputed automatically due to payment timeout exceeding 2 hours.');

        // Emit Socket notifications
        if (io) {
          io.to(`booking_${booking._id.toString()}`).emit('booking:statusUpdated', {
            bookingId: booking._id,
            status: 'disputed',
            message: 'Unpaid booking timed out and marked disputed.'
          });
          io.to('admin').emit('admin:bookingActionRequired', {
            bookingId: booking._id,
            message: `Booking ${booking.bookingNumber} flagged as DISPUTED due to 2-hour payment timeout.`
          });
        }
      }
    }

    // 2. Check PAID bookings without OTP 2 entry for >24 hours: Auto-complete
    const paidBookings = await Booking.find({ status: 'paid' });
    for (const booking of paidBookings) {
      const baseTime = booking.paidAt || booking.updatedAt;
      if (!baseTime) continue;

      const elapsedMs = now - new Date(baseTime);
      const elapsedHours = elapsedMs / (60 * 60 * 1000);

      // CASE 5 — Payment done, OTP 2 not entered by user (forgets)
      if (elapsedHours >= 24) {
        console.log(`[PaymentExpiryScheduler] Booking ${booking.bookingNumber} paid but OTP 2 unentered for >24h. Auto-completing.`);
        booking.status = 'completed';
        booking.completedAt = now;
        await booking.save();

        // Release worker balance & increment stats
        await Worker.findByIdAndUpdate(booking.workerId, {
          $inc: { completedJobs: 1, totalJobs: 1 },
          $set: { status: 'ONLINE' }
        });

        await logBookingEvent(booking._id, 'paid', 'completed', 'system', 'Booking auto-completed after 24 hours of payment without client entering OTP 2.');

        // Emit socket events
        if (io) {
          io.to(`booking_${booking._id.toString()}`).emit('booking:statusUpdated', {
            bookingId: booking._id,
            status: 'completed'
          });
        }
      }
    }
  } catch (error) {
    console.error('[PaymentExpiryScheduler] Error running checks:', error);
  }
}

function startPaymentExpiryScheduler() {
  console.log('⏰ Starting Payment Expiry Scheduler (polling every 60 seconds)...');
  setInterval(runPaymentExpiryChecks, 60000); // 60s
}

module.exports = { startPaymentExpiryScheduler, runPaymentExpiryChecks };
