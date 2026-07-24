const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');
const rateLimiter = require('../../middleware/rateLimiter');
const ctrl = require('../../controllers/userControllers/userSupportController');

const router = express.Router();

router.use(authenticate, isUser);

router.post(
  '/tickets',
  rateLimiter,
  [
    body('subject').trim().notEmpty().isLength({ max: 200 }),
    body('message').trim().notEmpty().isLength({ max: 5000 }),
    body('email').optional().isEmail(),
    body('name').optional().trim().isLength({ max: 100 }),
    body('category').optional().isIn(['Booking', 'Payment', 'Account', 'Technical', 'Other'])
  ],
  ctrl.createTicket
);

router.get('/tickets', ctrl.listTickets);

module.exports = router;
