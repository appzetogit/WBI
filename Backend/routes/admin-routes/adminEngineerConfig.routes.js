const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getTools, createTool, updateTool, deleteTool,
  getCoupons, createCoupon, updateCoupon, deleteCoupon,
  getConfig, updateConfig
} = require('../../controllers/adminControllers/adminEngineerConfigController');

// All routes require authentication and admin role
router.use(authenticate, isAdmin);

// Engineer Tools
router.get('/engineer-tools', getTools);
router.post('/engineer-tools', createTool);
router.patch('/engineer-tools/:id', updateTool);
router.delete('/engineer-tools/:id', deleteTool);

// Engineer Coupons
router.get('/engineer-coupons', getCoupons);
router.post('/engineer-coupons', createCoupon);
router.patch('/engineer-coupons/:id', updateCoupon);
router.delete('/engineer-coupons/:id', deleteCoupon);

// Engineer Registration Config
router.get('/engineer-registration-config', getConfig);
router.patch('/engineer-registration-config', updateConfig);

module.exports = router;
