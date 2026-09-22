const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  initiateCashCollection,
  initiateOnlineCollection,
  verifyOnlinePayment,
  confirmManualOnlinePayment,
  confirmCashCollection,
  customerConfirmPayment,
  getCashCollectionStatus
} = require('../../controllers/bookingControllers/cashCollectionController');

const mongoose = require('mongoose');
const Booking = require('../../models/Booking');

// All routes require authentication
router.use(authenticate);

/**
 * Only the booking's own participants may act on its payment:
 *   collector — the assigned worker/engineer or the owning vendor (or admin)
 *   customer  — the user who made the booking (or admin)
 *   any       — either of the above
 */
const bookingParticipant = (who) => async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid booking id' });
    }
    const booking = await Booking.findById(id).select('userId workerId engineerId vendorId').lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const role = String(req.userRole || '').toUpperCase();
    const uid = String(req.user?._id || req.user?.id || '');
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return next();

    const isCollector =
      (role === 'VENDOR' && String(booking.vendorId || '') === uid) ||
      (['WORKER', 'ENGINEER'].includes(role) &&
        [booking.workerId, booking.engineerId].some((x) => x && String(x) === uid));
    const isCustomer = role === 'USER' && String(booking.userId || '') === uid;

    const allowed = who === 'collector' ? isCollector : who === 'customer' ? isCustomer : isCollector || isCustomer;
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'You do not have access to this booking payment' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to verify booking access' });
  }
};

// Vendor/Worker routes
router.post('/:id/initiate', bookingParticipant('collector'), initiateCashCollection);
router.post('/:id/initiate-online', bookingParticipant('collector'), initiateOnlineCollection);
router.post('/:id/confirm', bookingParticipant('collector'), confirmCashCollection);

// Explicit verification route
router.post('/:id/verify-online', bookingParticipant('any'), verifyOnlinePayment);
router.post('/:id/confirm-manual-online', bookingParticipant('collector'), confirmManualOnlinePayment);

// Customer route
router.post('/:id/customer-confirm', bookingParticipant('customer'), customerConfirmPayment);

// Status route (read-only check)
router.get('/:id/status', bookingParticipant('any'), getCashCollectionStatus);

module.exports = router;
