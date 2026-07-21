const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/vendorControllers/vendorConfigController');
const sms = require('../../controllers/adminControllers/adminServiceManagement.controller');
const assignmentCtrl = require('../../controllers/assignment/projectAssignment.controller');

// Legacy list/update (kept for backward compatibility)
router.get('/service-configs', authenticate, isAdmin, ctrl.listServiceConfigs);
router.put('/service-configs/:categoryCode', authenticate, isAdmin, ctrl.updateServiceConfig);
router.post('/vendors/:id/approve-service', authenticate, isAdmin, ctrl.approveVendorService);
router.delete('/vendors/:id/services/:code', authenticate, isAdmin, ctrl.suspendVendorService);

router.get('/assignment-configs', authenticate, isAdmin, assignmentCtrl.listAssignmentConfigs);
router.put('/assignment-configs/:categoryCode', authenticate, isAdmin, assignmentCtrl.upsertAssignmentConfig);

// ─── Service Management System (SMS) ─────────────────────────────────────────
router.get('/service-management', authenticate, isAdmin, sms.listServices);
router.post('/service-management', authenticate, isAdmin, sms.createService);

// Static path segments MUST come before :categoryCode
router.put('/service-management/forms/:subCatCode', authenticate, isAdmin, sms.upsertFormSchema);
router.patch('/service-management/forms/:subCatCode/status', authenticate, isAdmin, sms.setFormStatus);

router.get('/service-management/:categoryCode', authenticate, isAdmin, sms.getService);
router.put('/service-management/:categoryCode', authenticate, isAdmin, sms.updateService);
router.patch('/service-management/:categoryCode/status', authenticate, isAdmin, sms.setStatus);
router.delete('/service-management/:categoryCode', authenticate, isAdmin, sms.archiveService);
router.post('/service-management/:categoryCode/publish', authenticate, isAdmin, sms.publishService);
router.put('/service-management/:categoryCode/subcategories', authenticate, isAdmin, sms.upsertSubcategories);
router.put('/service-management/:categoryCode/registration', authenticate, isAdmin, sms.upsertRegistrationTemplate);
router.put('/service-management/:categoryCode/dashboard', authenticate, isAdmin, sms.upsertDashboardConfiguration);
router.put('/service-management/:categoryCode/permissions', authenticate, isAdmin, sms.upsertPermissionConfiguration);
router.get('/service-management/:categoryCode/audits', authenticate, isAdmin, sms.listAudits);
router.post('/service-management/:categoryCode/rollback', authenticate, isAdmin, sms.rollbackService);

module.exports = router;
