const mongoose = require('mongoose');
const cacheHelper = require('../../utils/cacheHelper');
const B2BCompany = require('../../models/B2BCompany');
const XLSX = require('xlsx');
const { generateReportPdf } = require('../../utils/reportPdfGenerator');
const {
  getReportSummary,
  getServicePerformance,
  getEngineerPerformance,
  getExpenseSummary,
  getJobStatusDistribution
} = require('../../services/b2bReportService');

/**
 * Helper to validate date range filters
 */
const validateDateFilters = (startDate, endDate) => {
  if (startDate && isNaN(Date.parse(startDate))) {
    return { valid: false, message: 'Invalid start date format' };
  }
  if (endDate && isNaN(Date.parse(endDate))) {
    return { valid: false, message: 'Invalid end date format' };
  }
  return { valid: true };
};

/**
 * GET /api/b2b/reports/summary
 * Fetch and cache B2B report summary cards data
 */
const getSummary = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate, service, engineer, city, status } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const filters = { startDate, endDate, service, engineer, city, status };
    const cacheKey = `b2b:reports:summary:${companyId}:${JSON.stringify(filters)}`;

    // Try cache first (cache for 45 seconds)
    const cachedSummary = await cacheHelper.getCache(cacheKey);
    if (cachedSummary) {
      return res.status(200).json({ success: true, data: cachedSummary, cached: true });
    }

    const summary = await getReportSummary(companyId, filters);
    await cacheHelper.setCache(cacheKey, summary, 45); // 45s TTL

    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error('[B2B Report Controller] Summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch summary reports' });
  }
};

/**
 * GET /api/b2b/reports/service-performance
 * Fetch service completion and duration metrics
 */
const getServices = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate, engineer, city } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const filters = { startDate, endDate, engineer, city };
    const serviceReport = await getServicePerformance(companyId, filters);

    return res.status(200).json({ success: true, data: serviceReport });
  } catch (error) {
    console.error('[B2B Report Controller] Services error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch service report' });
  }
};

/**
 * GET /api/b2b/reports/engineer-performance
 * Fetch active, completed tasks and ratings of assigned specialists
 */
const getEngineers = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate, service, city, status } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const filters = { startDate, endDate, service, city, status };
    const engineerReport = await getEngineerPerformance(companyId, filters);

    return res.status(200).json({ success: true, data: engineerReport });
  } catch (error) {
    console.error('[B2B Report Controller] Engineers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch engineer report' });
  }
};

/**
 * GET /api/b2b/reports/expense-summary
 * Fetch topups, billings, and trendlines
 */
const getExpenses = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const filters = { startDate, endDate };
    const expenseReport = await getExpenseSummary(companyId, filters);

    return res.status(200).json({ success: true, data: expenseReport });
  } catch (error) {
    console.error('[B2B Report Controller] Expenses error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch expense summary' });
  }
};

/**
 * GET /api/b2b/reports/job-status
 * Fetch job status breakdown aggregates
 */
const getJobStatus = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate, service, engineer, city } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const filters = { startDate, endDate, service, engineer, city };
    const statusReport = await getJobStatusDistribution(companyId, filters);

    return res.status(200).json({ success: true, data: statusReport });
  } catch (error) {
    console.error('[B2B Report Controller] Job Status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch job status distribution' });
  }
};

/**
 * GET /api/b2b/reports/export/excel
 * Export B2B operational report tabs inside a single Excel workbook
 */
const exportExcel = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate, service, engineer, city, status } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const filters = { startDate, endDate, service, engineer, city, status };
    
    const summary = await getReportSummary(companyId, filters);
    const servicePerformance = await getServicePerformance(companyId, filters);
    const engineerPerformance = await getEngineerPerformance(companyId, filters);
    const expenseSummary = await getExpenseSummary(companyId, filters);

    const wb = XLSX.utils.book_new();

    // 1. Summary Metrics Sheet
    const summaryData = [
      { 'Metric': 'Total Jobs', 'Value': summary.totalJobs.value, 'Growth (MoM)': summary.totalJobs.changeText },
      { 'Metric': 'Completed Jobs', 'Value': summary.completedJobs.value, 'Growth (MoM)': summary.completedJobs.changeText },
      { 'Metric': 'Pending Jobs', 'Value': summary.pendingJobs.value, 'Growth (MoM)': summary.pendingJobs.changeText },
      { 'Metric': 'Cancelled Jobs', 'Value': summary.cancelledJobs.value, 'Growth (MoM)': summary.cancelledJobs.changeText },
      { 'Metric': 'Total Spend (INR)', 'Value': summary.totalSpend.value, 'Growth (MoM)': summary.totalSpend.changeText },
      { 'Metric': 'Average Rating', 'Value': summary.averageRating.value, 'Growth (MoM)': summary.averageRating.changeText }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Metrics');

    // 2. Service Performance Sheet
    const wsService = XLSX.utils.json_to_sheet(servicePerformance.map(s => ({
      'Service Name': s.serviceName,
      'Total Jobs': s.totalJobs,
      'Completed': s.completed,
      'Pending': s.pending,
      'Completion Rate': s.completionRate,
      'Avg Completion Time': s.averageCompletionTime
    })));
    XLSX.utils.book_append_sheet(wb, wsService, 'Service Performance');

    // 3. Engineer Performance Sheet
    const wsEngineer = XLSX.utils.json_to_sheet(engineerPerformance.map(e => ({
      'Engineer Name': e.engineerName,
      'Assigned Jobs': e.assignedJobs,
      'Completed Jobs': e.completedJobs,
      'Active Jobs': e.activeJobs,
      'Average Rating': e.averageRating
    })));
    XLSX.utils.book_append_sheet(wb, wsEngineer, 'Engineer Performance');

    // 4. Expense Summary Sheet
    const expenseData = [
      { 'Financial Metric': 'Total Wallet Recharge', 'Amount (INR)': expenseSummary.totalWalletRecharge },
      { 'Financial Metric': 'Total Amount Used', 'Amount (INR)': expenseSummary.totalAmountUsed },
      { 'Financial Metric': 'Total Remaining Wallet', 'Amount (INR)': expenseSummary.totalRemainingWallet },
      { 'Financial Metric': 'Total Invoice Amount', 'Amount (INR)': expenseSummary.totalInvoiceAmount },
    ];
    expenseSummary.monthlyExpenseTrend.forEach(t => {
      expenseData.push({ 'Financial Metric': `Spend - ${t.month}`, 'Amount (INR)': t.amount });
    });
    const wsExpense = XLSX.utils.json_to_sheet(expenseData);
    XLSX.utils.book_append_sheet(wb, wsExpense, 'Expense Summary');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="WBI_B2B_Reports_${new Date().toISOString().substring(0, 10)}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[B2B Report Controller] Excel export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export reports to Excel' });
  }
};

/**
 * GET /api/b2b/reports/export/pdf
 * Export B2B operational reports as a beautifully styled PDF document
 */
const exportPdf = async (req, res) => {
  try {
    const companyId = req.user.id;
    const { startDate, endDate, service, engineer, city, status } = req.query;

    const dateVal = validateDateFilters(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({ success: false, message: dateVal.message });
    }

    const company = await B2BCompany.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const filters = { startDate, endDate, service, engineer, city, status };
    const summary = await getReportSummary(companyId, filters);
    const servicePerformance = await getServicePerformance(companyId, filters);
    const engineerPerformance = await getEngineerPerformance(companyId, filters);
    const expenseSummary = await getExpenseSummary(companyId, filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="WBI_B2B_Reports_${new Date().toISOString().substring(0, 10)}.pdf"`);

    const pdfDoc = generateReportPdf(
      company,
      summary,
      servicePerformance,
      engineerPerformance,
      expenseSummary,
      filters
    );

    pdfDoc.pipe(res);
  } catch (error) {
    console.error('[B2B Report Controller] PDF export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export reports to PDF' });
  }
};

module.exports = {
  getSummary,
  getServices,
  getEngineers,
  getExpenses,
  getJobStatus,
  exportExcel,
  exportPdf
};
