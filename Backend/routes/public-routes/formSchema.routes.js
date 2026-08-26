const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/publicControllers/formSchema.controller');
const payCtrl = require('../../controllers/publicControllers/serviceRequestPayment.controller');
const assignmentCtrl = require('../../controllers/assignment/projectAssignment.controller');
const flowCtrl = require('../../controllers/publicControllers/serviceRequestFlow.controller');

router.get('/form-schemas/search', ctrl.searchSubServices);
router.get('/form-schemas/category/:categoryCode', ctrl.listByCategory);
router.get('/form-schemas/:subCatCode', ctrl.getFormSchema);
router.post('/service-requests', ctrl.submitServiceRequest);
router.post('/service-requests/:requestCode/payment/order', payCtrl.createOrder);
router.post('/service-requests/:requestCode/payment/verify', payCtrl.verifyPayment);
router.get('/service-requests/:requestCode/assignment', assignmentCtrl.getAssignmentByRequestCode);
router.post(
  '/service-requests/:requestCode/milestones/:milestoneId/customer-signoff',
  flowCtrl.approveMilestoneCustomer
);
router.post('/b2b-jobs/:jobRef/customer-signoff', flowCtrl.approveB2BJobCustomer);
router.get('/service-requests/:requestCode', ctrl.getByCode);

module.exports = router;
