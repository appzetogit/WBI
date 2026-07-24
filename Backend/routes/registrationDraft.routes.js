const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/registrationDraftController');

const draftLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many draft saves. Try again shortly.' }
});

router.post('/', draftLimiter, ctrl.upsertDraft);
router.get('/by-phone', ctrl.getDraftByPhone);
router.get('/:draftKey', ctrl.getDraft);
router.delete('/:draftKey', ctrl.deleteDraft);

module.exports = router;
