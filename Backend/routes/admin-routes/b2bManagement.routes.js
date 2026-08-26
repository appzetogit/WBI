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
  updateCompanyUserStatus
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

// Admin B2B User management
router.get('/b2b-companies/:companyId/users', getCompanyUsers);
router.patch('/b2b-companies/:companyId/users/:userId/status', updateCompanyUserStatus);

module.exports = router;
