const express = require('express');
const router = express.Router();
const workerServiceConfigController = require('../../controllers/workerControllers/workerServiceConfigController');

// GET /api/worker/services/categories
router.get('/categories', workerServiceConfigController.getWorkerCategories);

// GET /api/worker/services/categories/:categoryId/sub-services
router.get('/categories/:categoryId/sub-services', workerServiceConfigController.getWorkerSubServices);

module.exports = router;
