const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B } = require('../../middleware/roleMiddleware');
const {
  getInvoiceSummary,
  getInvoices,
  getInvoiceById,
  downloadInvoicePdf,
  exportInvoicesCsv
} = require('../../controllers/b2bControllers/b2bInvoiceController');

// All endpoints are protected by authentication and approved B2B verification status check
router.use(authenticate, isApprovedB2B);

router.get('/summary', getInvoiceSummary);
router.get('/', getInvoices);
router.get('/export', exportInvoicesCsv);
router.get('/:invoiceId', getInvoiceById);
router.get('/:invoiceId/download', downloadInvoicePdf);

module.exports = router;
