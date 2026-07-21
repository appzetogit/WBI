const express = require('express');
const router = express.Router();
const {
  validateCoupon,
  createJoiningFeeOrder,
  verifyJoiningFeePayment
} = require('../../controllers/engineerControllers/engineerJoiningFeeController');
const rateLimiter = require('../../middleware/rateLimiter');
const { paymentLimiter, paymentVerifyLimiter, strictApiLimiter } = rateLimiter;

// Coupon — light limit
router.post('/coupon/validate', strictApiLimiter, validateCoupon);

// Order creation — strict (prevents duplicate paid orders)
router.post('/joining-fee/create-order', paymentLimiter, createJoiningFeeOrder);

// Verify — separate higher limit so post-payment verify is not blocked after retries
router.post('/joining-fee/verify-payment', paymentVerifyLimiter, verifyJoiningFeePayment);

module.exports = router;
