/**
 * Booking emails from one place.
 *
 * Booking status is changed from many controllers (user, vendor, worker,
 * admin, schedulers). A global Mongoose plugin on the Booking model watches
 * `save()` and emails the customer (and the vendor on cancellation or
 * reschedule) when the status moves to a customer-relevant step or the
 * visit is rescheduled. "Booking created" and "completed" already have their
 * own emails and are skipped here.
 *
 * Changes made with findByIdAndUpdate (no save) are not seen by this hook.
 * `register()` must run before the Booking model compiles.
 */
const mongoose = require('mongoose');

/** status -> what the customer is told */
const CUSTOMER_STEPS = {
  confirmed: ['Booking confirmed', 'Your booking is confirmed.'],
  accepted: ['Booking confirmed', 'Your booking has been accepted.'],
  scheduled: ['Booking scheduled', 'Your booking has been scheduled.'],
  worker_assigned: ['Professional assigned', 'A professional has been assigned to your booking.'],
  assigned: ['Professional assigned', 'A professional has been assigned to your booking.'],
  awaiting_payment: ['Booking accepted — payment needed', 'Your booking was accepted. Please complete the payment to confirm it.'],
  journey_started: ['Your professional is on the way', 'Your professional has started the journey to your location.'],
  arrived: ['Your professional has arrived', 'Your professional has reached your location.']
};

function bookingData(b, extra = {}) {
  return {
    bookingId: String(b._id),
    bookingNumber: b.bookingNumber,
    serviceName: b.serviceName || b.service?.serviceName,
    scheduledDate: b.scheduledDate,
    scheduledTime: b.scheduledTime,
    amount: b.finalAmount,
    status: b.status,
    ...extra
  };
}

function emitBookingMail(b, { statusChanged, rescheduled }) {
  const { emitAsync } = require('./notificationOrchestrator.service');
  const status = b.status;

  if (status === 'cancelled' && statusChanged) {
    const data = bookingData(b, {
      cancelledBy: b.cancelledBy || undefined,
      reason: b.cancellationReason || undefined,
      refundedAmount: b.refundedAmount || undefined,
      stamp: new Date(b.cancelledAt || Date.now()).getTime()
    });
    if (b.userId) emitAsync('booking_cancelled', { targets: { userId: b.userId }, data });
    if (b.vendorId) emitAsync('booking_cancelled', { targets: { vendorId: b.vendorId }, data });
    return;
  }

  if (rescheduled && !['cancelled', 'completed'].includes(status)) {
    const data = bookingData(b, { stamp: new Date(b.scheduledDate || Date.now()).getTime() });
    if (b.userId) emitAsync('booking_rescheduled', { targets: { userId: b.userId }, data });
    if (b.vendorId) emitAsync('booking_rescheduled', { targets: { vendorId: b.vendorId }, data });
  }

  if (statusChanged && CUSTOMER_STEPS[status] && b.userId) {
    const [title, message] = CUSTOMER_STEPS[status];
    emitAsync('booking_status_update', {
      targets: { userId: b.userId },
      data: bookingData(b, { title, message })
    });
  }
}

let registered = false;

function register() {
  if (registered) return;
  registered = true;

  mongoose.plugin((schema) => {
    if (!schema.path('bookingNumber') || !schema.path('userId')) return; // Booking-shaped schemas only

    schema.pre('save', function trackBooking(next) {
      this.$locals.bookingMail = this.isNew
        ? null
        : {
          statusChanged: this.isModified('status'),
          rescheduled: this.isModified('scheduledDate') || this.isModified('scheduledTime')
        };
      next();
    });

    schema.post('save', function mailBooking(doc) {
      const flags = doc.$locals?.bookingMail;
      if (!flags || (!flags.statusChanged && !flags.rescheduled)) return;
      doc.$locals.bookingMail = null;
      try {
        emitBookingMail(doc, flags);
      } catch (err) {
        console.warn('[bookingMail] skipped:', err.message);
      }
    });
  });
}

module.exports = { register, CUSTOMER_STEPS };
