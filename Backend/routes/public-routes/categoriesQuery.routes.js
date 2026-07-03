const express = require('express');
const router = express.Router();
const controller = require('../../controllers/publicControllers/unifiedCategoryController');

// Categories endpoints
router.get('/categories', controller.getCategories);
router.get('/categories/:id/sub-services', controller.getCategorySubServices);

// Sub-services endpoints
router.get('/sub-services/:id', controller.getSubServiceById);
router.get('/sub-services/:id/problems', controller.getSubServiceProblems);

// Registration service helper endpoints
router.get('/worker/services', controller.getWorkerServices);
router.get('/engineer/services', controller.getEngineerServices);

module.exports = router;
