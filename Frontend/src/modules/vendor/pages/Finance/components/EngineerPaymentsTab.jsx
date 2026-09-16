import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Briefcase,
  IndianRupee,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Loader2,
  ArrowUpRight,
  Receipt,
  UserCheck,
  Building2,
  AlertCircle,
  Eye
} from 'lucide-react';
import { fetchEngineerPayments, formatINR } from '../../../services/financeService';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';
import EngineerPaymentModal from './EngineerPaymentModal';

const SUB_TABS = [
  { id: 'ALL', label: 'All Payments' },
  { id: 'PENDING', label: 'Pending Payouts', status: 'pending' },
  { id: 'PAID', label: 'Paid / Settled', status: 'paid' },
  { id: 'ENGINEERS', label: 'Engineer Balances' }
];

const EngineerPaymentsTab = () => {
  const [summary, setSummary] = useState({
    totalPayable: 0,
    totalPaid: 0,
    totalPending: 0,
    totalEngineers: 0
  });
  const [engineers, setEngineers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState('ALL');
  const [selectedEngineerId, setSelectedEngineerId] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 });

  // Modal State
  const [activePayEngineer, setActivePayEngineer] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let finalStatus = statusFilter !== 'ALL' ? statusFilter : undefined;
      if (subTab === 'PENDING') finalStatus = 'pending';
      else if (subTab === 'PAID') finalStatus = 'paid';

      const res = await fetchEngineerPayments({
        page,
        limit: 10,
        engineerId: selectedEngineerId !== 'ALL' ? selectedEngineerId : undefined,
        status: finalStatus,
        search: search || undefined
      });

      if (res.data?.success) {
        setSummary(res.data.data?.summary || {});
        setEngineers(res.data.data?.engineers || []);
        setPayments(res.data.data?.payments || []);
        setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: 10 });
      }
    } catch (err) {
      console.error('Error loading engineer payments:', err);
    } finally {
      setLoading(false);
    }
  }, [page, selectedEngineerId, statusFilter, subTab, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleSubTabChange = (tabId) => {
    setSubTab(tabId);
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Payable */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Payable</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            {formatINR(summary.totalPayable)}
          </div>
          <p className="text-[11px] font-medium text-gray-400">Total job incentive value</p>
        </div>

        {/* Total Paid */}
        <div
          onClick={() => handleSubTabChange('PAID')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 cursor-pointer hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Paid</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600">
            {formatINR(summary.totalPaid)}
          </div>
          <p className="text-[11px] font-medium text-emerald-600/70">Credited to engineers</p>
        </div>

        {/* Pending Payout */}
        <div
          onClick={() => handleSubTabChange('PENDING')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 cursor-pointer hover:border-amber-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Pending Payout</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">
            {formatINR(summary.totalPending)}
          </div>
          <p className="text-[11px] font-medium text-amber-600/70">Awaiting vendor payout</p>
        </div>

        {/* Active Engineers */}
        <div
          onClick={() => handleSubTabChange('ENGINEERS')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 cursor-pointer hover:border-sky-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Engineers</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-sky-600">
            {summary.totalEngineers}
          </div>
          <p className="text-[11px] font-medium text-sky-600/70">Associated workforce</p>
        </div>
      </div>

      {/* 2. Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleSubTabChange(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              subTab === tab.id
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-600/20'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Engineer-Wise Overview Grid (Shown when ENGINEERS or ALL is selected) */}
      {(subTab === 'ALL' || subTab === 'ENGINEERS') && engineers.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900">Engineer Payout Balances</h2>
              <p className="text-xs text-gray-500">Overview of completed jobs and outstanding payables per engineer</p>
            </div>
            {selectedEngineerId !== 'ALL' && (
              <button
                onClick={() => { setSelectedEngineerId('ALL'); setPage(1); }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 self-start sm:self-auto"
              >
                Reset Engineer Filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {engineers.map((eng) => {
              const isSelected = selectedEngineerId === eng.engineerId;
              return (
                <div
                  key={eng.engineerId}
                  className={`p-5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm">
                        {eng.avatar ? (
                          <img src={eng.avatar} alt={eng.name} className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          eng.name?.charAt(0) || 'E'
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">{eng.name}</h3>
                        <div className="text-[11px] text-gray-400">{eng.phone || 'No phone'}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => setActivePayEngineer(eng)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      Pay Now
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-100 text-center">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block">JOBS</span>
                      <span className="text-xs font-black text-gray-800">{eng.completedJobs}/{eng.totalJobs}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block">PAID</span>
                      <span className="text-xs font-black text-emerald-600">{formatINR(eng.totalPaid)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 block">PENDING</span>
                      <span className="text-xs font-black text-amber-600">{formatINR(eng.totalPending)}</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2">
                    <button
                      onClick={() => {
                        setSelectedEngineerId(isSelected ? 'ALL' : eng.engineerId);
                        setPage(1);
                      }}
                      className="w-full py-1.5 text-center text-xs font-bold text-gray-500 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 rounded-xl transition-colors"
                    >
                      {isSelected ? 'Showing Jobs for this Engineer' : 'Filter Table by this Engineer'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Search & Filter Bar */}
      <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Job ID, Engineer Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setSubTab('ALL'); setPage(1); }}
            className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Payment Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>
      </div>

      {/* 5. Itemized Engineer Payouts Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Job-By-Job Engineer Payout Breakdown</h2>
            <p className="text-xs text-gray-500">Itemized ledger of field job completions and engineer payouts</p>
          </div>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
            {pagination.total} Records
          </span>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <span className="text-xs text-gray-500 font-medium">Loading engineer payouts...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={Users}
              title="No Engineer Payment Records"
              description="Completed jobs assigned to your engineers will automatically generate payable records here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200/80">
                  <th className="py-3.5 px-4">Job ID</th>
                  <th className="py-3.5 px-4">Engineer</th>
                  <th className="py-3.5 px-4">Job Type & Service</th>
                  <th className="py-3.5 px-4 text-right">Job Total</th>
                  <th className="py-3.5 px-4 text-right">Engineer Share (70%)</th>
                  <th className="py-3.5 px-4 text-center">Payout Status</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-indigo-50/20 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      {p.jobId}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{p.engineerName}</div>
                      <div className="text-[11px] text-gray-400">{p.engineerPhone}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{p.service || 'Service Job'}</div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {p.jobType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-gray-600">
                      {formatINR(p.jobAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-indigo-600">
                      {formatINR(p.engineerPayout)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          p.payoutStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.payoutStatus === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {p.payoutStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-500 font-medium">
                      {p.date ? new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {p.payoutStatus === 'pending' ? (
                        <button
                          onClick={() => {
                            setActivePayEngineer({
                              engineerId: p.engineerId,
                              name: p.engineerName,
                              totalPending: p.engineerPayout,
                              totalPayable: p.engineerPayout,
                              totalPaid: 0
                            });
                          }}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                          Pay
                        </button>
                      ) : (
                        <span className="text-gray-400 text-[11px] font-medium">Settled</span>
                      )}
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

      {/* Engineer Payment Modal */}
      {activePayEngineer && (
        <EngineerPaymentModal
          isOpen={Boolean(activePayEngineer)}
          onClose={() => setActivePayEngineer(null)}
          engineer={activePayEngineer}
          onPaymentSuccess={loadData}
        />
      )}
    </div>
  );
};

export default EngineerPaymentsTab;
