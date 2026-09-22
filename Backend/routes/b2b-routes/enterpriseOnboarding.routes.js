const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { checkB2BPermission } = require('../../middleware/roleMiddleware');
const { uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');
const { uploadDocument } = require('../../controllers/b2bControllers/profile.controller');
const ctrl = require('../../controllers/b2bControllers/b2bEnterpriseOnboarding.controller');

router.get('/config', ctrl.getConfig);
router.get('/steps', ctrl.getStepsMeta);

router.use(authenticate);
// Onboarding a company is a company-admin action, not an operator one.
router.use(checkB2BPermission('company.manage'));

router.get('/me', ctrl.getMyOnboarding);
router.get('/activation-status', ctrl.activationStatus);
router.get('/verification-history', ctrl.verificationHistory);
router.patch('/steps/:step', ctrl.saveStep);
router.post('/documents', ctrl.uploadDocumentMeta);
router.post('/documents/upload', uploadGenericFile, handleMulterError, uploadDocument);
router.post('/submit', ctrl.submit);
router.post('/verify/gst', ctrl.verifyGst);
router.post('/verify/pan', ctrl.verifyPan);
router.post('/verify/cin', ctrl.verifyCin);
router.post('/verify/bank', ctrl.verifyBank);
router.post('/verify/contact-otp/send', ctrl.sendContactOtp);
router.post('/verify/contact-otp/confirm', ctrl.verifyContactOtp);
router.post('/sla/sign', ctrl.signSlaHandler);
router.get('/branches', ctrl.listBranches);
router.post('/branches', ctrl.createBranch);
router.patch('/branches/:branchId', ctrl.updateBranch);
router.delete('/branches/:branchId', ctrl.deleteBranch);
router.get('/contacts', ctrl.listContacts);
router.post('/contacts', ctrl.createOrUpdateContact);
router.delete('/contacts/:contactId', ctrl.deleteContact);
router.get('/activity-timeline', ctrl.getActivityTimeline);

module.exports = router;
