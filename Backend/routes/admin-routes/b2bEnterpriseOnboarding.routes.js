const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/adminControllers/adminB2BEnterpriseOnboarding.controller');

router.use(authenticate, isAdmin);

router.get('/dashboard', ctrl.getDashboard);
router.get('/config', ctrl.getConfigAdmin);
router.put('/config', ctrl.updateConfig);
router.post('/config/sync-catalog', ctrl.syncCatalog);
router.get('/companies/:companyId', ctrl.getOnboardingDetail);
router.post('/companies/:companyId/review', ctrl.reviewAction);
router.patch('/companies/:companyId/documents/:documentId/verify', ctrl.verifyDocument);
router.patch('/companies/:companyId/documents/:documentId/reject', ctrl.rejectDocument);
router.get('/companies/:companyId/activity', ctrl.getCompanyActivity);

module.exports = router;
