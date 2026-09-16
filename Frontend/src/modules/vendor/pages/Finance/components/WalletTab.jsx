import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ArrowDownToLine,
  Download,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Eye,
  ShieldAlert
} from 'lucide-react';
import { fetchWallet, exportFinanceLedger, formatINR, statusColors } from '../../../services/financeService';
import { toast } from 'react-hot-toast';
import WithdrawalWizard from '../WithdrawalWizard';
import TransactionDetailsModal from './TransactionDetailsModal';

const TYPE_FILTERS = [
  { key: '', label: 'All Transactions' },
  { key: 'credit', label: 'Credits (+ Earnings / Settlements)' },
  { key: 'debit', label: 'Debits (- Engineer Payouts)' },
  { key: 'withdrawal', label: 'Bank Withdrawals' },
  { key: 'escrow_release', label: 'Escrow Releases' },
  { key: 'commission', label: 'Commission Deductions' },
  { key: 'refund', label: 'Refunds' }
];

const WalletTab = () => {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWallet({
        type: typeFilter || undefined,
        search: search || undefined,
        limit: 50
      });

      if (res.data?.success) {
        setWallet(res.data.data?.wallet || null);
        setTransactions(res.data.data?.transactions || []);
      }
    } catch (err) {
      console.error('Error loading wallet:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportFinanceLedger({
        type: typeFilter || undefined,
        search: search || undefined
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vendor-finance-ledger-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Ledger exported successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Wallet Balance Hero & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hero Card */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl shadow-xl border border-slate-700/50 flex flex-col justify-between lg:col-span-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" /> Available Balance
              </span>
              <span className="text-[11px] font-mono text-slate-400 bg-white/10 px-2 py-0.5 rounded-full">
                {wallet?.currency || 'INR'}
              </span>
            </div>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-black mt-3 text-white tracking-tight">
              {formatINR(wallet?.availableBalance)}
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Funds available for instant bank settlement or regular withdrawal payout.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t border-white/10">
            <button
              onClick={() => setWithdrawOpen(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
            >
              <ArrowDownToLine className="w-4 h-4" /> Withdraw to Bank
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-2 border border-white/10 disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
              {exporting ? 'Exporting...' : 'Export Ledger CSV'}
            </button>
          </div>
        </div>

        {/* Breakdown Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">Escrow Locked</span>
            <div className="text-xl font-black text-violet-600 mt-2">{formatINR(wallet?.escrowBalance)}</div>
            <span className="text-[10px] text-gray-400">Releases on verification</span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">Pending</span>
            <div className="text-xl font-black text-amber-600 mt-2">{formatINR(wallet?.pendingSettlement)}</div>
            <span className="text-[10px] text-gray-400">Milestones in progress</span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">Processing</span>
            <div className="text-xl font-black text-blue-600 mt-2">{formatINR(wallet?.processingWithdrawal)}</div>
            <span className="text-[10px] text-gray-400">Payout in transit</span>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">Total Settled</span>
            <div className="text-xl font-black text-slate-800 mt-2">{formatINR(wallet?.totalWithdrawn)}</div>
            <span className="text-[10px] text-gray-400">Successfully paid out</span>
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Type Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                typeFilter === f.key
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search code, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* 3. Filterable Transaction Ledger Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-2" />
            <p className="text-xs font-medium">Loading ledger transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-xs">
            <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
            No ledger transactions found matching this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-slate-50 text-gray-500 uppercase font-bold text-[10px] tracking-wider border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Txn Code</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Project / Job</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance After</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((txn) => {
                  const isCredit = ['credit', 'escrow_release', 'refund'].includes(txn.type);
                  return (
                    <tr key={txn._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">{txn.transactionCode}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 font-semibold capitalize ${
                          isCredit ? 'text-emerald-700' : 'text-slate-700'
                        }`}>
                          {isCredit ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />}
                          {txn.type?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{txn.description}</td>
                      <td className="px-4 py-3">
                        {txn.projectCode ? (
                          <span className="font-mono text-teal-700 font-semibold">{txn.projectCode}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(txn.occurredAt || txn.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {isCredit ? '+' : '-'}{formatINR(txn.amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500">
                        {formatINR(txn.balanceAfter)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[txn.status] || 'bg-gray-100 text-gray-600'}`}>
                          {txn.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedTxn(txn)}
                          className="p-1 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <WithdrawalWizard
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onComplete={() => {
          loadWallet();
        }}
      />

      {selectedTxn && (
        <TransactionDetailsModal
          transaction={selectedTxn}
          onClose={() => setSelectedTxn(null)}
        />
      )}
    </div>
  );
};

export default WalletTab;
