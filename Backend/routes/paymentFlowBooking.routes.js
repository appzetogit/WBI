const express = require('express');
const router = express.Router();
const controller = require('../controllers/bookingControllers/paymentFlowBookingController');
const { authenticate } = require('../middleware/authMiddleware');
const multer = require('multer');

// Setup multer for work photos upload
const upload = multer({ dest: 'uploads/' });

// User actions
router.post('/create', authenticate, controller.createBooking);
router.post('/:bookingId/initiate-payment', authenticate, controller.initiatePayment);
router.post('/:bookingId/verify-payment', authenticate, controller.verifyPayment);
router.post('/:bookingId/verify-complete-otp', authenticate, controller.verifyCompleteOtp);
router.post('/:bookingId/rating', authenticate, controller.submitRating);

// Worker actions
router.post('/:bookingId/worker-arrived', authenticate, controller.workerArrived);
router.post('/:bookingId/verify-start-otp', authenticate, controller.verifyStartOtp);
router.post('/:bookingId/upload-work-photos', authenticate, upload.array('images'), controller.uploadWorkPhotos);
router.post('/:bookingId/worker-completed', authenticate, controller.workerCompleted);

// Webhook
router.post('/webhooks/razorpay', controller.razorpayWebhook);

module.exports = router;
