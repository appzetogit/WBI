const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getSlaAdmin,
  getFinancialAdmin,
  getSummaryAdmin,
  getServicesAdmin,
  getEngineersAdmin,
  getExpensesAdmin,
  getJobStatusAdmin,
  exportExcelAdmin,
  exportPdfAdmin
} = require('../../controllers/adminControllers/b2bReportAdminController');

// All endpoints are JWT authenticated and admin role protected
router.use(authenticate, isAdmin);

router.get('/summary', getSummaryAdmin);
router.get('/service-performance', getServicesAdmin);
router.get('/engineer-performance', getEngineersAdmin);
router.get('/expense-summary', getExpensesAdmin);
router.get('/job-status', getJobStatusAdmin);
router.get('/sla', getSlaAdmin);
router.get('/financial', getFinancialAdmin);
router.get('/export/excel', exportExcelAdmin);
router.get('/export/pdf', exportPdfAdmin);

module.exports = router;
