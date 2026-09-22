const mongoose = require('mongoose');
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
 * Validates that companyId is a valid B2B company in the system
 */
const validateCompany = async (companyId) => {
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    return { valid: false, status: 400, message: 'Invalid or missing B2B company ID' };
  }
  const company = await B2BCompany.findById(companyId);
  if (!company) {
    return { valid: false, status: 404, message: 'B2B Company not found' };
  }
  return { valid: true, company };
};

/**
 * GET /api/admin/b2b/reports/summary
 */
const getSummaryAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate, service, engineer, city, status } = req.query;
    
    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }

    const filters = { startDate, endDate, service, engineer, city, status };
    const summary = await getReportSummary(companyId, filters);

    return res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error('[Admin B2B Report Controller] Summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch company summary reports' });
  }
};

/**
 * GET /api/admin/b2b/reports/service-performance
 */
const getServicesAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate, engineer, city } = req.query;

    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }

    const filters = { startDate, endDate, engineer, city };
    const serviceReport = await getServicePerformance(companyId, filters);

    return res.status(200).json({ success: true, data: serviceReport });
  } catch (error) {
    console.error('[Admin B2B Report Controller] Services error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch company service report' });
  }
};

/**
 * GET /api/admin/b2b/reports/engineer-performance
 */
const getEngineersAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate, service, city, status } = req.query;

    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }

    const filters = { startDate, endDate, service, city, status };
    const engineerReport = await getEngineerPerformance(companyId, filters);

    return res.status(200).json({ success: true, data: engineerReport });
  } catch (error) {
    console.error('[Admin B2B Report Controller] Engineers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch company engineer report' });
  }
};

/**
 * GET /api/admin/b2b/reports/expense-summary
 */
const getExpensesAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.query;

    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }

    const filters = { startDate, endDate };
    const expenseReport = await getExpenseSummary(companyId, filters);

    return res.status(200).json({ success: true, data: expenseReport });
  } catch (error) {
    console.error('[Admin B2B Report Controller] Expenses error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch company expense summary' });
  }
};

/**
 * GET /api/admin/b2b/reports/job-status
 */
const getJobStatusAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate, service, engineer, city } = req.query;

    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }

    const filters = { startDate, endDate, service, engineer, city };
    const statusReport = await getJobStatusDistribution(companyId, filters);

    return res.status(200).json({ success: true, data: statusReport });
  } catch (error) {
    console.error('[Admin B2B Report Controller] Job Status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch company job status distribution' });
  }
};

/**
 * GET /api/admin/b2b/reports/export/excel
 */
const exportExcelAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate, service, engineer, city, status } = req.query;

    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
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
      { 'Metric': 'Average Rating', 'Value': summary.averageRating.value, 'Growth (MoM)': summary.averageRating.changeText },
      { 'Metric': 'SLA Compliance', 'Value': summary.slaCompliance.value != null ? `${summary.slaCompliance.value}%` : 'N/A', 'Growth (MoM)': summary.slaCompliance.changeText },
      { 'Metric': 'First-Time Fix Rate', 'Value': summary.firstTimeFixRate.value != null ? `${summary.firstTimeFixRate.value}%` : 'N/A', 'Growth (MoM)': summary.firstTimeFixRate.changeText }
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
      'Average Rating': e.averageRating,
      'Utilization': e.utilization
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
    res.setHeader('Content-Disposition', `attachment; filename="Admin_B2B_Reports_${new Date().toISOString().substring(0, 10)}.xlsx"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[Admin B2B Report Controller] Excel export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export reports to Excel' });
  }
};

/**
 * GET /api/admin/b2b/reports/export/pdf
 */
const exportPdfAdmin = async (req, res) => {
  try {
    const { companyId, startDate, endDate, service, engineer, city, status } = req.query;

    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }

    const filters = { startDate, endDate, service, engineer, city, status };
    const summary = await getReportSummary(companyId, filters);
    const servicePerformance = await getServicePerformance(companyId, filters);
    const engineerPerformance = await getEngineerPerformance(companyId, filters);
    const expenseSummary = await getExpenseSummary(companyId, filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Admin_B2B_Reports_${new Date().toISOString().substring(0, 10)}.pdf"`);

    const pdfDoc = generateReportPdf(
      compVal.company,
      summary,
      servicePerformance,
      engineerPerformance,
      expenseSummary,
      filters
    );

    pdfDoc.pipe(res);
  } catch (error) {
    console.error('[Admin B2B Report Controller] PDF export error:', error);
    return res.status(500).json({ success: false, message: 'Failed to export reports to PDF' });
  }
};

/**
 * GET /api/admin/b2b/reports/sla and /financial — the same reports the
 * company sees in its own panel, for any one company.
 */
const opsReportAdmin = (fnName) => async (req, res) => {
  try {
    const { companyId, startDate, endDate, service, engineer, city } = req.query;
    const compVal = await validateCompany(companyId);
    if (!compVal.valid) {
      return res.status(compVal.status).json({ success: false, message: compVal.message });
    }
    if ((startDate && isNaN(Date.parse(startDate))) || (endDate && isNaN(Date.parse(endDate)))) {
      return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    const svc = require('../../services/b2bOpsReportService');
    const data = await svc[fnName](companyId, { startDate, endDate, service, engineer, city });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[Admin B2B Report Controller] ${fnName} error:`, error);
    return res.status(500).json({ success: false, message: 'Failed to build report' });
  }
};

const getSlaAdmin = opsReportAdmin('getSlaReport');
const getFinancialAdmin = opsReportAdmin('getFinancialReport');

module.exports = {
  getSlaAdmin,
  getFinancialAdmin,
  getSummaryAdmin,
  getServicesAdmin,
  getEngineersAdmin,
  getExpensesAdmin,
  getJobStatusAdmin,
  exportExcelAdmin,
  exportPdfAdmin
};
