import React, { useState, useEffect } from 'react';
import { 
  FiDollarSign, FiTrendingUp, FiCalendar, FiArrowDownRight, 
  FiArrowUpRight, FiClock, FiCheckCircle, FiXCircle, FiFilter,
  FiDownload, FiBriefcase, FiCreditCard
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import vendorWalletService from '../../../../services/vendorWalletService';
import WithdrawalModal from './components/WithdrawalModal';

export default function Earnings() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  
  // Modals & Filters
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [filter, setFilter] = useState('All'); // All, Earnings, Withdrawals, Dues
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchData();
  }, [page, filter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch summary (only needed on initial load or after actions, but fetching here for simplicity)
      const summaryRes = await vendorWalletService.getWalletSummary();
      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }

      // Map filter to backend type if necessary
      let typeParam = '';
      if (filter === 'Earnings') typeParam = 'earnings_credit';
      if (filter === 'Withdrawals') typeParam = 'withdrawal';
      if (filter === 'Dues') typeParam = 'cash_collected';

      const transRes = await vendorWalletService.getTransactions({ 
        page, 
        limit: 10,
        type: typeParam
      });
      
      if (transRes.success) {
        setTransactions(transRes.data);
        setTotalPages(transRes.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching earnings data:', error);
      toast.error('Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const availableBalance = (summary?.earnings || 0) - (summary?.dues || 0);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#00a78e]/30 border-t-[#00a78e] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Earnings & Wallet</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Manage your revenue, track payments, and request withdrawals.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold text-[13px] rounded-xl hover:bg-slate-50 transition-colors flex items-center shadow-sm">
            <FiDownload className="mr-2" /> Download Statement
          </button>
          <button 
            onClick={() => setIsWithdrawModalOpen(true)}
            className="px-5 py-2.5 bg-[#00a78e] text-white font-bold text-[13px] rounded-xl hover:bg-[#008f79] transition-all shadow-[0_4px_12px_rgba(0,167,142,0.25)] flex items-center"
          >
            <FiCreditCard className="mr-2" /> Withdraw Funds
          </button>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Available Balance */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-[0_8px_30px_rgb(0,167,142,0.2)] relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                <FiDollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-emerald-50 text-[13px] font-bold tracking-wide uppercase mb-1">Available Balance</p>
            <h2 className="text-3xl font-black tracking-tight">{formatCurrency(availableBalance > 0 ? availableBalance : 0)}</h2>
            <div className="mt-4 pt-4 border-t border-white/20 flex justify-between items-center text-sm">
              <span className="text-emerald-100">Total Earned:</span>
              <span className="font-bold">{formatCurrency(summary?.earnings)}</span>
            </div>
          </div>
        </div>

        {/* Pending Dues */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center border border-rose-100">
              <FiArrowDownRight className="w-6 h-6 text-rose-500" />
            </div>
          </div>
          <p className="text-slate-400 text-[13px] font-bold tracking-wide uppercase mb-1">Pending Dues</p>
          <h2 className="text-3xl font-black text-[#0f172a] tracking-tight">{formatCurrency(summary?.dues)}</h2>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
            <span className="text-slate-500">Cash Collected:</span>
            <span className="font-bold text-slate-700">Needs settlement</span>
          </div>
        </div>

        {/* Today's Collections */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
              <FiClock className="w-6 h-6 text-blue-500" />
            </div>
            <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-md">Today</span>
          </div>
          <p className="text-slate-400 text-[13px] font-bold tracking-wide uppercase mb-1">Cash Collected</p>
          <h2 className="text-3xl font-black text-[#0f172a] tracking-tight">{formatCurrency(summary?.today?.amount)}</h2>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
            <span className="text-slate-500">Total Bookings:</span>
            <span className="font-bold text-slate-700">{summary?.today?.count || 0}</span>
          </div>
        </div>

        {/* This Week's Collections */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100">
              <FiCalendar className="w-6 h-6 text-indigo-500" />
            </div>
            <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded-md">This Week</span>
          </div>
          <p className="text-slate-400 text-[13px] font-bold tracking-wide uppercase mb-1">Cash Collected</p>
          <h2 className="text-3xl font-black text-[#0f172a] tracking-tight">{formatCurrency(summary?.thisWeek?.amount)}</h2>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
            <span className="text-slate-500">Total Bookings:</span>
            <span className="font-bold text-slate-700">{summary?.thisWeek?.count || 0}</span>
          </div>
        </div>
      </div>

      {/* Transactions Section */}
      <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {['All', 'Earnings', 'Withdrawals', 'Dues'].map(f => (
              <button 
                key={f}
                onClick={() => { setFilter(f); setPage(1); }}
                className={`px-4 py-2 text-[13px] font-bold rounded-lg transition-colors whitespace-nowrap ${
                  filter === f 
                  ? 'bg-[#00a78e] text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
              <FiFilter className="mr-2 text-slate-400" /> Filter
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">Transaction Details</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">Type</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50">Date</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 text-right">Amount</th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/50 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 text-slate-300 mb-4 border border-slate-100">
                      <FiBriefcase className="w-8 h-8" />
                    </div>
                    <p className="text-[14px] font-bold text-slate-600 mb-1">No Transactions Found</p>
                    <p className="text-[12px] text-slate-400">There are no transactions matching your current filters.</p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                          tx.type === 'earnings_credit' ? 'bg-emerald-50 text-emerald-500 border-emerald-100' :
                          tx.type === 'cash_collected' ? 'bg-amber-50 text-amber-500 border-amber-100' :
                          tx.type === 'withdrawal' ? 'bg-indigo-50 text-indigo-500 border-indigo-100' :
                          tx.type === 'settlement' ? 'bg-blue-50 text-blue-500 border-blue-100' :
                          'bg-slate-50 text-slate-500 border-slate-100'
                        }`}>
                          {tx.type === 'earnings_credit' ? <FiArrowUpRight /> :
                           tx.type === 'cash_collected' ? <FiArrowDownRight /> :
                           tx.type === 'withdrawal' ? <FiCreditCard /> :
                           tx.type === 'settlement' ? <FiCheckCircle /> : <FiDollarSign />}
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-[#0f172a] mb-0.5">{tx.description || tx.type.replace('_', ' ').toUpperCase()}</p>
                          {tx.bookingId && (
                            <p className="text-[11px] font-medium text-slate-500">Booking: {tx.bookingId.bookingNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                        tx.type === 'earnings_credit' ? 'bg-emerald-50 text-emerald-700' :
                        tx.type === 'cash_collected' ? 'bg-amber-50 text-amber-700' :
                        tx.type === 'withdrawal' ? 'bg-indigo-50 text-indigo-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {tx.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[13px] font-medium text-slate-600">
                      {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className={`text-[14px] font-bold ${
                        ['earnings_credit', 'settlement'].includes(tx.type) ? 'text-emerald-600' : 'text-[#0f172a]'
                      }`}>
                        {['earnings_credit', 'settlement'].includes(tx.type) ? '+' : '-'} {formatCurrency(tx.amount)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {tx.status === 'completed' ? (
                        <div className="inline-flex items-center text-[12px] font-bold text-emerald-600">
                          <FiCheckCircle className="mr-1.5 w-3.5 h-3.5" /> Completed
                        </div>
                      ) : tx.status === 'pending' ? (
                        <div className="inline-flex items-center text-[12px] font-bold text-amber-500">
                          <FiClock className="mr-1.5 w-3.5 h-3.5" /> Pending
                        </div>
                      ) : (
                        <div className="inline-flex items-center text-[12px] font-bold text-rose-500">
                          <FiXCircle className="mr-1.5 w-3.5 h-3.5" /> Failed
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
            <span className="text-[12px] font-bold text-slate-500">Page {page} of {totalPages}</span>
            <div className="flex space-x-1">
              <button 
                disabled={page === 1} 
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-[12px] font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-[#00a78e] hover:border-[#00a78e] disabled:opacity-30 transition-all bg-white shadow-sm"
              >
                Previous
              </button>
              <button 
                disabled={page === totalPages} 
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-[12px] font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-white hover:text-[#00a78e] hover:border-[#00a78e] disabled:opacity-30 transition-all bg-white shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <WithdrawalModal 
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        availableBalance={availableBalance > 0 ? availableBalance : 0}
        onSuccess={fetchData}
      />
    </div>
  );
}
