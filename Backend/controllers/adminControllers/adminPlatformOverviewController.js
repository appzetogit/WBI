/**
 * Admin Platform Overview
 * ------------------------
 * Backend-aggregated summary of every business area on the platform —
 * B2B, Vendors, Engineers (vendor-employed vs freelancer), payments/
 * withdrawals, and quality — for the Admin Command Center dashboard.
 *
 * Existing /admin/dashboard/stats already covers Users/Vendors(count)/
 * Workers/Bookings from the legacy Booking model — this controller adds the
 * parts that were never surfaced: B2B, vendor finance wallets, engineer
 * wallets split by employment type, and platform-wide quality metrics.
 * All numbers are computed with Mongo aggregation, never by loading full
 * collections into memory.
 */
const mongoose = require('mongoose');
const B2BJob = require('../../models/B2BJob');
const B2BCompany = require('../../models/B2BCompany');
const B2BWallet = require('../../models/B2BWallet');
const Vendor = require('../../models/Vendor');
const VendorFinanceWallet = require('../../models/VendorFinanceWallet');
const Engineer = require('../../models/Engineer');
const Withdrawal = require('../../models/Withdrawal');
const JobStatusTimeline = require('../../models/JobStatusTimeline');

const B2B_STATUS_BUCKETS = {
  new: ['pending', 'pending_wallet', 'searching_engineer'],
  dispatched: ['assigned', 'accepted'],
  inProgress: ['travelling', 'arrived', 'in_progress'],
  awaitingReview: ['completion_submitted', 'admin_review', 'on_hold', 'revision_required'],
  completed: ['completed', 'closed'],
  cancelled: ['cancelled', 'rejected', 'failed'],
  escalated: ['escalated']
};

const buildDateMatch = (startDate, endDate, field = 'createdAt') => {
  if (!startDate && !endDate) return {};
  const match = {};
  const s = startDate ? new Date(startDate) : new Date(0);
  const e = endDate ? new Date(endDate) : new Date();
  e.setHours(23, 59, 59, 999);
  match[field] = { $gte: s, $lte: e };
  return match;
};

/**
 * GET /api/admin/dashboard/platform-overview
 * ?startDate=&endDate= (optional — omit for all-time)
 */
const getPlatformOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const createdMatch = buildDateMatch(startDate, endDate, 'createdAt');
    const completedMatch = buildDateMatch(startDate, endDate, 'completedAt');

    const [
      // ── B2B ──────────────────────────────────────────────────────────
      totalCompanies,
      activeCompanies,
      pendingOnboarding,
      jobStatusCounts,
      b2bRevenueAgg,
      b2bWalletTotals,
      companyWalletTotal,

      // ── Vendors ──────────────────────────────────────────────────────
      totalVendors,
      approvedVendors,
      pendingVendors,
      vendorWalletAgg,
      vendorFinanceAgg,

      // ── Engineers (vendor-employed vs freelancer) ───────────────────
      engineerCounts,
      engineerActiveJobsAgg,
      freelancerWalletAgg,

      // ── Payments / Withdrawals ───────────────────────────────────────
      withdrawalAgg,

      // ── Quality ──────────────────────────────────────────────────────
      slaAgg,
      completedJobIdsForFtf
    ] = await Promise.all([
      B2BCompany.countDocuments({ deletedAt: null }),
      B2BCompany.countDocuments({ isActive: true, verificationStatus: 'approved', deletedAt: null }),
      B2BCompany.countDocuments({ verificationStatus: { $in: ['pending', 'verified'] }, deletedAt: null }),

      B2BJob.aggregate([
        { $match: createdMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      B2BJob.aggregate([
        { $match: { status: { $in: ['completed', 'closed'] }, ...completedMatch } },
        { $group: { _id: null, revenue: { $sum: '$charge' }, jobs: { $sum: 1 } } }
      ]),

      B2BWallet.aggregate([
        { $group: { _id: null, escrowHeld: { $sum: '$escrowBalance' }, totalSpent: { $sum: '$totalSpent' } } }
      ]),

      B2BCompany.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: null, totalBalance: { $sum: '$walletBalance' } } }
      ]),

      Vendor.countDocuments({}),
      Vendor.countDocuments({ approvalStatus: 'approved' }),
      Vendor.countDocuments({ approvalStatus: 'pending' }),

      Vendor.aggregate([
        { $group: { _id: null, totalEarnings: { $sum: '$wallet.earnings' }, totalDues: { $sum: '$wallet.dues' } } }
      ]),

      VendorFinanceWallet.aggregate([
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: '$availableBalance' },
            totalEscrow: { $sum: '$escrowBalance' },
            totalPendingSettlement: { $sum: '$pendingSettlement' }
          }
        }
      ]),

      Engineer.aggregate([
        {
          $group: {
            _id: { type: { $ifNull: ['$engineerType', 'freelancer'] }, online: { $eq: ['$status', 'ONLINE'] } },
            count: { $sum: 1 }
          }
        }
      ]),

      B2BJob.aggregate([
        {
          $match: {
            assignedTo: { $ne: null },
            status: { $in: ['accepted', 'travelling', 'arrived', 'in_progress'] }
          }
        },
        { $group: { _id: '$assignmentType', count: { $sum: 1 } } }
      ]),

      Engineer.aggregate([
        { $match: { engineerType: 'freelancer' } },
        {
          $group: {
            _id: null,
            walletBalance: { $sum: '$wallet.balance' },
            pendingPayout: { $sum: '$wallet.pendingBalance' },
            totalEarnings: { $sum: '$wallet.totalEarnings' }
          }
        }
      ]),

      Withdrawal.aggregate([
        { $match: { status: { $in: ['pending', 'awaiting_manual_transfer', 'processing'] } } },
        {
          $group: {
            _id: {
              $cond: [{ $in: ['$source', ['engineer', 'worker']] }, 'engineer', 'vendor']
            },
            count: { $sum: 1 },
            amount: { $sum: '$amount' }
          }
        }
      ]),

      B2BJob.aggregate([
        { $match: { status: { $in: ['completed', 'closed'] }, completedAt: { $ne: null }, ...completedMatch } },
        {
          $project: {
            withinSla: {
              $lte: [
                { $subtract: ['$completedAt', '$createdAt'] },
                { $multiply: [{ $ifNull: ['$slaTarget', 24] }, 3600000] }
              ]
            }
          }
        },
        { $group: { _id: null, total: { $sum: 1 }, withinSla: { $sum: { $cond: ['$withinSla', 1, 0] } } } }
      ]),

      B2BJob.distinct('_id', { status: { $in: ['completed', 'closed'] }, ...completedMatch })
    ]);

    // First-time fix rate: completed jobs that were never sent back for
    // revision (mirrors the same platform-wide check used in the B2B
    // per-company report, just without a companyId scope).
    let firstTimeFixRate = null;
    if (completedJobIdsForFtf.length > 0) {
      const revisedJobIds = await JobStatusTimeline.distinct('jobId', {
        jobId: { $in: completedJobIdsForFtf },
        status: 'revision_required'
      });
      firstTimeFixRate = Math.round(
        ((completedJobIdsForFtf.length - revisedJobIds.length) / completedJobIdsForFtf.length) * 100
      );
    }

    // ── Shape B2B job status buckets ──────────────────────────────────
    const statusCountMap = new Map(jobStatusCounts.map((r) => [r._id, r.count]));
    const jobsByStatus = {};
    let totalJobsInRange = 0;
    Object.entries(B2B_STATUS_BUCKETS).forEach(([bucket, statuses]) => {
      const n = statuses.reduce((sum, s) => sum + (statusCountMap.get(s) || 0), 0);
      jobsByStatus[bucket] = n;
      totalJobsInRange += n;
    });

    // ── Shape engineer counts (vendor-employed vs freelancer, online split) ──
    const engineerShape = {
      vendorEmployed: { total: 0, online: 0 },
      freelancer: { total: 0, online: 0 }
    };
    engineerCounts.forEach((row) => {
      const bucket = row._id.type === 'vendor_engineer' ? 'vendorEmployed' : 'freelancer';
      engineerShape[bucket].total += row.count;
      if (row._id.online) engineerShape[bucket].online += row.count;
    });

    const engineerActiveJobsMap = new Map(engineerActiveJobsAgg.map((r) => [r._id, r.count]));
    const withdrawalMap = new Map(withdrawalAgg.map((r) => [r._id, { count: r.count, amount: r.amount }]));

    const b2bRevenue = b2bRevenueAgg[0] || { revenue: 0, jobs: 0 };
    const slaStats = slaAgg[0] || { total: 0, withinSla: 0 };

    // Live job pipeline across every company — the same view definitions the
    // B2B panel and its sidebar use, so admin and companies count alike.
    const { viewCountFacets, VIEW_KEYS } = require('../../services/b2bJobViews');
    const [pipelineAgg, unassignedCount, vendorOfferCount] = await Promise.all([
      B2BJob.aggregate([{ $facet: viewCountFacets() }]),
      B2BJob.countDocuments({ lifecycleStatus: 'UNASSIGNED' }),
      B2BJob.countDocuments({ assignedVendorId: null, 'notifiedVendors.0': { $exists: true }, lifecycleStatus: { $in: ['ROUTED', 'PENDING_ASSIGNMENT'] } })
    ]);
    const pipeline = Object.fromEntries(
      VIEW_KEYS.map((k) => [k, pipelineAgg[0]?.[k]?.[0]?.count || 0])
    );
    pipeline.unassigned = unassignedCount;
    pipeline.awaitingVendor = vendorOfferCount;

    res.status(200).json({
      success: true,
      data: {
        b2b: {
          totalCompanies,
          activeCompanies,
          pendingOnboarding,
          totalJobsInRange,
          jobsByStatus,
          revenueInRange: b2bRevenue.revenue || 0,
          completedJobsInRange: b2bRevenue.jobs || 0,
          totalWalletBalance: companyWalletTotal[0]?.totalBalance || 0,
          escrowHeld: b2bWalletTotals[0]?.escrowHeld || 0,
          totalSpent: b2bWalletTotals[0]?.totalSpent || 0,
          /** Live counts, all time: pending, dispatched, en_route, …, sla_breached, unassigned. */
          pipeline
        },
        vendors: {
          total: totalVendors,
          approved: approvedVendors,
          pending: pendingVendors,
          legacyWalletEarnings: vendorWalletAgg[0]?.totalEarnings || 0,
          legacyWalletDues: vendorWalletAgg[0]?.totalDues || 0,
          financeAvailableBalance: vendorFinanceAgg[0]?.totalAvailable || 0,
          financeEscrowBalance: vendorFinanceAgg[0]?.totalEscrow || 0,
          financePendingSettlement: vendorFinanceAgg[0]?.totalPendingSettlement || 0
        },
        engineers: {
          vendorEmployed: {
            total: engineerShape.vendorEmployed.total,
            online: engineerShape.vendorEmployed.online,
            activeJobs: engineerActiveJobsMap.get('vendor_engineer') || 0
          },
          freelancer: {
            total: engineerShape.freelancer.total,
            online: engineerShape.freelancer.online,
            activeJobs: engineerActiveJobsMap.get('freelancer') || 0,
            walletBalance: freelancerWalletAgg[0]?.walletBalance || 0,
            pendingPayout: freelancerWalletAgg[0]?.pendingPayout || 0,
            totalEarnings: freelancerWalletAgg[0]?.totalEarnings || 0
          }
        },
        payments: {
          pendingWithdrawals: {
            vendor: withdrawalMap.get('vendor') || { count: 0, amount: 0 },
            engineer: withdrawalMap.get('engineer') || { count: 0, amount: 0 }
          }
        },
        quality: {
          slaCompliance: slaStats.total > 0 ? Math.round((slaStats.withinSla / slaStats.total) * 100) : null,
          firstTimeFixRate
        }
      }
    });
  } catch (error) {
    console.error('getPlatformOverview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch platform overview' });
  }
};

module.exports = {
  getPlatformOverview
};
