const express = require('express');
const router = express.Router();
const rateLimiter = require('../../middleware/rateLimiter');
const {
  validateVendorCode,
  resolveInviteToken
} = require('../../controllers/engineerControllers/vendorCodeController');

const validateLimiter = rateLimiter.vendorCodeValidateLimiter || rateLimiter;

router.post('/validate-vendor-code', validateLimiter, validateVendorCode);
router.get('/invite/:token', validateLimiter, resolveInviteToken);

module.exports = router;
