const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/publicControllers/formSchema.controller');
const payCtrl = require('../../controllers/publicControllers/serviceRequestPayment.controller');
const assignmentCtrl = require('../../controllers/assignment/projectAssignment.controller');
const flowCtrl = require('../../controllers/publicControllers/serviceRequestFlow.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const { isUser } = require('../../middleware/roleMiddleware');

// Catalogue browsing stays public.
router.get('/form-schemas/search', ctrl.searchSubServices);
router.get('/form-schemas/category/:categoryCode', ctrl.listByCategory);
router.get('/form-schemas/:subCatCode', ctrl.getFormSchema);

// Service requests belong to a customer account: creating one, paying for it,
// tracking it and signing off its milestones all need the owner's login.
const customer = [authenticate, isUser];
router.get('/service-requests', customer, ctrl.listMine);
router.post('/service-requests', customer, ctrl.submitServiceRequest);
router.post('/service-requests/:requestCode/payment/order', customer, payCtrl.createOrder);
router.post('/service-requests/:requestCode/payment/verify', customer, payCtrl.verifyPayment);
router.get('/service-requests/:requestCode/assignment', customer, assignmentCtrl.getAssignmentByRequestCode);
router.post(
  '/service-requests/:requestCode/milestones/:milestoneId/customer-signoff',
  customer,
  flowCtrl.approveMilestoneCustomer
);
router.post('/b2b-jobs/:jobRef/customer-signoff', flowCtrl.approveB2BJobCustomer);
router.get('/service-requests/:requestCode', customer, ctrl.getByCode);

module.exports = router;
