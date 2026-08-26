const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isApprovedB2B } = require('../../middleware/roleMiddleware');
const {
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

router.get('/summary', getSummary);
router.get('/service-performance', getServices);
router.get('/engineer-performance', getEngineers);
router.get('/expense-summary', getExpenses);
router.get('/job-status', getJobStatus);
router.get('/export/excel', exportExcel);
router.get('/export/pdf', exportPdf);

module.exports = router;
