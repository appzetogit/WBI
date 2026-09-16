import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  ShieldCheck,
  CheckCircle2,
  Clock,
  IndianRupee,
  Search,
  Filter,
  Loader2,
  ArrowUpRight,
  Download,
  Receipt,
  FileCheck,
  CreditCard,
  Building2,
  AlertCircle
} from 'lucide-react';
import { fetchSettlements, fetchBankAccounts, downloadWithdrawalReceipt, formatINR } from '../../../services/financeService';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';
import BankManagementModal from './BankManagementModal';
import WithdrawalWizard from '../WithdrawalWizard';
import { toast } from 'react-hot-toast';

const SettlementsTab = () => {
  const [summary, setSummary] = useState({
    totalPayable: 0,
    pendingSettlement: 0,
    paidByAdmin: 0,
    availableBalance: 0
  });
  const [settlements, setSettlements] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 });

  // Modals
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isWithdrawWizardOpen, setIsWithdrawWizardOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settlementsRes, banksRes] = await Promise.all([
        fetchSettlements({
          page,
          limit: 10,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: search || undefined
        }),
        fetchBankAccounts().catch(() => ({ data: { data: [] } }))
      ]);

      if (settlementsRes.data?.success) {
        setSummary(settlementsRes.data.data?.summary || {});
        setSettlements(settlementsRes.data.data?.settlements || []);
        setPagination(settlementsRes.data.pagination || { page: 1, pages: 1, total: 0, limit: 10 });
      }

      if (banksRes.data?.success) {
        setBanks(banksRes.data.data || []);
      }
    } catch (err) {
      console.error('Error loading settlements:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleDownloadReceipt = async (id) => {
    try {
      const res = await downloadWithdrawalReceipt(id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/html' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `settlement-receipt-${id}.html`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Receipt downloaded');
    } catch (err) {
      console.error('Receipt download error:', err);
      toast.error('Failed to download receipt');
    }
  };

  const primaryBank = banks.find((b) => b.isPrimary) || banks[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Payable */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Revenue</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            {formatINR(summary.totalPayable)}
          </div>
          <p className="text-[11px] font-medium text-gray-400">Total vendor earnings</p>
        </div>

        {/* Paid by Admin */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Paid by Admin</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600">
            {formatINR(summary.paidByAdmin)}
          </div>
          <p className="text-[11px] font-medium text-emerald-600/70">Settled to bank</p>
        </div>

        {/* Pending Settlement */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Pending Settlement</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">
            {formatINR(summary.pendingSettlement)}
          </div>
          <p className="text-[11px] font-medium text-amber-600/70">Awaiting Admin transfer</p>
        </div>

        {/* Available Wallet Balance */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Available Wallet</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-600">
            {formatINR(summary.availableBalance)}
          </div>
          <p className="text-[11px] font-medium text-indigo-600/70">Ready for withdrawal</p>
        </div>
      </div>

      {/* 2. Hero Settlement & Bank Destination Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-teal-900/30">
        <div className="space-y-3 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-teal-500/20 text-teal-300 text-xs font-bold rounded-full border border-teal-400/30 flex items-center gap-1.5 uppercase tracking-wider">
              <Landmark className="w-3.5 h-3.5" /> Admin to Vendor Settlement
            </span>
            <span className="text-xs text-gray-400">T+1 Cycle</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">
            Direct Platform Settlements
          </h2>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
            All customer and B2B job payments flow through the Platform Account via Razorpay. Completed verified jobs are settled directly to your linked bank account.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {primaryBank ? (
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="text-left pr-2">
                <div className="text-xs font-bold text-white truncate max-w-[140px]">
                  {primaryBank.accountHolderName || primaryBank.bankName || 'Bank Account'}
                </div>
                <div className="text-[11px] text-gray-400 font-mono">
                  {primaryBank.accountNumberMasked || primaryBank.upiId || '•••• ••••'}
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsBankModalOpen(true)}
              className="px-4 py-3 bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-2xl text-xs font-bold hover:bg-amber-500/30 transition-all"
            >
              + Add Bank Account
            </button>
          )}

          <button
            onClick={() => setIsWithdrawWizardOpen(true)}
            disabled={summary.availableBalance <= 0}
            className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Request Payout</span>
          </button>

          <button
            onClick={() => setIsBankModalOpen(true)}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold transition-all border border-white/10"
          >
            Manage Banks
          </button>
        </div>
      </div>

      {/* 3. Search and Status Filter */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Reference, UTR, Note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl font-medium text-gray-700 outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">All Settlement Status</option>
            <option value="completed">Completed / Paid</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected / Failed</option>
          </select>
        </div>
      </div>

      {/* 4. Settlement History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Admin Settlement History</h2>
            <p className="text-xs text-gray-500">Record of all bank transfers and payout settlements from Admin</p>
          </div>
          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
            {pagination.total} Records
          </span>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            <span className="text-xs text-gray-500 font-medium">Loading settlement records...</span>
          </div>
        ) : settlements.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={Landmark}
              title="No Settlement History"
              description="Settlements and payout transfers processed by Admin will appear here with full UTR references."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200/80">
                  <th className="py-3.5 px-4">Reference / UTR</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Payment Method</th>
                  <th className="py-3.5 px-4">Admin Remarks</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                  <th className="py-3.5 px-4 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-teal-50/20 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      {s.referenceCode}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-700">
                      {s.type}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700">
                        <CreditCard className="w-3 h-3" />
                        {s.paymentMethod.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 max-w-xs truncate">
                      {s.adminNotes || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-emerald-600">
                      +{formatINR(s.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          ['completed', 'approved', 'paid'].includes(s.status)
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-500 font-medium">
                      {s.processedAt || s.createdAt ? new Date(s.processedAt || s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleDownloadReceipt(s.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                        title="Download Receipt"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="p-4 border-t border-gray-100">
            <Pagination
              currentPage={page}
              totalPages={pagination.pages}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Bank Management Modal */}
      <BankManagementModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        onSaved={loadData}
      />

      {/* Withdrawal Wizard */}
      <WithdrawalWizard
        isOpen={isWithdrawWizardOpen}
        onClose={() => setIsWithdrawWizardOpen(false)}
        onSuccess={loadData}
        availableBalance={summary.availableBalance}
      />
    </div>
  );
};

export default SettlementsTab;
