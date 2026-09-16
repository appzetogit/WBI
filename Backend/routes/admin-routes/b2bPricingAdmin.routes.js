const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  listPricingRules,
  getPricingRule,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  previewPricing
} = require('../../controllers/adminControllers/b2bPricingAdminController');

// Every route here is admin-only. Applied at router level so a new handler
// can never be added without authorization.
router.use(authenticate, isAdmin);

router.get('/', listPricingRules);
router.post('/', createPricingRule);
router.post('/preview', previewPricing);
router.get('/:id', getPricingRule);
router.put('/:id', updatePricingRule);
router.delete('/:id', deletePricingRule);

module.exports = router;
