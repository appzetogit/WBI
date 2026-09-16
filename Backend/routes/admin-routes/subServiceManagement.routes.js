const express = require('express');
const router = express.Router();
const subServiceController = require('../../controllers/adminControllers/subServiceController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');

/**
 * These are mounted at /api/admin/sub-services and /api/admin/sub-service.
 * A comment here previously claimed server.js applied admin auth — it does not;
 * only a rate limiter is mounted on /api/admin. Create/update/delete on the
 * service catalog were therefore reachable anonymously. Guard at router level so
 * a handler can never be added without authorization.
 *
 * Only the Admin panel calls these (verified across Frontend/src); the public
 * catalog is served separately by public-routes/subServicesPublic.routes.
 */
router.use(authenticate, isAdmin);

router.get('/', subServiceController.getAllSubServices);
router.post('/', subServiceController.createSubService);
router.put('/:id', subServiceController.updateSubService);
router.delete('/:id', subServiceController.deleteSubService);
router.patch('/:id/status', subServiceController.toggleSubServiceStatus);

module.exports = router;
