const express = require('express');
const router = express.Router();
const bookingResponseController = require('../../controllers/workerControllers/bookingResponse.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const bookingExecutionController = require('../../controllers/workerControllers/bookingExecution.controller');

// Only field workers / engineers (TazkY) may accept or reject a booking offer —
// an arbitrary authenticated account (vendor, B2B, user) must not be able to
// claim a customer's booking.
const isFieldWorker = (req, res, next) => {
  const role = String(req.userRole || '').toUpperCase();
  if (role !== 'WORKER' && role !== 'ENGINEER') {
    return res.status(403).json({ success: false, message: 'Access denied. Worker role required.' });
  }
  next();
};

router.patch('/:bookingId/accept', authenticate, isFieldWorker, bookingResponseController.acceptBooking);
router.patch('/:bookingId/reject', authenticate, isFieldWorker, bookingResponseController.rejectBooking);

// Execution Flow
router.patch('/:bookingId/start-journey', authenticate, bookingExecutionController.startJourney);
router.patch('/:bookingId/arrived', authenticate, bookingExecutionController.arrived);
router.post('/:bookingId/verify-otp', authenticate, bookingExecutionController.verifyOtp);
router.post('/:bookingId/proofs', authenticate, bookingExecutionController.addProof);
router.patch('/:bookingId/complete', authenticate, bookingExecutionController.completeService);

module.exports = router;
