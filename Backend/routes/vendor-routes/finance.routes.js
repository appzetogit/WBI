const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getWallet,
  getEarningsByService,
  getEarningsOverview,
  getEngineerPayments,
  recordEngineerPayment,
  getSettlements,
  getWithdrawEligibility,
  quoteWithdrawal,
  listBankAccounts,
  upsertBankAccount,
  verifyBankAccount,
  sendWithdrawOtp,
  requestWithdrawal,
  listWithdrawals,
  getWithdrawal,
  cancelWithdrawal,
  downloadWithdrawalReceipt,
  getClientReceivables,
  getB2BReceivables,
  updateReceivable,
  getQuotations,
  getInvoices,
  updateDocument,
  downloadDocument,
  createInvoicePayOrder,
  verifyInvoicePay,
  getMilestones,
  updateMilestone,
  syncFinance,
  exportLedger
} = require('../../controllers/vendorControllers/financeController');

router.get('/counts', authenticate, getCounts);
router.get('/earnings', authenticate, getEarningsOverview);
router.get('/earnings-by-service', authenticate, getEarningsByService);
router.get('/wallet', authenticate, getWallet);
router.get('/wallet/export', authenticate, exportLedger);
router.get('/engineer-payments', authenticate, getEngineerPayments);
router.post('/engineer-payments/pay', authenticate, recordEngineerPayment);
router.get('/settlements', authenticate, getSettlements);

router.get('/withdraw/eligibility', authenticate, getWithdrawEligibility);
router.post('/withdraw/quote', authenticate, quoteWithdrawal);
router.post('/withdraw/otp', authenticate, sendWithdrawOtp);
router.get('/withdraw/banks', authenticate, listBankAccounts);
router.post('/withdraw/banks', authenticate, upsertBankAccount);
router.post('/withdraw/banks/:bankId/verify', authenticate, verifyBankAccount);
router.post('/wallet/withdraw', authenticate, requestWithdrawal);
router.get('/withdrawals', authenticate, listWithdrawals);
router.get('/withdrawals/:id', authenticate, getWithdrawal);
router.post('/withdrawals/:id/cancel', authenticate, cancelWithdrawal);
router.get('/withdrawals/:id/receipt', authenticate, downloadWithdrawalReceipt);

router.post('/sync', authenticate, syncFinance);

router.get('/client-receivables', authenticate, getClientReceivables);
router.get('/b2b-receivables', authenticate, getB2BReceivables);
router.patch('/receivables/:id', authenticate, updateReceivable);

router.get('/quotations', authenticate, getQuotations);
router.get('/invoices', authenticate, getInvoices);
router.patch('/documents/:id', authenticate, updateDocument);
router.get('/documents/:id/download', authenticate, downloadDocument);
router.post('/invoices/:id/pay-order', authenticate, createInvoicePayOrder);
router.post('/invoices/:id/verify-payment', authenticate, verifyInvoicePay);

router.get('/milestones', authenticate, getMilestones);
router.patch('/milestones/:id', authenticate, updateMilestone);

module.exports = router;
