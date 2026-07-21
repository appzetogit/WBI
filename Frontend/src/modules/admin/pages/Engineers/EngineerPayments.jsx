import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FiDollarSign, FiSearch, FiLoader, FiArrowUpRight, FiX, FiInfo } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminEngineerService from '../../../../services/adminEngineerService';
import { formatCurrency, formatEngineerServiceLabel, formatSignedCurrency } from '../../utils/adminHelpers';

const txStatusClass = (status) => {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'failed':
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const withdrawalStatusClass = (status) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-amber-100 text-amber-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const EngineerPayments = () => {
  const [engineers, setEngineers] = useState([]);
  const [metaTotals, setMetaTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const response = await adminEngineerService.getEngineerPayments();
      if (response.success) {
        setEngineers(response.data);
        setMetaTotals(response.meta?.totals || null);
      }
    } catch (error) {
      console.error('Error loading engineer payments:', error);
      toast.error('Failed to load engineer payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filteredEngineers = engineers.filter(
    (w) =>
      (w.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.phone || '').includes(searchQuery)
  );

  const openHistory = useCallback(async (engineer) => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const response = await adminEngineerService.getEngineerEarnings(engineer._id, {
        page: 1,
        limit: 100
      });
      if (response.success) {
        setHistoryData(response.data);
      } else {
        toast.error('Could not load transaction history');
        setHistoryOpen(false);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load transaction history');
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const closeHistory = () => {
    setHistoryOpen(false);
    setHistoryData(null);
  };

  const summary = historyData?.summary;

  const breakdownRows = useMemo(() => {
    const rows = historyData?.breakdown || [];
    return [...rows].sort((a, b) => a.type.localeCompare(b.type));
  }, [historyData?.breakdown]);

  return (
    <div className="space-y-6">
      {metaTotals && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Platform available', value: metaTotals.availableBalance, tone: 'text-green-700' },
            { label: 'Pending payouts', value: metaTotals.pendingWithdrawal, tone: 'text-amber-700' },
            { label: 'Total withdrawn', value: metaTotals.withdrawnAmount, tone: 'text-slate-700' },
            { label: 'Lifetime earned', value: metaTotals.totalEarned, tone: 'text-gray-900' }
          ].map((card) => (
            <div key={card.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className={`text-xl font-bold mt-1 ${card.tone}`}>{formatCurrency(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      <CardShell icon={FiDollarSign}>
        <p className="text-xs text-gray-500 mb-4 flex items-start gap-2">
          <FiInfo className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Total earned</strong> = job credits + admin credits (ledger).{' '}
            <strong>Available + Pending payout + Withdrawn</strong> should match total earned (±₹1 rounding).
          </span>
        </p>

        <div className="mb-6 max-w-md">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search engineer by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiLoader className="w-8 h-8 text-gray-400 animate-spin mr-3" />
              <span className="text-gray-600">Loading payment data...</span>
            </div>
          ) : (
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Engineer</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Service</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Available</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Pending payout</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Withdrawn</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Total earned</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEngineers.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                      No payment records found
                    </td>
                  </tr>
                ) : (
                  filteredEngineers.map((engineer) => (
                    <tr key={engineer._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{engineer.name}</span>
                          <span className="text-xs text-gray-500">{engineer.phone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700 max-w-[180px]">
                        {formatEngineerServiceLabel(engineer)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`font-bold ${
                            (engineer.wallet?.balance || 0) > 0 ? 'text-green-600' : 'text-gray-900'
                          }`}
                        >
                          {formatCurrency(engineer.wallet?.balance)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-amber-700 font-medium">
                        {formatCurrency(engineer.wallet?.pendingBalance)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatCurrency(engineer.wallet?.withdrawnAmount)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 font-semibold">
                        {formatCurrency(engineer.wallet?.totalEarnings)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            engineer.approvalStatus === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {(engineer.approvalStatus || 'unknown').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-primary-600 font-semibold hover:underline"
                          onClick={() => openHistory(engineer)}
                        >
                          Details <FiArrowUpRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </CardShell>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col"
            role="dialog"
            aria-labelledby="engineer-payment-history-title"
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 id="engineer-payment-history-title" className="text-lg font-bold text-gray-900">
                  Payment details
                </h2>
                {historyData?.engineer && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {historyData.engineer.name} · {historyData.engineer.phone} ·{' '}
                    {historyData.engineer.serviceLabel}
                  </p>
                )}
                {historyData?.engineer?.bankDetails?.upiId && (
                  <p className="text-xs text-gray-400 mt-1">
                    Payout UPI: {historyData.engineer.bankDetails.upiId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeHistory}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : historyData && summary ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-4 bg-gray-50/80 border-b border-gray-100">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Available</p>
                    <p className="text-base font-bold text-green-700">{formatCurrency(summary.availableBalance)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Pending payout</p>
                    <p className="text-base font-bold text-amber-700">{formatCurrency(summary.pendingWithdrawal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Withdrawn</p>
                    <p className="text-base font-bold text-gray-700">{formatCurrency(summary.withdrawnAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Total earned</p>
                    <p className="text-base font-bold text-gray-900">{formatCurrency(summary.totalEarnings)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Credits (ledger)</p>
                    <p className="text-base font-bold text-emerald-700">{formatCurrency(summary.totalCredits)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Debits (ledger)</p>
                    <p className="text-base font-bold text-red-700">{formatCurrency(summary.totalDebits)}</p>
                  </div>
                </div>

                <div className="px-6 py-3 border-b border-gray-100 bg-white">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-600">
                      Allocated (Avail + Pending + Withdrawn):{' '}
                      <strong>{formatCurrency(summary.allocated)}</strong>
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className={summary.isReconciled ? 'text-green-700' : 'text-amber-700'}>
                      {summary.isReconciled
                        ? 'Ledger matches wallet split'
                        : `Difference: ${formatSignedCurrency(summary.reconciliationDelta)}`}
                    </span>
                  </div>
                  {summary.formula && (
                    <p className="text-[11px] text-gray-400 mt-1">{summary.formula}</p>
                  )}
                </div>

                <div className="overflow-auto flex-1 px-6 py-4 space-y-6">
                  {breakdownRows.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 mb-2">Breakdown by transaction type</h3>
                      <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Status</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600">Count</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600">Net amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {breakdownRows.map((row) => (
                            <tr key={`${row.type}-${row.status}`}>
                              <td className="px-3 py-2 capitalize">{row.type?.replace(/_/g, ' ')}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${txStatusClass(row.status)}`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-600">{row.count}</td>
                              <td
                                className={`px-3 py-2 text-right font-semibold ${
                                  row.total >= 0 ? 'text-green-700' : 'text-red-600'
                                }`}
                              >
                                {formatSignedCurrency(row.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(historyData.withdrawals || []).length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 mb-2">Withdrawal requests</h3>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2 font-semibold">Requested</th>
                            <th className="pb-2 font-semibold">Amount</th>
                            <th className="pb-2 font-semibold">Status</th>
                            <th className="pb-2 font-semibold">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {historyData.withdrawals.map((w) => (
                            <tr key={w._id}>
                              <td className="py-2 text-gray-600">
                                {new Date(w.requestDate).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short'
                                })}
                              </td>
                              <td className="py-2 font-semibold">{formatCurrency(w.amount)}</td>
                              <td className="py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${withdrawalStatusClass(w.status)}`}>
                                  {w.status}
                                </span>
                              </td>
                              <td className="py-2 text-gray-500 truncate max-w-[120px]">
                                {w.transactionReference || w.bankDetails?.upiId || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-2">Transaction ledger</h3>
                    {(historyData.transactions || []).length === 0 ? (
                      <p className="text-center text-gray-500 py-6 text-sm">No transactions yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="pb-2 font-semibold">Date</th>
                            <th className="pb-2 font-semibold">Description</th>
                            <th className="pb-2 font-semibold">Type</th>
                            <th className="pb-2 font-semibold">Method</th>
                            <th className="pb-2 font-semibold">Status</th>
                            <th className="pb-2 font-semibold text-right">Amount</th>
                            <th className="pb-2 font-semibold text-right">Balance after</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {historyData.transactions.map((tx) => (
                            <tr key={tx._id}>
                              <td className="py-2.5 text-gray-600 whitespace-nowrap text-xs">
                                {new Date(tx.createdAt).toLocaleString('en-IN', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short'
                                })}
                              </td>
                              <td className="py-2.5 text-gray-800 max-w-[200px]">
                                <span className="line-clamp-2" title={tx.description}>
                                  {tx.description}
                                </span>
                                {tx.referenceId && (
                                  <span className="block text-[10px] text-gray-400 truncate">Ref: {tx.referenceId}</span>
                                )}
                              </td>
                              <td className="py-2.5 text-gray-600 capitalize text-xs">
                                {tx.type?.replace(/_/g, ' ')}
                              </td>
                              <td className="py-2.5 text-gray-500 text-xs capitalize">
                                {(tx.paymentMethod || '—').replace(/_/g, ' ')}
                              </td>
                              <td className="py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${txStatusClass(tx.status)}`}>
                                  {tx.status}
                                </span>
                              </td>
                              <td
                                className={`py-2.5 text-right font-semibold whitespace-nowrap ${
                                  tx.amount >= 0 ? 'text-green-700' : 'text-red-600'
                                }`}
                              >
                                {formatSignedCurrency(tx.amount)}
                              </td>
                              <td className="py-2.5 text-right text-gray-600 text-xs whitespace-nowrap">
                                {tx.balanceAfter != null ? formatCurrency(tx.balanceAfter) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default EngineerPayments;
