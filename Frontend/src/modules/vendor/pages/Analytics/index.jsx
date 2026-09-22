import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, RefreshButton, Skeleton, ErrorState, StatCard } from '../../components/ops/OpsUi';
import { ChartCard, HBarChart } from '../../components/ops/OpsCharts';
import { formatINR } from '../../components/ops/opsFormat';
import { getAnalytics, errorMessage } from '../../services/vendorJobsService';

const pct = (v) => (v == null ? '—' : `${v}%`);
const minutes = (m) => (m == null ? '—' : m >= 120 ? `${Math.round(m / 60)} h` : `${m} min`);

const isoDay = (d) => d.toISOString().slice(0, 10);

const Analytics = () => {
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(Date.now() - 90 * 86400000);
    return { from: isoDay(from), to: isoDay(to) };
  });
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await getAnalytics({ from: range.from, to: `${range.to}T23:59:59` });
      setState({ loading: false, error: '', data: res.data });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err), data: null });
    }
  }, [range]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const d = state.data;
  const t = d?.totals || {};
  const serviceRows = (d?.servicePerformance || []).map((r) => ({ ...r, label: r.service || r.serviceKey }));
  const cityRows = (d?.locationPerformance || []).map((r) => ({ ...r, label: r.city }));
  const engineerRows = (d?.engineerProductivity || []).map((r) => ({ ...r, label: r.name }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Analytics"
        title="Analytics"
        subtitle="Computed from your jobs, assignment history and payout ledger for the selected period."
        actions={(
          <>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs" aria-label="From" />
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs" aria-label="To" />
            <RefreshButton onClick={load} spinning={state.loading && Boolean(d)} />
          </>
        )}
      />
      {state.loading && !d ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Total jobs" value={t.totalJobs} />
            <StatCard label="Completed jobs" value={t.completedJobs} tone="green" />
            <StatCard label="Cancellation rate" value={pct(t.cancellationRate)} tone="red" hint={`${t.cancelledJobs} cancelled/failed`} />
            <StatCard label="SLA compliance" value={pct(t.slaCompliance)} tone="green" />
            <StatCard label="Reassignment rate" value={pct(t.reassignmentRate)} tone="amber" hint={`Engineer rejection ${pct(t.engineerRejectionRate)}`} />
            <StatCard label="Avg completion time" value={minutes(t.averageCompletionMinutes)} hint="Assignment → work submitted" />
            <StatCard label="Earnings" value={formatINR(t.earnings)} tone="blue" />
            <StatCard label="Pending settlements" value={formatINR(t.pendingSettlements?.amount)} hint={`${t.pendingSettlements?.count || 0} period(s)`} tone="amber" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              title="Service performance"
              subtitle="Jobs per service"
              rows={serviceRows}
              columns={[{ key: 'label', label: 'Service' }, { key: 'total', label: 'Jobs' }, { key: 'completed', label: 'Completed' }, { key: 'completionRate', label: 'Completion', format: pct }, { key: 'cancelled', label: 'Cancelled' }]}
            >
              <HBarChart rows={serviceRows} labelKey="label" valueKey="total" />
            </ChartCard>
            <ChartCard
              title="Location performance"
              subtitle="Jobs per city"
              rows={cityRows}
              columns={[{ key: 'label', label: 'City' }, { key: 'total', label: 'Jobs' }, { key: 'completed', label: 'Completed' }, { key: 'completionRate', label: 'Completion', format: pct }]}
            >
              <HBarChart rows={cityRows} labelKey="label" valueKey="total" />
            </ChartCard>
            <ChartCard
              title="Engineer productivity"
              subtitle="Completed jobs per engineer"
              rows={engineerRows}
              columns={[{ key: 'label', label: 'Engineer' }, { key: 'jobs', label: 'Jobs' }, { key: 'completed', label: 'Completed' }, { key: 'completionRate', label: 'Completion', format: pct }]}
            >
              <HBarChart rows={engineerRows} labelKey="label" valueKey="completed" valueName="Completed" />
            </ChartCard>
            <ChartCard
              title="Assignment outcomes"
              subtitle="How assignments ended in this period"
              rows={Object.entries(d.assignmentOutcomes || {}).map(([k, v]) => ({ label: k, count: v }))}
              columns={[{ key: 'label', label: 'Outcome' }, { key: 'count', label: 'Assignments' }]}
            >
              <HBarChart rows={Object.entries(d.assignmentOutcomes || {}).map(([k, v]) => ({ label: k, count: v }))} labelKey="label" valueKey="count" valueName="Assignments" />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
