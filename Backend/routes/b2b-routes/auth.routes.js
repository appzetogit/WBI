const express = require('express');
const router = express.Router();
const rateLimiter = require('../../middleware/rateLimiter');
const { registrationLimiter, loginLimiter } = rateLimiter;
const { uploadGenericFile, handleMulterError } = require('../../middleware/uploadMiddleware');
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
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
  getExecutiveMetrics,
  getGeoTaskAnalytics,
  getHardwareHealth,
  getFinancialLogs,
  getWorkforceQuality
} = require('../../controllers/b2bControllers/b2bDashboardController');

const {
  getWalletSummary,
  getWalletTransactions,
  exportWalletStatement,
  getWalletReconciliation,
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
router.patch('/profile', authenticate, checkB2BPermission('company.manage'), updateProfile);
router.get('/verification-status', authenticate, getVerificationStatus);


// Dashboard routes
router.get('/dashboard/summary', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getDashboardSummary);
router.get('/dashboard/jobs-overview', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getJobsOverview);
router.get('/dashboard/jobs-status', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getJobsStatusDistribution);
router.get('/dashboard/recent-jobs', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getRecentJobs);
router.get('/dashboard/executive-metrics', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getExecutiveMetrics);
router.get('/dashboard/geo-task-analytics', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getGeoTaskAnalytics);
router.get('/dashboard/hardware-health', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getHardwareHealth);
router.get('/dashboard/financial-logs', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getFinancialLogs);
router.get('/dashboard/workforce-quality', authenticate, isApprovedB2B, checkB2BPermission('jobs.read'), getWorkforceQuality);

// Wallet endpoints
router.get('/wallet/balance', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getWalletBalance);
router.get('/wallet/summary', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getWalletSummary);
router.get('/wallet/transactions', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getWalletTransactions);
router.get('/wallet/transactions/export', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), exportWalletStatement);
router.get('/wallet/reconciliation', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getWalletReconciliation);
router.post('/wallet/create-topup-order', authenticate, isApprovedB2B, checkB2BPermission('wallet.topup'), createTopupOrder);
router.post('/wallet/verify-topup-payment', authenticate, isApprovedB2B, checkB2BPermission('wallet.topup'), verifyTopupPayment);
router.get('/wallet/usage-summary', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getWalletUsageSummary);
router.get('/wallet/deduction-rule', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getDeductionRule);
router.get('/wallet/payment-methods', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getPaymentMethods);
router.post('/wallet/payment-methods', authenticate, isApprovedB2B, checkB2BPermission('wallet.topup'), addPaymentMethod);
router.delete('/wallet/payment-methods/:id', authenticate, isApprovedB2B, checkB2BPermission('wallet.topup'), deletePaymentMethod);
router.get('/wallet/activation-gate', authenticate, isApprovedB2B, checkB2BPermission('wallet.read'), getWalletActivationGate);
router.post('/wallet/activate-pending', authenticate, isApprovedB2B, checkB2BPermission('wallet.topup'), activatePendingJobs);



// GET /api/b2b/jobs, /engineers and /users are served by their own routers
// (jobs.routes, engineers.routes, users.routes). Duplicates here used to
// shadow them, because this router is mounted first under /api/b2b — the
// users list returned a hardcoded placeholder user.

module.exports = router;
