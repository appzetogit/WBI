const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getB2BInvoicesAdmin,
  getB2BInvoiceByIdAdmin,
  generateMonthlyInvoice,
  updateB2BInvoiceStatus,
  downloadB2BInvoicePdfAdmin
} = require('../../controllers/adminControllers/b2bInvoiceAdminController');

// All endpoints are protected by authentication and administrator role checks
router.use(authenticate, isAdmin);

router.get('/', getB2BInvoicesAdmin);
router.post('/generate-monthly', generateMonthlyInvoice);
router.get('/:invoiceId', getB2BInvoiceByIdAdmin);
router.patch('/:invoiceId/status', updateB2BInvoiceStatus);
router.get('/:invoiceId/download', downloadB2BInvoicePdfAdmin);

module.exports = router;
