import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Briefcase,
  IndianRupee,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowDownRight,
  Filter,
  Search,
  Loader2,
  Tag,
  Building2,
  UserCheck,
  FileCheck,
  Eye,
  Info
} from 'lucide-react';
import { fetchEarningsOverview, fetchEarningsByService, formatINR, statusColors } from '../../../services/financeService';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';
import EarningDetailsModal from './EarningDetailsModal';

const QUICK_FILTERS = [
  { id: 'ALL', label: 'All Jobs' },
  { id: 'USER_JOB', label: 'User Jobs', source: 'USER_JOB' },
  { id: 'B2B_JOB', label: 'B2B Jobs', source: 'B2B_JOB' },
  { id: 'PENDING', label: 'Pending Settlement', status: 'pending' },
  { id: 'PAID', label: 'Paid / Settled', status: 'paid' }
];

const EarningsTab = () => {
  const [summary, setSummary] = useState({
    totalEarnings: 0,
    pendingEarnings: 0,
    paidEarnings: 0,
    b2bEarnings: 0,
    userEarnings: 0,
    totalJobs: 0,
    b2bJobCount: 0,
    userJobCount: 0
  });
  const [earningsList, setEarningsList] = useState([]);
  const [byService, setByService] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [selectedEarning, setSelectedEarning] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let finalSource = sourceFilter !== 'ALL' ? sourceFilter : undefined;
      let finalStatus = statusFilter !== 'ALL' ? statusFilter : undefined;

      if (quickFilter === 'USER_JOB') finalSource = 'USER_JOB';
      else if (quickFilter === 'B2B_JOB') finalSource = 'B2B_JOB';
      else if (quickFilter === 'PENDING') finalStatus = 'pending';
      else if (quickFilter === 'PAID') finalStatus = 'paid';

      const [earningsRes, byServiceRes] = await Promise.all([
        fetchEarningsOverview({
          page,
          limit: 10,
          source: finalSource,
          status: finalStatus,
          search: search || undefined
        }),
        fetchEarningsByService()
      ]);

      if (earningsRes.data?.success) {
        setSummary(earningsRes.data.data?.summary || {});
        setEarningsList(earningsRes.data.data?.earnings || []);
        setPagination(earningsRes.data.pagination || { page: 1, pages: 1, total: 0, limit: 10 });
      }

      if (byServiceRes.data?.success) {
        setByService(byServiceRes.data.data?.byService || []);
      }
    } catch (err) {
      console.error('Error loading earnings data:', err);
    } finally {
      setLoading(false);
    }
  }, [page, sourceFilter, statusFilter, quickFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleQuickFilterChange = (filterId) => {
    setQuickFilter(filterId);
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Earnings */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Earnings</span>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900">
            {formatINR(summary.totalEarnings)}
          </div>
          <p className="text-[11px] font-medium text-gray-400">{summary.totalJobs} Total Completed Jobs</p>
        </div>

        {/* Paid / Settled */}
        <div
          onClick={() => handleQuickFilterChange('PAID')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 cursor-pointer hover:border-emerald-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Paid / Settled</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600">
            {formatINR(summary.paidEarnings)}
          </div>
          <p className="text-[11px] font-medium text-emerald-600/70">Settled to Vendor</p>
        </div>

        {/* Pending Settlement */}
        <div
          onClick={() => handleQuickFilterChange('PENDING')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 cursor-pointer hover:border-amber-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Pending Settlement</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">
            {formatINR(summary.pendingEarnings)}
          </div>
          <p className="text-[11px] font-medium text-amber-600/70">Awaiting Admin Settlement</p>
        </div>

        {/* B2B Jobs Revenue */}
        <div
          onClick={() => handleQuickFilterChange('B2B_JOB')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 cursor-pointer hover:border-indigo-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">B2B Jobs</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-600">
            {formatINR(summary.b2bEarnings)}
          </div>
          <p className="text-[11px] font-medium text-indigo-600/70">{summary.b2bJobCount} B2B Jobs</p>
        </div>

        {/* User App Jobs Revenue */}
        <div
          onClick={() => handleQuickFilterChange('USER_JOB')}
          className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-2 col-span-2 lg:col-span-1 cursor-pointer hover:border-sky-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">User App Jobs</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-sky-600">
            {formatINR(summary.userEarnings)}
          </div>
          <p className="text-[11px] font-medium text-sky-600/70">{summary.userJobCount} User Jobs</p>
        </div>
      </div>

      {/* 2. Sub-Section Chips & Search Filtering Header */}
      <div className="space-y-3">
        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {QUICK_FILTERS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleQuickFilterChange(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                quickFilter === tab.id
                  ? 'bg-teal-600 text-white shadow-sm ring-2 ring-teal-600/20'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Custom Dropdowns */}
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Job ID, Service, Client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </form>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Source Filter */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => { setSourceFilter('ALL'); setQuickFilter('ALL'); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  sourceFilter === 'ALL' && quickFilter === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => { setSourceFilter('B2B_JOB'); setQuickFilter('B2B_JOB'); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  sourceFilter === 'B2B_JOB' || quickFilter === 'B2B_JOB' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Building2 className="w-3 h-3" /> B2B
              </button>
              <button
                onClick={() => { setSourceFilter('USER_JOB'); setQuickFilter('USER_JOB'); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  sourceFilter === 'USER_JOB' || quickFilter === 'USER_JOB' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <UserCheck className="w-3 h-3" /> User
              </button>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setQuickFilter('ALL'); setPage(1); }}
              className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl font-medium text-gray-700 outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Status</option>
              <option value="paid">Paid / Settled</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Job-Wise Earning History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Job-Wise Earning History</h2>
            <p className="text-xs text-gray-500">Itemized earnings from completed B2B projects and User App service jobs</p>
          </div>
          <span className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
            {pagination.total} Records
          </span>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            <span className="text-xs text-gray-500 font-medium">Loading real database earnings...</span>
          </div>
        ) : earningsList.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={Briefcase}
              title="No Job Earnings Found"
              description="No job settlement records match your current filters. Completed jobs will automatically generate vendor earnings here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200/80">
                  <th className="py-3.5 px-4">Job ID</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4">Service & Client</th>
                  <th className="py-3.5 px-4 text-right">Job Amount</th>
                  <th className="py-3.5 px-4 text-right">Vendor Payable</th>
                  <th className="py-3.5 px-4 text-right">Engineer Share (70%)</th>
                  <th className="py-3.5 px-4 text-center">Payment Status</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {earningsList.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => setSelectedEarning(job)}
                    className="hover:bg-teal-50/20 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      {job.jobId}
                    </td>
                    <td className="py-3.5 px-4">
                      {job.source === 'B2B_JOB' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Building2 className="w-3 h-3" /> B2B Job
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                          <UserCheck className="w-3 h-3" /> User Job
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{job.title}</div>
                      <div className="text-[11px] text-gray-400">{job.clientName} {job.city ? `· ${job.city}` : ''}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-gray-600">
                      {formatINR(job.grossAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-gray-900">
                      {formatINR(job.vendorPayable)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-indigo-600">
                      {formatINR(job.engineerPayout)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          job.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : job.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-gray-500 font-medium">
                      {job.date ? new Date(job.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedEarning(job)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                        title="View Detailed Breakdown"
                      >
                        <Eye className="w-4 h-4" />
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

      {/* 4. Service-Category Breakdown */}
      {byService.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Service Category Breakdown</h3>
            <p className="text-xs text-gray-500">Earnings grouped by your registered service specializations</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byService.map((svc) => (
              <div key={svc.categoryCode} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900">{svc.categoryName}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-200">
                    {svc.categoryCode}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">Total Earned:</span>
                  <span className="text-sm font-black text-emerald-600">{formatINR(svc.totalEarnings)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>Completed Jobs: {svc.creditCount || 0}</span>
                  <span>Pending: {formatINR(svc.pendingReceivables || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Earning Details Modal */}
      {selectedEarning && (
        <EarningDetailsModal
          isOpen={Boolean(selectedEarning)}
          onClose={() => setSelectedEarning(null)}
          earning={selectedEarning}
        />
      )}
    </div>
  );
};

export default EarningsTab;
