const cron = require('node-cron');
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const B2BCompany = require('../models/B2BCompany');
const B2BWallet = require('../models/B2BWallet');
const MISReport = require('../models/MISReport');

/**
 * Create email transporter using env config
 */
const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false // Fix ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR on AWS
    }
  });

/**
 * Generate MIS Excel buffer for a given company and date range
 */
const generateMISExcel = async (companyId, startDate, endDate) => {
  const jobs = await B2BJob.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    date: { $gte: startDate, $lte: endDate }
  })
    .populate('assignedTo', 'name phone')
    .lean();

  const rows = jobs.map(j => ({
    'Job ID': j.jobId,
    'Customer Name': j.customerName,
    'Phone': j.phone,
    'City': j.city,
    'Service': j.service,
    'Status': j.status,
    'Priority': j.priority,
    'Preferred Date': j.preferredDate ? new Date(j.preferredDate).toLocaleDateString('en-IN') : '',
    'Assigned Engineer': j.assignedTo ? j.assignedTo.name : 'Unassigned',
    'Charge (INR)': j.charge || 0,
    'SLA Target (hrs)': j.slaTarget || 24,
    'Started At': j.startedAt ? new Date(j.startedAt).toLocaleString('en-IN') : '',
    'Completed At': j.completedAt ? new Date(j.completedAt).toLocaleString('en-IN') : '',
    'Incomplete Reason': j.incompleteReason || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Note': 'No jobs found for this date range' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Daily MIS Report');

  // Summary sheet
  const completed = jobs.filter(j => j.status === 'completed').length;
  const inProgress = jobs.filter(j => j.status === 'in_progress').length;
  const failed = jobs.filter(j => ['failed', 'cancelled'].includes(j.status)).length;
  const pending = jobs.filter(j => ['pending', 'searching_engineer', 'assigned'].includes(j.status)).length;
  const totalRevenue = jobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (j.charge || 0), 0);

  const summaryData = [
    { 'Metric': 'Total Jobs Today', 'Value': jobs.length },
    { 'Metric': 'Completed', 'Value': completed },
    { 'Metric': 'In Progress', 'Value': inProgress },
    { 'Metric': 'Pending / Searching', 'Value': pending },
    { 'Metric': 'Failed / Cancelled', 'Value': failed },
    { 'Metric': 'Revenue Generated (INR)', 'Value': `₹${totalRevenue.toLocaleString('en-IN')}` }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Build styled HTML email body for the daily MIS
 */
const buildMISEmailHTML = (company, stats, dateStr) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 0; }
    .wrap { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #10AFA5 0%, #115e59 100%); padding: 40px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
    .header p { margin: 8px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 15px; color: #334155; margin-bottom: 20px; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 24px 0; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 26px; font-weight: 800; color: #0f172a; display: block; }
    .stat-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .stat-card.completed .stat-value { color: #10b981; }
    .stat-card.failed .stat-value { color: #ef4444; }
    .stat-card.pending .stat-value { color: #f59e0b; }
    .info-box { background: #f0fdfa; border: 1px solid #10AFA5; border-radius: 12px; padding: 16px 20px; margin-top: 20px; font-size: 13px; color: #0f766e; }
    .footer { background: #f8fafc; padding: 24px 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    .badge { display: inline-block; background: #10AFA5; color: white; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div style="font-size:36px;margin-bottom:8px;">📊</div>
      <h1>Daily MIS Report</h1>
      <p>${company.companyName} &bull; ${dateStr}</p>
    </div>
    <div class="body">
      <p class="greeting">Dear <strong>${company.authorizedPerson?.name || company.companyName}</strong>,<br>Here is your end-of-day operational summary for <strong>${dateStr}</strong>.</p>
      
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">${stats.total}</span>
          <div class="stat-label">Total Jobs</div>
        </div>
        <div class="stat-card completed">
          <span class="stat-value">${stats.completed}</span>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card pending">
          <span class="stat-value">${stats.inProgress}</span>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card pending">
          <span class="stat-value">${stats.pending}</span>
          <div class="stat-label">Rescheduled/Pending</div>
        </div>
        <div class="stat-card failed">
          <span class="stat-value">${stats.failed}</span>
          <div class="stat-label">Failed/Cancelled</div>
        </div>
        <div class="stat-card">
          <span class="stat-value">₹${stats.revenue.toLocaleString('en-IN')}</span>
          <div class="stat-label">Revenue</div>
        </div>
      </div>

      <div class="info-box">
        📎 <strong>Full MIS Report attached</strong> — The Excel file contains complete job-level details including engineer assignments, SLA status, and remarks.
      </div>
    </div>
    <div class="footer">
      <span class="badge">AUTOMATED MIS</span><br><br>
      This is an automated report generated by the TazkY B2B Operations Platform.<br>
      For disputes or issues, please contact your account manager.
    </div>
  </div>
</body>
</html>
`;

/**
 * Send MIS email to a single company
 */
const sendMISEmailToCompany = async (company, date) => {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const jobs = await B2BJob.find({
    companyId: company._id,
    date: { $gte: startDate, $lte: endDate }
  }).lean();

  const completed = jobs.filter(j => j.status === 'completed').length;
  const inProgress = jobs.filter(j => j.status === 'in_progress').length;
  const failed = jobs.filter(j => ['failed', 'cancelled'].includes(j.status)).length;
  const pending = jobs.filter(j => ['pending', 'searching_engineer', 'assigned'].includes(j.status)).length;
  const revenue = jobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (j.charge || 0), 0);

  const stats = { total: jobs.length, completed, inProgress, failed, pending, revenue };
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const excelBuffer = await generateMISExcel(company._id, startDate, endDate);

  const transporter = createTransporter();
  const toEmail = company.email;

  if (!toEmail) {
    console.warn(`[MIS Cron] Skipping ${company.companyName} — no email on file`);
    return;
  }

  await transporter.sendMail({
    from: `"TazkY Operations" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `📊 Daily MIS Report — ${company.companyName} — ${dateStr}`,
    html: buildMISEmailHTML(company, stats, dateStr),
    attachments: [
      {
        filename: `TazkY_MIS_${company.companyName.replace(/\s+/g, '_')}_${date.toISOString().split('T')[0]}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    ]
  });

  // Log in MISReport collection
  await MISReport.create({
    companyId: company._id,
    reportType: 'daily',
    startDate,
    endDate,
    status: 'completed',
    generatedAt: new Date()
  });

  console.log(`[MIS Cron] Daily MIS sent to ${company.companyName} (${toEmail})`);
};

/**
 * Start the Daily MIS Cron Scheduler
 * Fires every day at 11:59 PM IST (18:29 UTC)
 */
const startMISCronScheduler = () => {
  // '29 18 * * *' = 11:59 PM IST (UTC+5:30 offset)
  cron.schedule('29 18 * * *', async () => {
    console.log('[MIS Cron] Triggered daily MIS email job...');
    try {
      const today = new Date();

      // Get all approved B2B companies with at least 1 job ever
      const activeCompanies = await B2BCompany.find({ status: 'approved' }).lean();

      let sent = 0;
      let skipped = 0;

      for (const company of activeCompanies) {
        try {
          // Only send if they had at least 1 job today
          const startOfDay = new Date(today);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(today);
          endOfDay.setHours(23, 59, 59, 999);

          const todayJobCount = await B2BJob.countDocuments({
            companyId: company._id,
            date: { $gte: startOfDay, $lte: endOfDay }
          });

          if (todayJobCount === 0) {
            skipped++;
            continue;
          }

          await sendMISEmailToCompany(company, today);
          sent++;
        } catch (companyErr) {
          console.error(`[MIS Cron] Failed for ${company.companyName}:`, companyErr.message);
        }
      }

      console.log(`[MIS Cron] Completed — Sent: ${sent}, Skipped (no jobs today): ${skipped}`);
    } catch (err) {
      console.error('[MIS Cron] Fatal error in daily MIS job:', err);
    }
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('[MIS Cron] Daily MIS email scheduler started (fires at 11:59 PM IST)');
};

module.exports = { startMISCronScheduler, sendMISEmailToCompany };
