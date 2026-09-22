const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const {
  getInvoiceSummary,
  getInvoices,
  getInvoiceById,
  downloadInvoicePdf,
  exportInvoicesCsv
} = require('../../controllers/b2bControllers/b2bInvoiceController');

// All endpoints are protected by authentication and approved B2B verification status check
router.use(authenticate, isApprovedB2B);

router.get('/summary', checkB2BPermission('invoices.read'), getInvoiceSummary);
router.get('/', checkB2BPermission('invoices.read'), getInvoices);
router.get('/export', checkB2BPermission('invoices.read'), exportInvoicesCsv);
router.get('/:invoiceId', checkB2BPermission('invoices.read'), getInvoiceById);
router.get('/:invoiceId/download', checkB2BPermission('invoices.read'), downloadInvoicePdf);

module.exports = router;
