const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');
const B2BInvoice = require('../models/B2BInvoice');
const Engineer = require('../models/Engineer');

/**
 * Builds standard mongoose search query based on company constraints and filters
 */
const buildJobQuery = (companyId, filters = {}) => {
  const query = { companyId: new mongoose.Types.ObjectId(companyId) };

  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) {
      query.date.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      query.date.$lte = end;
    }
  }

  if (filters.service) {
    query.service = filters.service;
  }

  if (filters.engineer && mongoose.Types.ObjectId.isValid(filters.engineer)) {
    query.assignedTo = new mongoose.Types.ObjectId(filters.engineer);
  }

  if (filters.city) {
    query.city = filters.city;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  return query;
};

/**
 * Format duration in milliseconds into a standard human readable string: e.g. "1h 45m"
 */
const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '1h 30m'; // Default fallback
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

/**
 * Get internal report summary statistics (optionally compared MoM)
 */
const getReportSummaryInternal = async (companyId, query) => {
  const stats = await B2BJob.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalJobs: { $sum: 1 },
        completedJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pendingJobs: {
          $sum: {
            $cond: [
              { $in: ['$status', ['pending', 'searching_engineer', 'assigned', 'in_progress']] },
              1,
              0
            ]
          }
        },
        cancelledJobs: {
          $sum: {
            $cond: [
              { $in: ['$status', ['cancelled', 'failed']] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const summary = stats[0] || {
    totalJobs: 0,
    completedJobs: 0,
    pendingJobs: 0,
    cancelledJobs: 0
  };

  // Get total rating of completed jobs for this query
  const ratingStats = await B2BJob.aggregate([
    { 
      $match: { 
        ...query, 
        status: 'completed', 
        assignedTo: { $ne: null } 
      } 
    },
    {
      $lookup: {
        from: 'engineers',
        localField: 'assignedTo',
        foreignField: '_id',
        as: 'engineerInfo'
      }
    },
    { $unwind: '$engineerInfo' },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$engineerInfo.rating' }
      }
    }
  ]);
  summary.avgRating = ratingStats[0] ? parseFloat(ratingStats[0].avgRating.toFixed(1)) : 4.5;

  // Calculate Spend for this query
  const spendQuery = {
    companyId: query.companyId,
    type: 'job_deduction',
    status: { $ne: 'failed' }
  };
  if (query.date) {
    spendQuery.date = query.date;
  }
  const spendStats = await B2BWalletTransaction.aggregate([
    { $match: spendQuery },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  summary.totalSpend = Math.abs(spendStats[0]?.total || 0);

  return summary;
};

/**
 * Service: Fetch Summary Cards Data
 */
const getReportSummary = async (companyId, filters = {}) => {
  const currentQuery = buildJobQuery(companyId, filters);
  const currentSummary = await getReportSummaryInternal(companyId, currentQuery);

  // Compute month-over-month growth values for standard period comparisons
  // Determine previous month boundaries for baseline comparison
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const prevQuery = {
    companyId: new mongoose.Types.ObjectId(companyId),
    date: { $gte: prevMonthStart, $lte: prevMonthEnd }
  };

  const prevSummary = await getReportSummaryInternal(companyId, prevQuery);
  const prevMonthName = prevMonthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const calculateMomChange = (curr, prev, isRating = false) => {
    if (isRating) {
      const diff = curr - prev;
      const arrow = diff >= 0 ? '↑' : '↓';
      return `${arrow} ${Math.abs(diff).toFixed(1)} vs ${prevMonthName}`;
    }
    const diff = curr - prev;
    const percent = prev > 0 ? (diff / prev) * 100 : diff > 0 ? 100 : 0;
    const arrow = percent >= 0 ? '↑' : '↓';
    return `${arrow} ${Math.abs(percent).toFixed(1)}% vs ${prevMonthName}`;
  };

  return {
    totalJobs: {
      value: currentSummary.totalJobs,
      changeText: calculateMomChange(currentSummary.totalJobs, prevSummary.totalJobs)
    },
    completedJobs: {
      value: currentSummary.completedJobs,
      changeText: calculateMomChange(currentSummary.completedJobs, prevSummary.completedJobs)
    },
    pendingJobs: {
      value: currentSummary.pendingJobs,
      changeText: calculateMomChange(currentSummary.pendingJobs, prevSummary.pendingJobs)
    },
    cancelledJobs: {
      value: currentSummary.cancelledJobs,
      changeText: calculateMomChange(currentSummary.cancelledJobs, prevSummary.cancelledJobs)
    },
    totalSpend: {
      value: currentSummary.totalSpend,
      changeText: calculateMomChange(currentSummary.totalSpend, prevSummary.totalSpend)
    },
    averageRating: {
      value: currentSummary.avgRating,
      changeText: calculateMomChange(currentSummary.avgRating, prevSummary.avgRating, true)
    }
  };
};

/**
 * Service: Fetch Service Performance Report
 */
const getServicePerformance = async (companyId, filters = {}) => {
  const matchQuery = buildJobQuery(companyId, filters);

  const serviceStats = await B2BJob.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$service',
        totalJobs: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pending: {
          $sum: {
            $cond: [
              { $in: ['$status', ['pending', 'searching_engineer', 'assigned', 'in_progress']] },
              1,
              0
            ]
          }
        },
        totalCompletionTime: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $ne: ['$completedAt', null] }
                ]
              },
              { 
                $subtract: [
                  '$completedAt', 
                  { $ifNull: ['$startedAt', { $ifNull: ['$assignedAt', '$createdAt'] }] }
                ] 
              },
              0
            ]
          }
        },
        completedWithTimeCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 'completed'] },
                  { $ne: ['$completedAt', null] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { totalJobs: -1 } }
  ]);

  return serviceStats.map(stat => {
    const totalJobs = stat.totalJobs || 0;
    const completed = stat.completed || 0;
    const completionRate = totalJobs > 0 ? Math.round((completed / totalJobs) * 100) : 0;
    const avgDurationMs = stat.completedWithTimeCount > 0 ? (stat.totalCompletionTime / stat.completedWithTimeCount) : 0;

    return {
      serviceName: stat._id || 'General Maintenance',
      totalJobs,
      completed,
      pending: stat.pending || 0,
      completionRate: `${completionRate}%`,
      averageCompletionTime: formatDuration(avgDurationMs)
    };
  });
};

/**
 * Service: Fetch Engineer Performance Report
 */
const getEngineerPerformance = async (companyId, filters = {}) => {
  const matchQuery = buildJobQuery(companyId, filters);
  
  // Ensure we aggregate only assigned jobs
  matchQuery.assignedTo = { $ne: null };

  const engineerStats = await B2BJob.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$assignedTo',
        assignedJobs: { $sum: 1 },
        completedJobs: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        activeJobs: {
          $sum: {
            $cond: [
              { $in: ['$status', ['assigned', 'in_progress']] },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'engineers',
        localField: '_id',
        foreignField: '_id',
        as: 'engineerInfo'
      }
    },
    { $unwind: { path: '$engineerInfo', preserveNullAndEmptyArrays: true } },
    { $sort: { assignedJobs: -1 } }
  ]);

  return engineerStats.map(stat => ({
    engineerName: stat.engineerInfo?.name || 'Assigned Specialist',
    profilePhoto: stat.engineerInfo?.profilePhoto || null,
    assignedJobs: stat.assignedJobs || 0,
    completedJobs: stat.completedJobs || 0,
    activeJobs: stat.activeJobs || 0,
    averageRating: stat.engineerInfo?.rating || 4.5
  }));
};

/**
 * Service: Fetch Expense Summary Report (recharges, spending trends)
 */
const getExpenseSummary = async (companyId, filters = {}) => {
  const cId = new mongoose.Types.ObjectId(companyId);

  // Time boundaries for date filtering of wallet transactions
  const walletQuery = { companyId: cId, status: { $ne: 'failed' } };
  if (filters.startDate || filters.endDate) {
    walletQuery.date = {};
    if (filters.startDate) walletQuery.date.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      walletQuery.date.$lte = end;
    }
  }

  // Calculate recharge/topup totals
  const topupQuery = { ...walletQuery, type: 'topup' };
  const topupStats = await B2BWalletTransaction.aggregate([
    { $match: topupQuery },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  const totalWalletRecharge = topupStats[0]?.total || 0;

  // Calculate amount used totals
  const deductionQuery = { ...walletQuery, type: 'job_deduction' };
  const deductionStats = await B2BWalletTransaction.aggregate([
    { $match: deductionQuery },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  const totalAmountUsed = Math.abs(deductionStats[0]?.total || 0);

  // Get current remaining balance
  const wallet = await B2BWallet.findOne({ companyId: cId });
  const totalRemainingWallet = wallet?.balance || 0;

  // Calculate total invoice amounts
  const invoiceQuery = { companyId: cId };
  if (filters.startDate || filters.endDate) {
    invoiceQuery.invoiceDate = {};
    if (filters.startDate) invoiceQuery.invoiceDate.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      invoiceQuery.invoiceDate.$lte = end;
    }
  }
  const invoiceStats = await B2BInvoice.aggregate([
    { $match: invoiceQuery },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);
  const totalInvoiceAmount = invoiceStats[0]?.total || 0;

  // Generate 6-month monthly expense trendline
  const today = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);

  const trendStats = await B2BWalletTransaction.aggregate([
    {
      $match: {
        companyId: cId,
        type: 'job_deduction',
        status: { $ne: 'failed' },
        date: { $gte: sixMonthsAgo }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' }
         },
        totalUsed: { $sum: '$totalAmount' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  const monthsList = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    monthsList.push({
      month: label,
      year: d.getFullYear(),
      monthNum: d.getMonth() + 1,
      amount: 0
    });
  }

  trendStats.forEach(stat => {
    const match = monthsList.find(m => m.year === stat._id.year && m.monthNum === stat._id.month);
    if (match) {
      match.amount = Math.abs(stat.totalUsed);
    }
  });

  return {
    totalWalletRecharge,
    totalAmountUsed,
    totalRemainingWallet,
    totalInvoiceAmount,
    monthlyExpenseTrend: monthsList.map(m => ({ month: m.month, amount: m.amount }))
  };
};

/**
 * Service: Fetch Job Status Distribution Breakdown
 */
const getJobStatusDistribution = async (companyId, filters = {}) => {
  const matchQuery = buildJobQuery(companyId, filters);

  const statusStats = await B2BJob.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  let totalJobs = 0;
  let completed = 0;
  let pending = 0;
  let cancelled = 0;

  statusStats.forEach(stat => {
    const count = stat.count;
    totalJobs += count;
    const status = stat._id;
    if (status === 'completed') {
      completed += count;
    } else if (['pending', 'searching_engineer', 'assigned', 'in_progress'].includes(status)) {
      pending += count;
    } else if (['cancelled', 'failed'].includes(status)) {
      cancelled += count;
    }
  });

  return {
    totalJobs,
    completed,
    pending,
    cancelled
  };
};

module.exports = {
  getReportSummary,
  getServicePerformance,
  getEngineerPerformance,
  getExpenseSummary,
  getJobStatusDistribution,
  buildJobQuery
};
