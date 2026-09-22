import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Inbox, UserPlus, Activity, CheckCircle2, AlarmClock, UserCheck, Users, ShieldAlert, Wallet
} from 'lucide-react';
import { StatCard, ErrorState } from '../../../components/ops/OpsUi';
import { ChartCard, HBarChart, TrendChart } from '../../../components/ops/OpsCharts';
import { formatINR, mergeByPeriod } from '../../../components/ops/opsFormat';
import { getDashboard, errorMessage } from '../../../services/vendorJobsService';
import { useVendorSocket } from '../../../context/VendorSocketContext';
import useVendorBasePath from '../../../hooks/useVendorBasePath';

const LABEL = {
  ROUTED: 'New request', PENDING_ASSIGNMENT: 'Pending assignment', ASSIGNED: 'Assigned', ACCEPTED: 'Accepted',
  EN_ROUTE: 'En route', ARRIVED: 'Arrived', IN_PROGRESS: 'In progress', ON_HOLD: 'On hold', COMPLETED: 'Completed',
  VERIFICATION: 'Verification', CLOSED: 'Closed', CANCELLED: 'Cancelled', FAILED: 'Failed', REJECTED: 'Rejected'
};

/**
 * Field-operations overview for the vendor dashboard. Every number comes from
 * GET /api/vendors/:id/dashboard (computed from the central job records).
 */
const JobOpsOverview = () => {
  const navigate = useNavigate();
  const { basePath } = useVendorBasePath();
  const [granularity, setGranularity] = useState('day');
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const { socket } = useVendorSocket() || {};

  const load = useCallback(async () => {
    try {
      const res = await getDashboard({ granularity, days: granularity === 'month' ? 365 : granularity === 'week' ? 120 : 30 });
      setState({ loading: false, error: '', data: res.data });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err, 'Could not load operations overview'), data: null });
    }
  }, [granularity]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const timer = useRef(null);
  useEffect(() => {
    if (!socket?.on) return undefined;
    const onEvent = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 800); };
    ['job:statusChanged', 'b2b:jobRequestReceived', 'vendor:jobNotice'].forEach((e) => socket.on(e, onEvent));
    return () => {
      clearTimeout(timer.current);
      ['job:statusChanged', 'b2b:jobRequestReceived', 'vendor:jobNotice'].forEach((e) => socket.off?.(e, onEvent));
    };
  }, [socket, load]);

  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  const d = state.data;
  const c = d?.cards || {};
  const go = (tab) => navigate(`${basePath}/jobs?tab=${tab}`);

  const cards = [
    { label: 'Total jobs', value: c.totalJobs, icon: Briefcase, tone: 'gray', onClick: () => go('all') },
    { label: 'New requests', value: c.newRequests, icon: Inbox, tone: 'blue', onClick: () => go('new') },
    { label: 'Pending assignment', value: c.pendingAssignment, icon: UserPlus, tone: 'amber', onClick: () => go('pending_assignment') },
    { label: 'Active jobs', value: c.activeJobs, icon: Activity, tone: 'purple', hint: 'Assigned · accepted · in progress', onClick: () => navigate(basePath + '/jobs?tab=all&active=1') },
    { label: 'Completed today', value: c.completedToday, icon: CheckCircle2, tone: 'green', onClick: () => go('completed') },
    { label: 'Overdue jobs', value: c.overdueJobs, icon: AlarmClock, tone: 'red', onClick: () => navigate(basePath + '/jobs?tab=all&overdue=1') },
    { label: 'Available engineers', value: c.availableEngineers, icon: UserCheck, tone: 'green', onClick: () => navigate(`${basePath}/engineers/availability?filter=available`) },
    { label: 'Busy engineers', value: c.busyEngineers, icon: Users, tone: 'amber', onClick: () => navigate(`${basePath}/engineers/availability?filter=busy`) },
    { label: 'SLA breaches', value: c.slaBreaches, icon: ShieldAlert, tone: 'red', hint: 'Overdue now + breached this month' },
    {
      label: 'Pending settlements',
      value: c.pendingSettlements ? formatINR(c.pendingSettlements.amount) : undefined,
      hint: c.pendingSettlements ? `${c.pendingSettlements.count} period(s)` : '',
      icon: Wallet,
      tone: 'blue',
      onClick: () => navigate(`${basePath}/settlements`)
    }
  ];

  const statusRows = (d?.charts.statusDistribution || []).map((r) => ({ label: LABEL[r.status] || r.status, count: r.count }));
  const serviceRows = (d?.charts.serviceDistribution || []).map((r) => ({ label: r.service || r.serviceKey, count: r.count }));
  const workloadRows = (d?.charts.engineerWorkload || []).map((r) => ({ label: r.name, count: r.activeJobs }));
  const trendRows = mergeByPeriod(d?.charts.jobTrend, 'created', d?.charts.completionTrend, 'completed');
  const slaRows = (d?.charts.slaPerformance || []).map((r) => ({
    period: r.period,
    met: r.met,
    breached: r.breached,
    compliance: r.met + r.breached ? Math.round((r.met / (r.met + r.breached)) * 100) : null
  }));
  const earningRows = d?.charts.earnings || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-gray-900">Field operations</h2>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold" aria-label="Trend granularity">
          <option value="day">Daily (30 days)</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((k) => (
          <StatCard key={k.label} {...k} value={state.loading ? '…' : k.value} />
        ))}
      </div>

      {d && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Job trend" subtitle="Jobs received vs work completed" rows={trendRows} columns={[{ key: 'period', label: 'Period' }, { key: 'created', label: 'Received' }, { key: 'completed', label: 'Completed' }]}>
            <TrendChart rows={trendRows} series={[{ key: 'created', name: 'Received' }, { key: 'completed', name: 'Completed' }]} />
          </ChartCard>
          <ChartCard title="SLA performance" subtitle="% of completed jobs finished within SLA" rows={slaRows} columns={[{ key: 'period', label: 'Period' }, { key: 'compliance', label: '% met', format: (v) => (v == null ? '—' : `${v}%`) }, { key: 'met', label: 'Met' }, { key: 'breached', label: 'Breached' }]}>
            <TrendChart rows={slaRows} series={[{ key: 'compliance', name: 'SLA met' }]} format={(v) => `${v}%`} />
          </ChartCard>
          <ChartCard title="Job status distribution" rows={statusRows} columns={[{ key: 'label', label: 'Status' }, { key: 'count', label: 'Jobs' }]}>
            <HBarChart rows={statusRows} labelKey="label" valueKey="count" />
          </ChartCard>
          <ChartCard title="Service distribution" rows={serviceRows} columns={[{ key: 'label', label: 'Service' }, { key: 'count', label: 'Jobs' }]}>
            <HBarChart rows={serviceRows} labelKey="label" valueKey="count" />
          </ChartCard>
          <ChartCard title="Engineer workload" subtitle="Active jobs per engineer right now" rows={workloadRows} columns={[{ key: 'label', label: 'Engineer' }, { key: 'count', label: 'Active jobs' }]}>
            <HBarChart rows={workloadRows} labelKey="label" valueKey="count" valueName="Active jobs" />
          </ChartCard>
          <ChartCard title="Earnings" subtitle="Released to your wallet" rows={earningRows} columns={[{ key: 'period', label: 'Period' }, { key: 'amount', label: 'Amount', format: (v) => formatINR(v) }]}>
            <TrendChart rows={earningRows} series={[{ key: 'amount', name: 'Earnings' }]} format={(v) => formatINR(v)} />
          </ChartCard>
        </div>
      )}
    </div>
  );
};

export default JobOpsOverview;
