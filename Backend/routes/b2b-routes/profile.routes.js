const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { checkB2BPermission } = require('../../middleware/roleMiddleware');
const { uploadImage, uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');
const {
  getProfile,
  updateProfile,
  updateContactPerson,
  updateAddress,
  updateLogo,
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getDocuments,
  uploadDocument,
  reuploadDocument,
  viewDocument,
  getBankDetails,
  updateBankDetails,
  verifyBankPennyDrop,
  changePassword,
  getSessions,
  logoutAllDevices,
  updateNotificationPreferences
} = require('../../controllers/b2bControllers/profile.controller');

// All profile endpoints are B2B authenticated
router.use(authenticate);

// Profile core
router.get('/', checkB2BPermission('company.manage'), getProfile);
router.patch('/', checkB2BPermission('company.manage'), updateProfile);
router.patch('/contact-person', checkB2BPermission('company.manage'), updateContactPerson);
router.patch('/address', checkB2BPermission('company.manage'), updateAddress);
router.post('/logo', checkB2BPermission('company.manage'), uploadImage, handleMulterError, updateLogo);

// Branches
router.get('/branches', checkB2BPermission('company.manage'), getBranches);
router.post('/branches', checkB2BPermission('company.manage'), createBranch);
router.patch('/branches/:branchId', checkB2BPermission('company.manage'), updateBranch);
router.delete('/branches/:branchId', checkB2BPermission('company.manage'), deleteBranch);

// Documents
router.get('/documents', checkB2BPermission('company.manage'), getDocuments);
router.post('/documents', checkB2BPermission('company.manage'), uploadGenericFile, handleMulterError, uploadDocument);
router.post('/documents/:documentId/reupload', checkB2BPermission('company.manage'), uploadGenericFile, handleMulterError, reuploadDocument);
router.get('/documents/:documentId/view', checkB2BPermission('company.manage'), viewDocument);

// Bank
router.get('/bank', checkB2BPermission('company.manage'), getBankDetails);
router.patch('/bank', checkB2BPermission('company.manage'), updateBankDetails);
router.post('/bank/verify', checkB2BPermission('company.manage'), verifyBankPennyDrop);

// Settings & Session
router.patch('/change-password', checkB2BPermission('company.manage'), changePassword);
router.get('/sessions', checkB2BPermission('company.manage'), getSessions);
router.post('/logout-all-devices', checkB2BPermission('company.manage'), logoutAllDevices);
router.patch('/notification-preferences', checkB2BPermission('company.manage'), updateNotificationPreferences);

module.exports = router;
