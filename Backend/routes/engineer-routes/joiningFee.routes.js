const express = require('express');
const router = express.Router();
const {
  validateCoupon,
  createJoiningFeeOrder,
  verifyJoiningFeePayment
} = require('../../controllers/engineerControllers/engineerJoiningFeeController');
const { getActiveOffers } = require('../../controllers/engineerControllers/engineerOffersController');
const rateLimiter = require('../../middleware/rateLimiter');
const { paymentLimiter, paymentVerifyLimiter, strictApiLimiter } = rateLimiter;

router.get('/offers/active', getActiveOffers);
router.post('/coupon/validate', strictApiLimiter, validateCoupon);
router.post('/joining-fee/create-order', paymentLimiter, createJoiningFeeOrder);
router.post('/joining-fee/verify-payment', paymentVerifyLimiter, verifyJoiningFeePayment);

module.exports = router;
