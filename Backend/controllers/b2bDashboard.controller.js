/**
 * B2B operational analytics (heatmap, SLA, repeat calls, ledger).
 *
 * Rewritten from a prototype that:
 *   - resolved the company by a hardcoded literal email, ignoring the caller
 *   - returned EVERY escrowed booking's GPS coordinates platform-wide to any
 *     authenticated user of any role
 *   - reported SLA as `completedJobs * 0.92` — a fabricated constant
 *   - injected fake repeat-call sites and fake wallet transactions whenever the
 *     real result set was empty
 *
 * Every figure below is now derived from this company's own B2BJob /
 * B2BWallet records. Empty data returns an empty result — never a fabricated one.
 *
 * Scope: `req.companyId` is set by `authenticate` from the JWT and is never
 * read from the request body or query.
 */

const mongoose = require('mongoose');
const B2BJob = require('../models/B2BJob');
const B2BWallet = require('../models/B2BWallet');
const B2BWalletTransaction = require('../models/B2BWalletTransaction');

/** Statuses that represent a finished job. */
const COMPLETED_STATUSES = ['completed', 'closed'];

const resolveCompanyId = (req) => {
  const id = req.companyId || req.user?.companyId || req.user?.id;
  return id ? new mongoose.Types.ObjectId(String(id)) : null;
};

const parseWindow = (req) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from, days };
};

/**
 * GET /api/b2b-dashboard/heatmap
 * Job density for this company only.
 */
exports.getB2BHeatmapData = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Company context required' });
    }

    const { from } = parseWindow(req);

    const jobs = await B2BJob.find({
      companyId,
      createdAt: { $gte: from },
      'coordinates.coordinates': { $exists: true, $ne: [] }
    })
      .select('coordinates status service city')
      .limit(5000)
      .lean();

    const heatmapData = jobs
      .filter((j) => Array.isArray(j.coordinates?.coordinates) && j.coordinates.coordinates.length === 2)
      .map((j) => ({
        lat: j.coordinates.coordinates[1],
        lng: j.coordinates.coordinates[0],
        intensity: 1,
        status: j.status,
        service: j.service,
        city: j.city
      }));

    return res.status(200).json({ success: true, data: heatmapData });
  } catch (error) {
    console.error('[B2B Dashboard] heatmap error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load heatmap data' });
  }
};

/**
 * GET /api/b2b-dashboard/sla
 * Real SLA adherence: completion time measured against each job's slaTarget.
 * Jobs without an slaTarget are excluded from the percentage rather than
 * silently counted as compliant.
 */
exports.getB2BSLAMetrics = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Company context required' });
    }

    const { from, days } = parseWindow(req);
    const match = { companyId, createdAt: { $gte: from } };

    const [totals] = await B2BJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          completedJobs: {
            $sum: { $cond: [{ $in: ['$status', COMPLETED_STATUSES] }, 1, 0] }
          },
          // Measurable = completed, with both an SLA target and the timestamps
          // needed to evaluate it.
          measurable: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', COMPLETED_STATUSES] },
                    { $gt: ['$slaTarget', 0] },
                    { $ne: ['$completedAt', null] },
                    { $ne: ['$assignedAt', null] }
                  ]
                },
                1,
                0
              ]
            }
          },
          withinSla: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', COMPLETED_STATUSES] },
                    { $gt: ['$slaTarget', 0] },
                    { $ne: ['$completedAt', null] },
                    { $ne: ['$assignedAt', null] },
                    {
                      $lte: [
                        {
                          $divide: [
                            { $subtract: ['$completedAt', '$assignedAt'] },
                            1000 * 60
                          ]
                        },
                        '$slaTarget'
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const totalJobs = totals?.totalJobs || 0;
    const completedJobs = totals?.completedJobs || 0;
    const measurable = totals?.measurable || 0;
    const withinSla = totals?.withinSla || 0;

    return res.status(200).json({
      success: true,
      data: {
        windowDays: days,
        totalJobs,
        completedJobs,
        // Jobs the SLA percentage is actually computed from.
        measurableJobs: measurable,
        withinSla,
        breachedSla: Math.max(0, measurable - withinSla),
        // null (not 100) when nothing is measurable — the UI must show "no data"
        // rather than an unearned perfect score.
        slaPercentage: measurable > 0 ? Math.round((withinSla / measurable) * 100) : null
      }
    });
  } catch (error) {
    console.error('[B2B Dashboard] sla error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load SLA metrics' });
  }
};

/**
 * GET /api/b2b-dashboard/repeat-calls
 * Sites that generated more than one job in the window — a real repeat-failure
 * signal, grouped by site identity rather than free-text address where possible.
 */
exports.getChronicRepeatCalls = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Company context required' });
    }

    const { from, days } = parseWindow(req);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const repeats = await B2BJob.aggregate([
      { $match: { companyId, createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $ifNull: ['$siteId', '$address'] },
          count: { $sum: 1 },
          lastIssueDate: { $max: '$createdAt' },
          city: { $last: '$city' },
          address: { $last: '$address' },
          services: { $addToSet: '$service' }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, lastIssueDate: -1 } },
      { $limit: limit }
    ]);

    const data = repeats.map((r) => ({
      location: r.address || String(r._id || 'Unknown site'),
      city: r.city || null,
      repeatCount: r.count,
      lastIssueDate: r.lastIssueDate,
      services: r.services.filter(Boolean),
      riskLevel: r.count > 3 ? 'Critical' : 'High'
    }));

    // Empty means no repeat failures in this window. That is a real result.
    return res.status(200).json({ success: true, data, windowDays: days });
  } catch (error) {
    console.error('[B2B Dashboard] repeat-calls error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load repeat calls' });
  }
};

/**
 * GET /api/b2b-dashboard/ledger
 * This company's wallet position and recent transactions.
 */
exports.getB2BFinancialLedger = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Company context required' });
    }

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const wallet = await B2BWallet.findOne({ companyId }).lean();
    if (!wallet) {
      return res.status(200).json({
        success: true,
        data: { balance: 0, escrowBalance: 0, totalSpent: 0, transactions: [] }
      });
    }

    const transactions = await B2BWalletTransaction.find({ companyId, walletId: wallet._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance || 0,
        escrowBalance: wallet.escrowBalance || 0,
        totalSpent: wallet.totalSpent || 0,
        currency: wallet.currency || 'INR',
        transactions
      }
    });
  } catch (error) {
    console.error('[B2B Dashboard] ledger error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load financial ledger' });
  }
};
