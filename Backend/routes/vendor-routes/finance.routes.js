const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  getCounts,
  getWallet,
  getEarningsByService,
  requestWithdrawal,
  getClientReceivables,
  getB2BReceivables,
  updateReceivable,
  getQuotations,
  getInvoices,
  updateDocument,
  getMilestones,
  updateMilestone
} = require('../../controllers/vendorControllers/financeController');

router.get('/counts', authenticate, getCounts);
router.get('/earnings-by-service', authenticate, getEarningsByService);
router.get('/wallet', authenticate, getWallet);
router.post('/wallet/withdraw', authenticate, requestWithdrawal);

router.get('/client-receivables', authenticate, getClientReceivables);
router.get('/b2b-receivables', authenticate, getB2BReceivables);
router.patch('/receivables/:id', authenticate, updateReceivable);

router.get('/quotations', authenticate, getQuotations);
router.get('/invoices', authenticate, getInvoices);
router.patch('/documents/:id', authenticate, updateDocument);

router.get('/milestones', authenticate, getMilestones);
router.patch('/milestones/:id', authenticate, updateMilestone);

module.exports = router;
