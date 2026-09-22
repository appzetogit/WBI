const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  listContracts,
  getContract,
  createContract,
  updateContract,
  setContractStatus,
  deleteContract
} = require('../../controllers/adminControllers/b2bContractAdminController');

// Every route here is admin-only, applied at router level so a new handler
// can never be added without authorization.
router.use(authenticate, isAdmin);

router.get('/', listContracts);
router.post('/', createContract);
router.get('/:id', getContract);
router.put('/:id', updateContract);
router.post('/:id/status', setContractStatus);
router.delete('/:id', deleteContract);

module.exports = router;
