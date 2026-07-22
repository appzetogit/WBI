const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getTools, createTool, updateTool, deleteTool,
  getConfig, updateConfig
} = require('../../controllers/adminControllers/adminEngineerConfigController');
const couponAdmin = require('../../controllers/adminControllers/adminEngineerCouponController');

router.use(authenticate, isAdmin);

router.get('/engineer-tools', getTools);
router.post('/engineer-tools', createTool);
router.patch('/engineer-tools/:id', updateTool);
router.delete('/engineer-tools/:id', deleteTool);

router.get('/engineer-coupons', couponAdmin.listCoupons);
router.post('/engineer-coupons', couponAdmin.createCoupon);
router.patch('/engineer-coupons/:id', couponAdmin.updateCoupon);
router.delete('/engineer-coupons/:id', couponAdmin.deleteCoupon);
router.patch('/engineer-coupons/:id/toggle', couponAdmin.toggleCoupon);

router.get('/engineer-offer-banners', couponAdmin.listBanners);
router.post('/engineer-offer-banners', couponAdmin.createBanner);
router.patch('/engineer-offer-banners/:id', couponAdmin.updateBanner);
router.delete('/engineer-offer-banners/:id', couponAdmin.deleteBanner);

router.get('/engineer-coupon-analytics', couponAdmin.getAnalytics);
router.get('/engineer-coupon-redemptions/export', couponAdmin.exportRedemptions);

router.get('/engineer-registration-config', getConfig);
router.patch('/engineer-registration-config', updateConfig);

module.exports = router;
