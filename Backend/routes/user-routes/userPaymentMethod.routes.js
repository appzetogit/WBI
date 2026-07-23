const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/userControllers/userPaymentMethodController');

router.use(authenticate, isUser);

router.get('/config', ctrl.getConfig);
router.get('/', ctrl.listMethods);

router.post(
  '/instruments/start',
  body('methodType').optional().isIn(['upi', 'card', 'netbanking', 'wallet']),
  ctrl.startInstrument
);
router.post(
  '/instruments/confirm',
  body('razorpay_order_id').trim().notEmpty(),
  body('razorpay_payment_id').trim().notEmpty(),
  body('razorpay_signature').trim().notEmpty(),
  ctrl.confirmInstrument
);

router.post('/upi/verify', body('vpa').trim().notEmpty(), ctrl.verifyUpi);
router.post('/cod-preference', body('enabled').isBoolean(), ctrl.setCodPreference);

router.get('/history', ctrl.getHistory);
router.get('/history/:id/receipt', ctrl.getReceipt);
router.post('/history/:id/retry', ctrl.retryPayment);

router.post('/sensitive/otp', ctrl.sendSensitiveOtp);
router.patch('/:id/default', ctrl.setDefault);
router.delete('/:id', ctrl.deleteMethod);

module.exports = router;
