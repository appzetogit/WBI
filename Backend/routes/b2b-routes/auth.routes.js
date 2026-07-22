const express = require('express');
const router = express.Router();
const rateLimiter = require('../../middleware/rateLimiter');
const { registrationLimiter, loginLimiter } = rateLimiter;
const { uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');
const { authenticate } = require('../../middleware/authMiddleware');
const {
  registerCompany,
  loginCompany,
  getProfile,
  updateProfile,
  reuploadDocuments,
  getVerificationStatus,
  refreshToken
} = require('../../controllers/b2bControllers/b2bAuthController');

// Public auth routes
router.post('/register', registrationLimiter, registerCompany);
router.post('/login', loginLimiter, loginCompany);
router.post('/refresh-token', refreshToken);

// Document upload route - Public since it's used during the register form wizard before submission!
router.post('/documents/upload', uploadGenericFile, handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or file format not supported'
      });
    }

    res.status(200).json({
      success: true,
      imageUrl: req.file.path,
      fileUrl: req.file.path,
      fileKey: req.file.filename || null,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('B2B upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document',
      error: error.message
    });
  }
});

// Re-upload documents (can be public or authenticated, we allow both via query/body or headers)
router.post('/reupload-documents', reuploadDocuments);

const {
  getDashboardSummary,
  getJobsOverview,
  getJobsStatusDistribution,
  getRecentJobs,
  getWalletBalance,
  getEngineers,
  getUsers,
  getCompanyJobs,
  getExecutiveMetrics,
  getGeoTaskAnalytics,
  getHardwareHealth,
  getFinancialLogs,
  getWorkforceQuality
} = require('../../controllers/b2bControllers/b2bDashboardController');

const {
  getWalletSummary,
  getWalletTransactions,
  createTopupOrder,
  verifyTopupPayment,
  getWalletUsageSummary,
  getDeductionRule,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  getWalletActivationGate,
  activatePendingJobs
} = require('../../controllers/b2bControllers/b2bWalletController');

// Authenticated routes
router.get('/me', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);
router.get('/verification-status', authenticate, getVerificationStatus);

const { isApprovedB2B } = require('../../middleware/roleMiddleware');

// Dashboard routes
router.get('/dashboard/summary', authenticate, isApprovedB2B, getDashboardSummary);
router.get('/dashboard/jobs-overview', authenticate, isApprovedB2B, getJobsOverview);
router.get('/dashboard/jobs-status', authenticate, isApprovedB2B, getJobsStatusDistribution);
router.get('/dashboard/recent-jobs', authenticate, isApprovedB2B, getRecentJobs);
router.get('/dashboard/executive-metrics', authenticate, isApprovedB2B, getExecutiveMetrics);
router.get('/dashboard/geo-task-analytics', authenticate, isApprovedB2B, getGeoTaskAnalytics);
router.get('/dashboard/hardware-health', authenticate, isApprovedB2B, getHardwareHealth);
router.get('/dashboard/financial-logs', authenticate, isApprovedB2B, getFinancialLogs);
router.get('/dashboard/workforce-quality', authenticate, isApprovedB2B, getWorkforceQuality);

// Wallet endpoints
router.get('/wallet/balance', authenticate, isApprovedB2B, getWalletBalance);
router.get('/wallet/summary', authenticate, isApprovedB2B, getWalletSummary);
router.get('/wallet/transactions', authenticate, isApprovedB2B, getWalletTransactions);
router.post('/wallet/create-topup-order', authenticate, isApprovedB2B, createTopupOrder);
router.post('/wallet/verify-topup-payment', authenticate, isApprovedB2B, verifyTopupPayment);
router.get('/wallet/usage-summary', authenticate, isApprovedB2B, getWalletUsageSummary);
router.get('/wallet/deduction-rule', authenticate, isApprovedB2B, getDeductionRule);
router.get('/wallet/payment-methods', authenticate, isApprovedB2B, getPaymentMethods);
router.post('/wallet/payment-methods', authenticate, isApprovedB2B, addPaymentMethod);
router.delete('/wallet/payment-methods/:id', authenticate, isApprovedB2B, deletePaymentMethod);
router.get('/wallet/activation-gate', authenticate, isApprovedB2B, getWalletActivationGate);
router.post('/wallet/activate-pending', authenticate, isApprovedB2B, activatePendingJobs);

// Engineers & Users list
router.get('/engineers', authenticate, isApprovedB2B, getEngineers);
router.get('/users', authenticate, isApprovedB2B, getUsers);

// Dynamic Jobs list query
router.get('/jobs', authenticate, isApprovedB2B, getCompanyJobs);

module.exports = router;
