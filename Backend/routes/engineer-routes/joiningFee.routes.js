const express = require('express');
const router = express.Router();
const {
  validateCoupon,
  createJoiningFeeOrder,
  verifyJoiningFeePayment
} = require('../../controllers/engineerControllers/engineerJoiningFeeController');

router.post('/coupon/validate', validateCoupon);
router.post('/joining-fee/create-order', createJoiningFeeOrder);
router.post('/joining-fee/verify-payment', verifyJoiningFeePayment);

module.exports = router;
