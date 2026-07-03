const express = require('express');
const router = express.Router();
const bookingAvailabilityController = require('../../controllers/userControllers/bookingAvailability.controller');

router.get('/:draftId', bookingAvailabilityController.checkAvailability);

module.exports = router;
