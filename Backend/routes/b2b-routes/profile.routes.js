const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
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
router.get('/', getProfile);
router.patch('/', updateProfile);
router.patch('/contact-person', updateContactPerson);
router.patch('/address', updateAddress);
router.post('/logo', uploadImage, handleMulterError, updateLogo);

// Branches
router.get('/branches', getBranches);
router.post('/branches', createBranch);
router.patch('/branches/:branchId', updateBranch);
router.delete('/branches/:branchId', deleteBranch);

// Documents
router.get('/documents', getDocuments);
router.post('/documents', uploadGenericFile, handleMulterError, uploadDocument);
router.post('/documents/:documentId/reupload', uploadGenericFile, handleMulterError, reuploadDocument);
router.get('/documents/:documentId/view', viewDocument);

// Bank
router.get('/bank', getBankDetails);
router.patch('/bank', updateBankDetails);
router.post('/bank/verify', verifyBankPennyDrop);

// Settings & Session
router.patch('/change-password', changePassword);
router.get('/sessions', getSessions);
router.post('/logout-all-devices', logoutAllDevices);
router.patch('/notification-preferences', updateNotificationPreferences);

module.exports = router;
