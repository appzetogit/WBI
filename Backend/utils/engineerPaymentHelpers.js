const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');

/** Completed credits that count toward lifetime earnings (keep in sync with engineer wallet). */
const EARNING_TX_TYPES = [
  'earnings_credit',
  'engineer_payment',
  'commission',
  'cash_collected',
  'worker_payment',
  'credit',
  'payment'
];

const DEBIT_TX_TYPES = ['withdrawal', 'debit', 'tds_deduction', 'platform_fee', 'penalty'];

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatEngineerServiceLabel(doc) {
  const cats = (doc.serviceCategories || []).filter(Boolean);
  if (cats.length) {
    const shown = cats.slice(0, 2).join(', ');
    return cats.length > 2 ? `${shown} +${cats.length - 2}` : shown;
  }
  if (doc.primaryCategory) return doc.primaryCategory;
  if (doc.serviceCategory) return doc.serviceCategory;
  return '—';
}

function mapAggById(aggRows) {
  const map = new Map();
  for (const row of aggRows) {
    if (row._id) map.set(String(row._id), roundMoney(row.total || 0));
  }
  return map;
}

async function aggregateEngineerPaymentStats(engineerIds) {
  if (!engineerIds.length) {
    return {
      earningsById: new Map(),
      pendingById: new Map(),
      withdrawnById: new Map(),
      creditsById: new Map(),
      debitsById: new Map()
    };
  }

  const [earningsAgg, pendingAgg, withdrawnAgg, creditsAgg, debitsAgg] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          $or: [{ engineerId: { $in: engineerIds } }, { workerId: { $in: engineerIds } }],
          status: 'completed',
          type: { $in: EARNING_TX_TYPES }
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$engineerId', '$workerId'] },
          total: { $sum: { $abs: '$amount' } }
        }
      }
    ]),
    Withdrawal.aggregate([
      { $match: { engineerId: { $in: engineerIds }, status: 'pending' } },
      { $group: { _id: '$engineerId', total: { $sum: '$amount' } } }
    ]),
    Withdrawal.aggregate([
      { $match: { engineerId: { $in: engineerIds }, status: 'approved' } },
      { $group: { _id: '$engineerId', total: { $sum: '$amount' } } }
    ]),
    Transaction.aggregate([
      {
        $match: {
          $or: [{ engineerId: { $in: engineerIds } }, { workerId: { $in: engineerIds } }],
          status: 'completed',
          type: { $in: EARNING_TX_TYPES },
          amount: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$engineerId', '$workerId'] },
          total: { $sum: '$amount' }
        }
      }
    ]),
    Transaction.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ engineerId: { $in: engineerIds } }, { workerId: { $in: engineerIds } }]
            },
            { status: { $in: ['completed', 'pending'] } },
            {
              $or: [{ type: { $in: DEBIT_TX_TYPES } }, { amount: { $lt: 0 } }]
            }
          ]
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$engineerId', '$workerId'] },
          total: { $sum: { $abs: '$amount' } }
        }
      }
    ])
  ]);

  return {
    earningsById: mapAggById(earningsAgg),
    pendingById: mapAggById(pendingAgg),
    withdrawnById: mapAggById(withdrawnAgg),
    creditsById: mapAggById(creditsAgg),
    debitsById: mapAggById(debitsAgg)
  };
}

/**
 * Single source of truth for admin + engineer wallet display fields.
 */
function buildEngineerPaymentSummary(engineerLean, statsForId = {}) {
  const idStr = String(engineerLean._id);
  const wallet = engineerLean.wallet || {};

  const ledgerEarnings = statsForId.ledgerEarnings ?? statsForId.earnings ?? 0;
  const ledgerCredits = statsForId.ledgerCredits ?? statsForId.credits ?? ledgerEarnings;
  const ledgerDebits = statsForId.ledgerDebits ?? statsForId.debits ?? 0;

  const pendingFromWithdrawals = statsForId.pendingWithdrawal ?? 0;
  const withdrawnFromRecords = statsForId.withdrawnAmount ?? 0;

  const availableBalance = roundMoney(wallet.balance);
  const pendingWithdrawal = roundMoney(
    Math.max(pendingFromWithdrawals, Number(wallet.pendingBalance) || 0)
  );
  const withdrawnAmount = roundMoney(
    Math.max(withdrawnFromRecords, Number(wallet.withdrawnAmount) || 0)
  );

  const walletStoredTotal = roundMoney(wallet.totalEarnings);
  const totalEarned = roundMoney(
    Math.max(ledgerEarnings, walletStoredTotal, ledgerCredits)
  );

  const allocated = roundMoney(availableBalance + pendingWithdrawal + withdrawnAmount);
  const reconciliationDelta = roundMoney(totalEarned - allocated);

  return {
    availableBalance,
    pendingWithdrawal,
    withdrawnAmount,
    totalEarned,
    totalCredits: roundMoney(Math.max(ledgerCredits, totalEarned)),
    totalDebits: ledgerDebits,
    allocated,
    reconciliationDelta,
    isReconciled: Math.abs(reconciliationDelta) < 1
  };
}

function statsForEngineerId(maps, engineerId) {
  const idStr = String(engineerId);
  return {
    ledgerEarnings: maps.earningsById.get(idStr) || 0,
    ledgerCredits: maps.creditsById.get(idStr) || 0,
    ledgerDebits: maps.debitsById.get(idStr) || 0,
    pendingWithdrawal: maps.pendingById.get(idStr) || 0,
    withdrawnAmount: maps.withdrawnById.get(idStr) || 0
  };
}

async function getEngineerPaymentSummaryForOne(engineerId) {
  const maps = await aggregateEngineerPaymentStats([engineerId]);
  const raw = statsForEngineerId(maps, engineerId);
  return {
    ...raw,
    totalEarningsFromLedger: raw.ledgerEarnings
  };
}

async function getTransactionBreakdownForEngineer(engineerId) {
  const oid = engineerId;
  const rows = await Transaction.aggregate([
    {
      $match: {
        $or: [{ engineerId: oid }, { workerId: oid }]
      }
    },
    {
      $group: {
        _id: { type: '$type', status: '$status' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.status': 1, '_id.type': 1 } }
  ]);

  return rows.map((r) => ({
    type: r._id.type,
    status: r._id.status,
    total: roundMoney(r.total),
    count: r.count
  }));
}

async function getRecentWithdrawalsForEngineer(engineerId, limit = 10) {
  return Withdrawal.find({ engineerId })
    .sort({ requestDate: -1 })
    .limit(limit)
    .select('amount status requestDate processedDate transactionReference bankDetails')
    .lean();
}

module.exports = {
  EARNING_TX_TYPES,
  DEBIT_TX_TYPES,
  roundMoney,
  formatEngineerServiceLabel,
  aggregateEngineerPaymentStats,
  buildEngineerPaymentSummary,
  statsForEngineerId,
  getEngineerPaymentSummaryForOne,
  getTransactionBreakdownForEngineer,
  getRecentWithdrawalsForEngineer
};
