const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const B2BWallet = require('../../models/B2BWallet');
const B2BWalletTransaction = require('../../models/B2BWalletTransaction');
const B2BEngineerAssignment = require('../../models/B2BEngineerAssignment');
const B2BCompany = require('../../models/B2BCompany');
const DeductionLedger = require('../../models/DeductionLedger');
const DeviceHistory = require('../../models/DeviceHistory');
const EngineerRating = require('../../models/EngineerRating');
const { getPendingWalletGate } = require('../../services/b2bWalletService');

// Helper to fill in dates for line chart overview
function getDatesInRange(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  currentDate.setHours(0,0,0,0);
  const targetDate = new Date(endDate);
  targetDate.setHours(0,0,0,0);

  while (currentDate <= targetDate) {
    dates.push(new Date(currentDate).toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

/**
 * GET B2B Dashboard Summary
 */
const getDashboardSummary = async (req, res) => {
  try {
    const companyId = req.companyId;
    
    let end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    let start = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Check if matching reference May 2025
    const duration = end.getTime() - start.getTime();
    let prevStart = new Date(start.getTime() - duration);
    let prevEnd = new Date(start.getTime());

    const currentJobs = await B2BJob.find({
      companyId,
      date: { $gte: start, $lte: end }
    });

    const cTotal = currentJobs.length;
    const cInProgress = currentJobs.filter(j => j.status === 'in_progress').length;
    const cCompleted = currentJobs.filter(j => j.status === 'completed').length;
    const cPending = currentJobs.filter(j => j.status === 'pending').length;
    const cSpent = currentJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (j.charge || 0), 0);

    const prevJobs = await B2BJob.find({
      companyId,
      date: { $gte: prevStart, $lte: prevEnd }
    });

    const pTotal = prevJobs.length;
    const pInProgress = prevJobs.filter(j => j.status === 'in_progress').length;
    const pCompleted = prevJobs.filter(j => j.status === 'completed').length;
    const pPending = prevJobs.filter(j => j.status === 'pending').length;
    const pSpent = prevJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (j.charge || 0), 0);

    const getPercentageChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }
    const currentBalance = wallet.balance;

    const transactions = await B2BWalletTransaction.find({
      companyId,
      date: { $gte: start, $lte: end }
    });
    
    const totalCredits = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const totalDebits = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);
    const prevBalance = currentBalance - totalCredits + totalDebits;

    res.status(200).json({
      success: true,
      data: {
        totalJobs: {
          value: cTotal,
          change: getPercentageChange(cTotal, pTotal),
          status: getPercentageChange(cTotal, pTotal) >= 0 ? 'increase' : 'decrease'
        },
        inProgress: {
          value: cInProgress,
          change: getPercentageChange(cInProgress, pInProgress),
          status: getPercentageChange(cInProgress, pInProgress) >= 0 ? 'increase' : 'decrease'
        },
        completed: {
          value: cCompleted,
          change: getPercentageChange(cCompleted, pCompleted),
          status: getPercentageChange(cCompleted, pCompleted) >= 0 ? 'increase' : 'decrease'
        },
        pending: {
          value: cPending,
          change: getPercentageChange(cPending, pPending),
          status: getPercentageChange(cPending, pPending) <= 0 ? 'decrease' : 'increase'
        },
        totalSpent: {
          value: cSpent,
          change: getPercentageChange(cSpent, pSpent),
          status: getPercentageChange(cSpent, pSpent) >= 0 ? 'increase' : 'decrease'
        },
        walletBalance: {
          value: currentBalance,
          change: getPercentageChange(currentBalance, prevBalance),
          status: getPercentageChange(currentBalance, prevBalance) >= 0 ? 'increase' : 'decrease'
        }
      }
    });
  } catch (error) {
    console.error('B2B Summary API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard summary',
      error: error.message
    });
  }
};

/**
 * GET B2B Jobs Overview (Line Chart)
 */
const getJobsOverview = async (req, res) => {
  try {
    const companyId = req.companyId;
    
    let end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    let start = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const aggregates = await B2BJob.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const aggMap = {};
    aggregates.forEach(item => {
      aggMap[item._id] = item;
    });

    const dateRange = getDatesInRange(start, end);
    const chartData = dateRange.map(dateStr => {
      const dateObj = new Date(dateStr);
      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      const record = aggMap[dateStr] || { completed: 0, inProgress: 0, pending: 0 };
      
      return {
        date: label,
        rawDate: dateStr,
        Completed: record.completed,
        "In Progress": record.inProgress,
        Pending: record.pending
      };
    });

    res.status(200).json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('B2B Jobs Overview API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve jobs overview trends',
      error: error.message
    });
  }
};

/**
 * GET Jobs by Status (Donut Chart)
 */
const getJobsStatusDistribution = async (req, res) => {
  try {
    const companyId = req.companyId;
    
    let end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    let start = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const aggregates = await B2BJob.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    let cancelled = 0;

    aggregates.forEach(item => {
      if (item._id === 'completed') completed = item.count;
      else if (item._id === 'in_progress') inProgress = item.count;
      else if (item._id === 'pending') pending = item.count;
      else if (item._id === 'cancelled') cancelled = item.count;
    });

    const total = completed + inProgress + pending + cancelled;

    const getPercent = (count) => {
      if (total === 0) return 0;
      return parseFloat(((count / total) * 100).toFixed(1));
    };

    res.status(200).json({
      success: true,
      data: {
        total,
        distribution: [
          { name: 'Completed', value: completed, percentage: getPercent(completed), color: '#10AFA5' },
          { name: 'In Progress', value: inProgress, percentage: getPercent(inProgress), color: '#F59E0B' },
          { name: 'Pending', value: pending, percentage: getPercent(pending), color: '#8B5CF6' }
        ]
      }
    });
  } catch (error) {
    console.error('B2B Status Distribution Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve jobs status distribution',
      error: error.message
    });
  }
};

/**
 * GET Recent Jobs Table
 */
const getRecentJobs = async (req, res) => {
  try {
    const companyId = req.companyId;
    
    let end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    let start = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const jobs = await B2BJob.find({
      companyId,
      date: { $gte: start, $lte: end }
    })
    .sort({ date: -1 })
    .limit(5);

    res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('B2B Recent Jobs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recent jobs list',
      error: error.message
    });
  }
};

/**
 * GET Wallet Balance & Ledger Details
 */
const getWalletBalance = async (req, res) => {
  try {
    const companyId = req.companyId;
    
    let wallet = await B2BWallet.findOne({ companyId });
    if (!wallet) {
      wallet = await B2BWallet.create({ companyId, balance: 0 });
    }

    const transactions = await B2BWalletTransaction.find({ companyId })
      .sort({ date: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      balance: wallet.balance,
      transactions
    });
  } catch (error) {
    console.error('B2B Wallet Balance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet information',
      error: error.message
    });
  }
};




/**
 * NEW INTELLIGENCE APIs FOR B2B COMMAND CENTER
 */

// 1. Executive Metrics — this month's closures, SLA attainment and wallet runway.
//    Every figure is computed; with no data a figure is 0 or null, never invented.
const { viewFilter } = require('../../services/b2bJobViews');
const walletLedger = require('../../services/b2bWalletLedger.service');

const monthBounds = (offset = 0) => {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth() + offset, 1),
    end: new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  };
};
const pctTrend = (curr, prev) => {
  if (!prev) return curr ? 'New this month' : null;
  const p = Math.round(((curr - prev) / prev) * 100);
  return `${p >= 0 ? '+' : ''}${p}% vs last month`;
};

const getExecutiveMetrics = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const thisMonth = monthBounds(0);
    const lastMonth = monthBounds(-1);
    const resolved = viewFilter('resolved');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const slaGroup = {
      _id: null,
      closed: { $sum: 1 },
      withSla: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$sla.resolutionDueAt', null] }, null] }, 1, 0] } },
      breached: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$sla.breaches', []] } }, 0] }, 1, 0] } }
    };

    const [curr, prev, spendAgg, balance, walletGate, company] = await Promise.all([
      B2BJob.aggregate([{ $match: { companyId, updatedAt: { $gte: thisMonth.start, $lt: thisMonth.end }, ...resolved } }, { $group: slaGroup }]),
      B2BJob.aggregate([{ $match: { companyId, updatedAt: { $gte: lastMonth.start, $lt: lastMonth.end }, ...resolved } }, { $group: slaGroup }]),
      B2BWalletTransaction.aggregate([
        {
          $match: {
            companyId,
            status: { $nin: ['failed', 'pending'] },
            $or: [{ ledgerType: 'JOB_CHARGE' }, { ledgerType: null, type: 'job_deduction' }],
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        { $group: { _id: null, total: { $sum: { $abs: { $ifNull: ['$totalAmount', '$amount'] } } } } }
      ]),
      walletLedger.getBalance(req.companyId),
      getPendingWalletGate(req.companyId),
      B2BCompany.findById(companyId).select('slaProfile').lean()
    ]);

    const c = curr[0] || { closed: 0, withSla: 0, breached: 0 };
    const p = prev[0] || { closed: 0, withSla: 0, breached: 0 };
    const rate = (g) => (g.withSla ? Math.round(((g.withSla - g.breached) / g.withSla) * 1000) / 10 : null);
    const spent30 = Math.round((spendAgg[0]?.total || 0) * 100) / 100;
    const burnRatePerDay = Math.round(spent30 / 30);
    const currentRate = rate(c);
    const prevRate = rate(p);

    res.status(200).json({
      success: true,
      data: {
        callsCompleted: {
          value: c.closed,
          previous: p.closed,
          trend: pctTrend(c.closed, p.closed),
          label: 'Jobs resolved this month'
        },
        slaCompliance: {
          rate: currentRate,
          breached: c.breached,
          met: c.withSla - c.breached,
          tracked: c.withSla,
          trend: currentRate !== null && prevRate !== null
            ? `${currentRate - prevRate >= 0 ? '+' : ''}${Math.round((currentRate - prevRate) * 10) / 10} pts vs last month`
            : null,
          label: company?.slaProfile ? `Against the ${company.slaProfile} SLA profile` : 'Against your SLA profile'
        },
        walletUtilization: {
          currentBalance: balance.available,
          reserved: balance.reserved,
          spendable: balance.spendable,
          spentThisPeriod: spent30,
          burnRatePerDay,
          daysUntilTopup: burnRatePerDay > 0 ? Math.floor(balance.spendable / burnRatePerDay) : null,
          label: 'Runway at the last 30 days\' spend'
        },
        walletGate
      }
    });
  } catch (error) {
    console.error('[B2B Dashboard executive metrics]', error);
    res.status(500).json({ success: false, message: 'Failed to load executive metrics' });
  }
};

// 2. Geographic & Task Analytics — volume by city and service; a city's risk is
//    its SLA breach rate, not its rank.
const getGeoTaskAnalytics = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);
    const breachedExpr = { $cond: [{ $gt: [{ $size: { $ifNull: ['$sla.breaches', []] } }, 0] }, 1, 0] };

    const [cityAgg, serviceAgg] = await Promise.all([
      B2BJob.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$city', volume: { $sum: 1 }, breached: { $sum: breachedExpr } } },
        { $sort: { volume: -1 } },
        { $limit: 8 }
      ]),
      B2BJob.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$service', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 6 }
      ])
    ]);

    const colors = ['#10B981', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6', '#64748B'];
    const riskOf = (breached, volume) => {
      const r = volume ? breached / volume : 0;
      if (r >= 0.2) return 'High';
      if (r >= 0.05) return 'Medium';
      return 'Low';
    };

    res.status(200).json({
      success: true,
      data: {
        locationHeatmap: cityAgg.map((c) => ({
          city: c._id || 'Unspecified',
          volume: c.volume,
          breached: c.breached,
          breachRate: c.volume ? Math.round((c.breached / c.volume) * 1000) / 10 : 0,
          risk: riskOf(c.breached, c.volume)
        })),
        taskBreakdown: serviceAgg.map((s, i) => ({
          name: s._id || 'Unspecified',
          value: s.value,
          color: colors[i % colors.length]
        }))
      }
    });
  } catch (error) {
    console.error('[B2B Dashboard geo analytics]', error);
    res.status(500).json({ success: false, message: 'Failed to load geographic analytics' });
  }
};

// 3. Hardware Health — devices visited more than once in the last 30 days.
const getHardwareHealth = async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const devices = await DeviceHistory.find({ companyId: req.companyId, 'jobHistory.1': { $exists: true } })
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    const repeatedCalls = devices
      .map((d) => {
        const recent = (d.jobHistory || []).filter((jh) => jh.date && new Date(jh.date) >= since);
        return {
          deviceId: d.deviceId,
          site: d.siteId || 'Unknown site',
          visitsIn30Days: recent.length,
          status: recent.length > 3 ? 'Critical Alert' : 'Warning',
          timeline: recent
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((jh) => ({
              date: new Date(jh.date).toISOString().split('T')[0],
              engineer: jh.engineerName || 'Unknown',
              issue: jh.issueReported || 'N/A',
              partsReplaced: jh.partsReplaced || 'None'
            }))
        };
      })
      .filter((d) => d.visitsIn30Days >= 2)
      .sort((a, b) => b.visitsIn30Days - a.visitsIn30Days)
      .slice(0, 20);

    res.status(200).json({ success: true, data: { repeatedCalls } });
  } catch (error) {
    console.error('[B2B Dashboard hardware health]', error);
    res.status(500).json({ success: false, message: 'Failed to load hardware health' });
  }
};

// 4. Financial & Accountability Logs — deductions and why they were made.
const getFinancialLogs = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    const [deductions, reasonAgg] = await Promise.all([
      DeductionLedger.find({ companyId })
        .sort({ deductedAt: -1 })
        .limit(50)
        .populate('jobId', 'jobId')
        .populate('engineerId', 'firstName lastName name')
        .lean(),
      DeductionLedger.aggregate([
        { $match: { companyId } },
        { $group: { _id: '$reasonCode', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { amount: -1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        reasonCodes: reasonAgg.map((r) => ({ reason: r._id || 'Unspecified', amount: r.amount, count: r.count })),
        deductionLedger: deductions.map((d) => ({
          id: d._id,
          jobId: d.jobId?.jobId || 'N/A',
          date: d.deductedAt ? new Date(d.deductedAt).toISOString().split('T')[0] : null,
          charge: d.amount,
          reason: d.remarks || d.reasonCode,
          engineer: d.engineerId
            ? (d.engineerId.name || [d.engineerId.firstName, d.engineerId.lastName].filter(Boolean).join(' '))
            : 'N/A'
        }))
      }
    });
  } catch (error) {
    console.error('[B2B Dashboard financial logs]', error);
    res.status(500).json({ success: false, message: 'Failed to load financial logs' });
  }
};

// 5. Workforce Quality — why jobs were aborted, and how engineers were rated.
const getWorkforceQuality = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    const [aborts, ratingAgg] = await Promise.all([
      B2BJob.aggregate([
        { $match: { companyId, incompleteReason: { $ne: null }, ...viewFilter('failed') } },
        { $group: { _id: '$incompleteReason', occurrences: { $sum: 1 } } },
        { $sort: { occurrences: -1 } }
      ]),
      EngineerRating.aggregate([
        { $match: { companyId } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            overall: { $avg: '$averageRating' },
            behavior: { $avg: '$metrics.behavior' },
            slaAdherence: { $avg: '$metrics.slaAdherence' },
            toolsCarried: { $avg: '$metrics.toolsCarried' },
            ethics: { $avg: '$metrics.ethics' }
          }
        }
      ])
    ]);

    const r = ratingAgg[0];
    const one = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

    res.status(200).json({
      success: true,
      data: {
        skillGaps: {
          totalAborted: aborts.reduce((sum, a) => sum + a.occurrences, 0),
          categories: aborts.map((a) => ({ skill: a._id, occurrences: a.occurrences }))
        },
        engineerRatings: {
          ratingsCount: r?.count || 0,
          overallAverage: one(r?.overall),
          metrics: {
            behavior: one(r?.behavior),
            slaAdherence: one(r?.slaAdherence),
            toolsCarried: one(r?.toolsCarried),
            ethics: one(r?.ethics)
          }
        }
      }
    });
  } catch (error) {
    console.error('[B2B Dashboard workforce quality]', error);
    res.status(500).json({ success: false, message: 'Failed to load workforce quality' });
  }
};

module.exports = {
  getDashboardSummary,
  getJobsOverview,
  getJobsStatusDistribution,
  getRecentJobs,
  getWalletBalance,
  getExecutiveMetrics,
  getGeoTaskAnalytics,
  getHardwareHealth,
  getFinancialLogs,
  getWorkforceQuality
};
