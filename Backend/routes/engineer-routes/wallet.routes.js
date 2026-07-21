const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isEngineer } = require('../../middleware/roleMiddleware');
const {
  getWallet,
  getTransactions,
  requestPayout,
  getWalletSummary,
  requestWithdrawal,
  verifyUpi
} = require('../../controllers/engineerControllers/engineerWalletController');

// Get wallet balance
router.get('/', authenticate, isEngineer, getWallet);

// Get wallet summary
router.get('/summary', authenticate, isEngineer, getWalletSummary);

// Get transaction history
router.get('/transactions', authenticate, isEngineer, getTransactions);

// Request payout from vendor
router.post('/request-payout', authenticate, isEngineer, requestPayout);

const { verifyBankForWithdrawal } = require('../../middleware/verificationMiddleware');

// Request withdrawal
router.post('/verify-upi', authenticate, isEngineer, verifyUpi);
router.post('/withdraw', authenticate, isEngineer, verifyBankForWithdrawal, requestWithdrawal);

module.exports = router;
