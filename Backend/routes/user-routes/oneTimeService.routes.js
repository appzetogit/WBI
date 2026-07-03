const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getServiceDetails,
  getServiceDetailsOptimized,
  getServiceBrands,
  getServiceIssues,
  getServicePackages,
  getServiceEstimate,
  getPricePreview,
  toggleWishlist,
  getWishlistStatus,
  getServiceSubServices
} = require('../../controllers/userControllers/oneTimeServiceController');

// All these routes are public as users can browse before login
// For adding to cart, that will be handled by Cart routes

router.get('/search', exports.searchServices || require('../../controllers/userControllers/oneTimeServiceController').searchServices);
router.get('/most-booked', exports.getMostBooked || require('../../controllers/userControllers/oneTimeServiceController').getMostBooked);

router.get('/:slug/detail', getServiceDetailsOptimized);
router.get('/:slug', getServiceDetails);
router.get('/:serviceId/brands', getServiceBrands);
router.get('/:serviceId/issues', getServiceIssues);
router.get('/:serviceId/problems', getServiceIssues);
router.get('/:serviceId/packages', getServicePackages);
router.get('/:serviceId/estimate', getServiceEstimate);
router.post('/price-preview', getPricePreview);

// Wishlist endpoints
router.post('/:serviceId/wishlist', authenticate, toggleWishlist);
router.get('/:serviceId/wishlist-status', authenticate, getWishlistStatus);

// Sub-services endpoint
router.get('/:serviceId/sub-services', getServiceSubServices);

module.exports = router;
