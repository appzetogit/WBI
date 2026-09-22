const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdminOrVendor } = require('../../middleware/roleMiddleware');
const ctrl = require('../../controllers/vendorControllers/vendorManagementController');

// Mounted at /api/vendors after the existing vendor routers. Only paths whose
// first segment is a vendor ObjectId are handled here; anything else falls
// through untouched. The controller enforces "own vendor only" (admin: any).
router.param('vendorId', (req, res, next, vendorId) => {
  if (!mongoose.Types.ObjectId.isValid(vendorId)) return next('route');
  return next();
});
['itemId', 'partId'].forEach((name) => router.param(name, (req, res, next, value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) return res.status(400).json({ success: false, message: 'Invalid id' });
  return next();
}));
router.param('engineerId', (req, res, next, engineerId) => {
  if (!mongoose.Types.ObjectId.isValid(engineerId)) return res.status(400).json({ success: false, message: 'Invalid engineer id' });
  return next();
});

const guard = [authenticate, isAdminOrVendor];

router.get('/:vendorId/jobs', guard, ctrl.listJobs);
router.get('/:vendorId/engineers', guard, ctrl.listEngineers);
router.get('/:vendorId/engineers/skills', guard, ctrl.engineerSkills);
router.get('/:vendorId/engineers/performance', guard, ctrl.engineerPerformance);
router.get('/:vendorId/engineers/:engineerId', guard, ctrl.engineerDetail);
router.post('/:vendorId/engineers/:engineerId/deactivate', guard, ctrl.deactivateEngineer);
router.post('/:vendorId/engineers/:engineerId/activate', guard, ctrl.activateEngineer);
router.post('/:vendorId/engineers/:engineerId/approve', guard, ctrl.approveEngineerJoin);
router.post('/:vendorId/engineers/:engineerId/reject', guard, ctrl.rejectEngineerJoin);
router.get('/:vendorId/dashboard', guard, ctrl.dashboard);
router.get('/:vendorId/analytics', guard, ctrl.analytics);
router.get('/:vendorId/assignments', guard, ctrl.assignments);
router.get('/:vendorId/assignments/queue', guard, ctrl.assignmentQueue);
router.post('/:vendorId/assignments/auto', guard, ctrl.autoAssign);
router.get('/:vendorId/assignments/reassignable', guard, ctrl.reassignable);
router.get('/:vendorId/services', guard, ctrl.myServices);
router.get('/:vendorId/service-keys', guard, ctrl.serviceKeys);
router.get('/:vendorId/service-keys/resolve', guard, ctrl.resolveServiceKey);
router.get('/:vendorId/service-areas', guard, ctrl.serviceAreas);
router.post('/:vendorId/service-areas', guard, ctrl.updateServiceAreas);
router.get('/:vendorId/parts/catalog', guard, ctrl.partsCatalog);
router.get('/:vendorId/parts/inventory', guard, ctrl.inventory);
router.post('/:vendorId/parts/inventory', guard, ctrl.createInventoryItem);
router.patch('/:vendorId/parts/inventory/:itemId', guard, ctrl.adjustInventory);
router.get('/:vendorId/parts/inventory/:itemId/movements', guard, ctrl.inventoryMovements);
router.get('/:vendorId/parts/jobs', guard, ctrl.jobParts);
router.post('/:vendorId/parts/jobs', guard, ctrl.addRequiredPart);
router.post('/:vendorId/parts/jobs/used', guard, ctrl.recordUsedPart);
router.post('/:vendorId/parts/jobs/:partId/reserve', guard, ctrl.reservePart);
router.post('/:vendorId/parts/jobs/:partId/use', guard, ctrl.usePart);
router.post('/:vendorId/parts/jobs/:partId/cancel', guard, ctrl.cancelPart);
router.get('/:vendorId/payments', guard, ctrl.payments);
router.get('/:vendorId/settlements', guard, ctrl.settlements);
router.get('/:vendorId/settlements/:settlementId/download', guard, ctrl.downloadSettlement);
router.get('/:vendorId/service-coverage', guard, ctrl.listCoverage);
router.put('/:vendorId/service-coverage/:serviceKey', guard, ctrl.upsertCoverage);

module.exports = router;
