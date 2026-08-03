const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');
const {
  getCmsContentBySlug,
  getAllCmsContents,
  updateCmsContent
} = require('../controllers/cmsContentController');

// Public routes
router.get('/public/:slug', getCmsContentBySlug);

// Admin routes
router.get('/admin', authenticate, isAdmin, getAllCmsContents);
router.get('/admin/:slug', authenticate, isAdmin, getCmsContentBySlug);
router.put('/admin/:slug', authenticate, isAdmin, updateCmsContent);

module.exports = router;
