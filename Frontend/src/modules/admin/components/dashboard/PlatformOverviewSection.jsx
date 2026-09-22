import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FiBriefcase, FiUsers, FiUserCheck, FiDollarSign, FiClock,
  FiAlertTriangle, FiCheckCircle, FiTrendingUp, FiRefreshCw, FiWifi
} from 'react-icons/fi';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { formatCurrency } from '../../utils/adminHelpers';
import { getPlatformOverview, getLiveOpsSummary } from '../../../../services/adminDashboardService';

const SectionHeader = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4" />
    </div>
    <div>
      <h2 className="text-sm sm:text-base font-extrabold text-gray-800">{title}</h2>
      {subtitle && <p className="text-[11px] sm:text-xs text-gray-500">{subtitle}</p>}
    </div>
  </div>
);

const MiniStat = ({ label, value, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200'
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone] || tones.slate}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base sm:text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
};

const Card = ({ children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-gray-200 ${className}`}
  >
    {children}
  </motion.div>
);

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 animate-pulse">
    <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 bg-gray-100 rounded-lg" />
      ))}
    </div>
  </div>
);

const ErrorCard = ({ message, onRetry }) => (
  <div className="bg-white rounded-xl p-6 shadow-sm border border-red-200 flex flex-col items-center text-center gap-2">
    <FiAlertTriangle className="w-6 h-6 text-red-500" />
    <p className="text-sm font-semibold text-gray-800">Couldn't load this section</p>
    <p className="text-xs text-gray-500">{message || 'Something went wrong. Please try again.'}</p>
    <button
      onClick={onRetry}
      className="mt-1 text-xs font-bold text-white bg-gray-900 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-gray-800"
    >
      <FiRefreshCw className="w-3 h-3" /> Retry
    </button>
  </div>
);

const STATUS_COLORS = {
  new: '#94a3b8',
  dispatched: '#3b82f6',
  inProgress: '#8b5cf6',
  awaitingReview: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
  escalated: '#dc2626'
};
const STATUS_LABELS = {
  new: 'New',
  dispatched: 'Dispatched',
  inProgress: 'In Progress',
  awaitingReview: 'Awaiting Review',
  completed: 'Completed',
  cancelled: 'Cancelled',
  escalated: 'Escalated'
};

/**
 * Everything the legacy Booking-only admin dashboard never showed: B2B,
 * Vendors, Engineers split by employment type, pending payouts, live
 * operations, and platform-wide quality. All values come from
 * /admin/dashboard/platform-overview (backend-aggregated) and the existing
 * /b2b/live-tracking/summary endpoint — no client-side computation over raw
 * collections, no hardcoded numbers.
 */
const PlatformOverviewSection = ({ startDate, endDate }) => {
  const [data, setData] = useState(null);
  const [liveOps, setLiveOps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveOpsError, setLiveOpsError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPlatformOverview({ startDate, endDate });
      if (res?.success) {
        setData(res.data);
      } else {
        setError(res?.message || 'Failed to load platform overview');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load platform overview');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const loadLiveOps = useCallback(async () => {
    setLiveOpsError(null);
    try {
      const res = await getLiveOpsSummary();
      if (res?.success) {
        setLiveOps(res.summary);
      } else {
        setLiveOpsError(res?.message || 'Failed to load live operations');
      }
    } catch (err) {
      setLiveOpsError(err?.response?.data?.message || err?.message || 'Failed to load live operations');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadLiveOps();
    const interval = setInterval(loadLiveOps, 30000); // refresh every 30s — this is "live"
    return () => clearInterval(interval);
  }, [loadLiveOps]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return <ErrorCard message={error} onRetry={load} />;
  }

  const { b2b, vendors, engineers, payments, quality } = data;
  const statusChartData = Object.entries(b2b.jobsByStatus).map(([key, count]) => ({
    key,
    label: STATUS_LABELS[key] || key,
    count
  }));

  const engineerChartData = [
    { group: 'Vendor-Employed', Total: engineers.vendorEmployed.total, Online: engineers.vendorEmployed.online, 'Active Jobs': engineers.vendorEmployed.activeJobs },
    { group: 'Freelancer', Total: engineers.freelancer.total, Online: engineers.freelancer.online, 'Active Jobs': engineers.freelancer.activeJobs }
  ];

  const hasNoB2BActivity = b2b.totalCompanies === 0;

  return (
    <div className="space-y-4">
      {/* ── B2B Panel ─────────────────────────────────────────────── */}
      <Card>
        <SectionHeader icon={FiBriefcase} title="B2B Panel" subtitle="Enterprise companies, bulk jobs, and wallet health" />
        {hasNoB2BActivity ? (
          <p className="text-sm text-gray-400 py-6 text-center">No B2B companies onboarded yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <MiniStat label="Companies" value={`${b2b.activeCompanies}/${b2b.totalCompanies}`} tone="blue" />
              <MiniStat label="Pending Onboarding" value={b2b.pendingOnboarding} tone="amber" />
              <MiniStat label="Revenue (period)" value={formatCurrency(b2b.revenueInRange)} tone="green" />
              <MiniStat label="Wallet Balance (all cos.)" value={formatCurrency(b2b.totalWalletBalance)} tone="purple" />
              <MiniStat label="Escrow Held" value={formatCurrency(b2b.escrowHeld)} tone="cyan" />
              <MiniStat label="Total Spent" value={formatCurrency(b2b.totalSpent)} tone="slate" />
              <MiniStat label="Jobs (period)" value={b2b.totalJobsInRange} tone="blue" />
              <MiniStat label="Completed (period)" value={b2b.completedJobsInRange} tone="green" />
            </div>
            {b2b.pipeline && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">Live job pipeline (all companies)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  <MiniStat label="Pending" value={b2b.pipeline.pending} tone="amber" />
                  <MiniStat label="Dispatched" value={b2b.pipeline.dispatched} tone="purple" />
                  <MiniStat label="En Route" value={b2b.pipeline.en_route} tone="blue" />
                  <MiniStat label="In Progress" value={b2b.pipeline.in_progress} tone="cyan" />
                  <MiniStat label="Resolved" value={b2b.pipeline.resolved} tone="green" />
                  <MiniStat label="Failed" value={b2b.pipeline.failed} tone="red" />
                  <MiniStat label="SLA Breached" value={b2b.pipeline.sla_breached} tone="red" />
                  <MiniStat label="Unassigned" value={b2b.pipeline.unassigned} tone={b2b.pipeline.unassigned ? 'red' : 'slate'} />
                </div>
                {(b2b.pipeline.unassigned > 0 || b2b.pipeline.awaitingVendor > 0) && (
                  <Link to="/admin/b2b/unassigned" className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:underline">
                    {b2b.pipeline.unassigned} unassigned · {b2b.pipeline.awaitingVendor} awaiting a vendor. Open the assignment queue →
                  </Link>
                )}
              </div>
            )}
            {b2b.totalJobsInRange > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={45} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Jobs" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No jobs in this date range.</p>
            )}
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Vendors ─────────────────────────────────────────────── */}
        <Card>
          <SectionHeader icon={FiUserCheck} title="Vendors" subtitle="Onboarding, wallet earnings, dues & finance ledger" />
          {vendors.total === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No vendors registered yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Approved" value={`${vendors.approved}/${vendors.total}`} tone="green" />
              <MiniStat label="Pending Approval" value={vendors.pending} tone="amber" />
              <MiniStat label="Wallet Earnings" value={formatCurrency(vendors.legacyWalletEarnings)} tone="blue" />
              <MiniStat label="Wallet Dues" value={formatCurrency(vendors.legacyWalletDues)} tone="red" />
              <MiniStat label="Finance Available" value={formatCurrency(vendors.financeAvailableBalance)} tone="green" />
              <MiniStat label="Finance Escrow" value={formatCurrency(vendors.financeEscrowBalance)} tone="cyan" />
            </div>
          )}
        </Card>

        {/* ── Engineers: Vendor-Employed vs Freelancer ───────────────── */}
        <Card>
          <SectionHeader icon={FiUsers} title="Engineers" subtitle="Vendor-employed vs Freelancer, live availability" />
          {(engineers.vendorEmployed.total + engineers.freelancer.total) === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No engineers onboarded yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={engineerChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="group" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Total" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Online" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Active Jobs" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <MiniStat label="Freelancer Wallet" value={formatCurrency(engineers.freelancer.walletBalance)} tone="green" />
                <MiniStat label="Freelancer Pending Payout" value={formatCurrency(engineers.freelancer.pendingPayout)} tone="amber" />
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Payments: pending withdrawals ───────────────────────── */}
        <Card>
          <SectionHeader icon={FiDollarSign} title="Pending Payouts" subtitle="Withdrawal requests awaiting admin action" />
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-xs font-semibold text-blue-700">Vendor ({payments.pendingWithdrawals.vendor.count})</span>
              <span className="text-sm font-bold text-blue-700">{formatCurrency(payments.pendingWithdrawals.vendor.amount)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
              <span className="text-xs font-semibold text-purple-700">Engineer/Freelancer ({payments.pendingWithdrawals.engineer.count})</span>
              <span className="text-sm font-bold text-purple-700">{formatCurrency(payments.pendingWithdrawals.engineer.amount)}</span>
            </div>
            {payments.pendingWithdrawals.vendor.count === 0 && payments.pendingWithdrawals.engineer.count === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">Nothing pending right now.</p>
            )}
          </div>
        </Card>

        {/* ── Quality ─────────────────────────────────────────────── */}
        <Card>
          <SectionHeader icon={FiCheckCircle} title="Quality & Compliance" subtitle="Platform-wide, B2B jobs" />
          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              label="SLA Compliance"
              value={quality.slaCompliance != null ? `${quality.slaCompliance}%` : 'N/A'}
              tone={quality.slaCompliance != null && quality.slaCompliance >= 90 ? 'green' : 'amber'}
            />
            <MiniStat
              label="First-Time Fix"
              value={quality.firstTimeFixRate != null ? `${quality.firstTimeFixRate}%` : 'N/A'}
              tone={quality.firstTimeFixRate != null && quality.firstTimeFixRate >= 90 ? 'green' : 'amber'}
            />
          </div>
          {quality.slaCompliance == null && quality.firstTimeFixRate == null && (
            <p className="text-[11px] text-gray-400 mt-2">No completed jobs with timestamps in this range yet.</p>
          )}
        </Card>

        {/* ── Live Operations ─────────────────────────────────────── */}
        <Card>
          <SectionHeader icon={FiWifi} title="Live Operations" subtitle="Engineer status right now (auto-refreshes)" />
          {liveOpsError ? (
            <ErrorCard message={liveOpsError} onRetry={loadLiveOps} />
          ) : !liveOps ? (
            <div className="animate-pulse h-16 bg-gray-100 rounded-lg" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="On Duty" value={liveOps.onDuty} tone="green" />
              <MiniStat label="En Route" value={liveOps.enRoute} tone="blue" />
              <MiniStat label="At Location" value={liveOps.atLocation} tone="purple" />
              <MiniStat label="Offline" value={liveOps.offline} tone="slate" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default PlatformOverviewSection;
