const express = require('express');
const router = express.Router();
const reviewController = require('../../controllers/adminControllers/reviewController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

/**
 * NOTE: this router is currently NOT mounted — server.js uses
 * reviewManagement.routes instead. It previously destructured
 * `{ protect, admin }` from authMiddleware, which exports neither, so
 * `router.use(undefined)` would have thrown the moment anyone mounted it.
 * Corrected to the real middleware so it is safe to wire up.
 */
router.use(authenticate, isAdmin);

// Route to get all reviews (with status filtering)
router.get('/', reviewController.getAllReviews);

// Route to update a review's status (approve/reject)
router.put('/:id/status', reviewController.updateReviewStatus);

module.exports = router;
