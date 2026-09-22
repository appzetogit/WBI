const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAllCompanies,
  approveCompany,
  rejectCompany,
  getCompanyById,
  verifyCompany,
  verifyCompanyDocument,
  rejectCompanyDocument,
  verifyCompanyBank,
  getCompanyUsers,
  updateCompanyUserStatus,
  setCompanyStatus,
  updateCompanyControls,
  getCompanyActivity
} = require('../../controllers/adminControllers/b2bManagementController');

// All routes are protected by authenticate and isAdmin middlewares
router.use(authenticate, isAdmin);

router.get('/b2b-companies', getAllCompanies);
router.get('/b2b-companies/:companyId', getCompanyById);
router.patch('/b2b-companies/:id/approve', approveCompany);
router.patch('/b2b-companies/:id/reject', rejectCompany);

router.patch('/b2b-companies/:companyId/verify', verifyCompany);
router.patch('/b2b-companies/:companyId/reject', rejectCompany);
router.patch('/b2b-companies/:companyId/documents/:documentId/verify', verifyCompanyDocument);
router.patch('/b2b-companies/:companyId/documents/:documentId/reject', rejectCompanyDocument);
router.patch('/b2b-companies/:companyId/bank/verify', verifyCompanyBank);

// Operational controls: status, allowed services/locations, profiles, billing
router.patch('/b2b-companies/:companyId/status', setCompanyStatus);
router.patch('/b2b-companies/:companyId/controls', updateCompanyControls);
router.get('/b2b-companies/:companyId/activity', getCompanyActivity);

// Admin B2B User management
router.get('/b2b-companies/:companyId/users', getCompanyUsers);
router.patch('/b2b-companies/:companyId/users/:userId/status', updateCompanyUserStatus);

module.exports = router;
