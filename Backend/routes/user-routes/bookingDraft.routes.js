const express = require('express');
const router = express.Router();
const bookingDraftController = require('../../controllers/userControllers/bookingDraft.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');

router.use(authenticate, isUser);

router.get('/:draftId/review', bookingDraftController.getReviewDraft);
router.patch('/:draftId', bookingDraftController.updateDraft);
router.get('/:draftId/live-check', bookingDraftController.liveCheck);
router.post('/confirm', bookingDraftController.confirmReview);

module.exports = router;
