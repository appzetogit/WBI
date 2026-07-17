const express = require('express');
const router = express.Router();
const {
  validateCoupon,
  createJoiningFeeOrder,
  verifyJoiningFeePayment
} = require('../../controllers/engineerControllers/engineerJoiningFeeController');
const rateLimiter = require('../../middleware/rateLimiter');
const { paymentLimiter, strictApiLimiter } = rateLimiter;

// LAYER 3: Coupon — max 10 per 10min (light)
router.post('/coupon/validate', strictApiLimiter, validateCoupon);

// LAYER 3: Payment order creation — max 5 per 10 minutes (prevents duplicate orders)
router.post('/joining-fee/create-order', paymentLimiter, createJoiningFeeOrder);

// LAYER 3: Payment verify — max 5 per 10 minutes
router.post('/joining-fee/verify-payment', paymentLimiter, verifyJoiningFeePayment);

module.exports = router;
