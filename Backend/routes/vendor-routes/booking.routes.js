const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isVendor } = require('../../middleware/roleMiddleware');
const {
  getVendorBookings,
  getBookingById,
  acceptBooking,
  rejectBooking,
  assignWorker,
  updateBookingStatus,
  addVendorNotes,
  startSelfJob,
  vendorReachedLocation,
  verifySelfVisit,
  completeSelfJob,
  collectSelfCash,
  payWorker,
  getVendorRatings,
  getPendingBookings
} = require('../../controllers/bookingControllers/vendorBookingController');

// Validation rules
const rejectBookingValidation = [
  body('reason').optional().trim()
];

const assignWorkerValidation = [
  body('workerId').custom((value) => {
    if (value === 'SELF') return true;
    if (mongoose.Types.ObjectId.isValid(value)) return true;
    throw new Error('Valid worker ID or "SELF" is required');
  })
];

const updateStatusValidation = [
  body('status').isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'])
    .withMessage('Invalid status')
];

const addNotesValidation = [
  body().custom((value, { req }) => {
    const { notes, structuredNotes } = req.body || {};
    const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
    const hasStructured = !!(
      structuredNotes &&
      typeof structuredNotes === 'object' &&
      Object.values(structuredNotes).some(v => typeof v === 'string' && v.trim().length > 0)
    );
    if (hasNotes || hasStructured) {
      if (!hasNotes && hasStructured) {
        req.body.notes = [
          structuredNotes.issueFound,
          structuredNotes.resolutionDetails,
          structuredNotes.additionalRemarks
        ].filter(v => typeof v === 'string' && v.trim().length > 0).join('\n') || 'Work notes updated';
      }
      return true;
    }
    throw new Error('Notes are required');
  })
];

// Routes
router.get('/pending', authenticate, isVendor, getPendingBookings); // Fetch missed alerts on reconnect
router.get('/ratings', authenticate, isVendor, getVendorRatings);
router.get('/', authenticate, isVendor, getVendorBookings);
router.get('/:id', authenticate, isVendor, getBookingById);
router.post('/:id/accept', authenticate, isVendor, acceptBooking);
router.post('/:id/reject', authenticate, isVendor, rejectBookingValidation, rejectBooking);
router.post('/:id/assign-worker', authenticate, isVendor, assignWorkerValidation, assignWorker);
router.put('/:id/status', authenticate, isVendor, updateStatusValidation, updateBookingStatus);
router.post('/:id/notes', authenticate, isVendor, addNotesValidation, addVendorNotes);

// Self-Job Routes
router.post('/:id/self/start', authenticate, isVendor, startSelfJob);
router.post('/:id/self/reached', authenticate, isVendor, vendorReachedLocation);
router.post('/:id/self/visit/verify', authenticate, isVendor, verifySelfVisit);
router.post('/:id/self/complete', authenticate, isVendor, completeSelfJob);
router.post('/:id/self/payment/collect', authenticate, isVendor, collectSelfCash);

// Payment Route
router.post('/:id/pay-worker', authenticate, isVendor, payWorker);

module.exports = router;

