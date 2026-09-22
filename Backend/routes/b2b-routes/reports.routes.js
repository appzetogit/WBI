const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B, checkB2BPermission } = require('../../middleware/roleMiddleware');
const {
  getSla,
  getFinancial,
  getSummary,
  getServices,
  getEngineers,
  getExpenses,
  getJobStatus,
  exportExcel,
  exportPdf
} = require('../../controllers/b2bControllers/b2bReportController');

// All endpoints are JWT authenticated and B2B approved status protected
router.use(authenticate, isApprovedB2B);

router.get('/summary', checkB2BPermission('reports.read'), getSummary);
router.get('/service-performance', checkB2BPermission('reports.read'), getServices);
router.get('/engineer-performance', checkB2BPermission('reports.read'), getEngineers);
router.get('/expense-summary', checkB2BPermission('reports.read'), getExpenses);
router.get('/job-status', checkB2BPermission('reports.read'), getJobStatus);
router.get('/sla', checkB2BPermission('reports.read'), getSla);
router.get('/financial', checkB2BPermission('reports.read'), getFinancial);
router.get('/export/excel', checkB2BPermission('reports.read'), exportExcel);
router.get('/export/pdf', checkB2BPermission('reports.read'), exportPdf);

module.exports = router;
