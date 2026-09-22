import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, ErrorState, EmptyState, StatCard } from '../../components/ops/OpsUi';
import { ChartCard, HBarChart } from '../../components/ops/OpsCharts';
import { formatINR } from '../../components/ops/opsFormat';
import { getEngineerPerformance, errorMessage } from '../../services/vendorJobsService';
import EngineerDrawer from './components/EngineerDrawer';
import { TeamStatusBadge } from './components/EngineerUi';
import useTeamServices from './useTeamServices';
import { minutesLabel, pctLabel } from './engineerMeta';

const isoDay = (d) => d.toISOString().slice(0, 10);
const SORTS = {
  completed: { label: 'Most completed', fn: (a, b) => b.completed - a.completed },
  sla: { label: 'Best SLA', fn: (a, b) => (b.slaCompliance ?? -1) - (a.slaCompliance ?? -1) },
  acceptance: { label: 'Best acceptance', fn: (a, b) => (b.acceptanceRate ?? -1) - (a.acceptanceRate ?? -1) },
  response: { label: 'Fastest response', fn: (a, b) => (a.avgResponseMinutes ?? Infinity) - (b.avgResponseMinutes ?? Infinity) },
  rework: { label: 'Most rework', fn: (a, b) => b.revisions - a.revisions }
};
const COLUMNS = [
  ['name', 'Engineer'], ['assigned', 'Assigned'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['acceptanceRate', 'Acceptance %'],
  ['avgResponseMinutes', 'Avg response (min)'], ['completed', 'Completed'], ['closed', 'Closed'], ['slaCompliance', 'SLA met %'],
  ['avgWorkMinutes', 'Avg work (min)'], ['avgTurnaroundMinutes', 'Avg turnaround (min)'], ['revisions', 'Rework'], ['firstTimeRightRate', 'First-time-right %'],
  ['closedValue', 'Closed job value'], ['rating', 'Rating']
];

const toCsv = (rows) => {
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [COLUMNS.map(([, l]) => l).join(','), ...rows.map((r) => COLUMNS.map(([k]) => esc(r[k])).join(','))].join('\n');
};

/** Per-engineer performance from assignment history and job records. */
const EngineerPerformance = () => {
  const services = useTeamServices();
  const [range, setRange] = useState(() => ({ from: isoDay(new Date(Date.now() - 90 * 86400000)), to: isoDay(new Date()) }));
  const [sort, setSort] = useState('completed');
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getEngineerPerformance({ from: range.from, to: `${range.to}T23:59:59` });
      setState({ loading: false, error: '', data: res.data });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err, 'Could not load performance'), data: null });
    }
  }, [range]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const d = state.data;
  const rows = useMemo(() => [...(d?.rows || [])].sort(SORTS[sort].fn), [d, sort]);
  const worked = rows.filter((r) => r.assigned || r.completed);
  const chartRows = worked.filter((r) => r.completed).map((r) => ({ label: r.name, completed: r.completed }));
  const t = d?.totals;

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engineer-performance-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Engineers"
        title="Engineer Performance"
        subtitle="Computed from assignment history and job records for the selected period — nothing is estimated."
        actions={(
          <>
            <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs" aria-label="From" />
            <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="px-3 py-2 border border-gray-200 rounded-xl text-xs" aria-label="To" />
            <button type="button" onClick={exportCsv} disabled={!rows.length} className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"><Download className="w-3.5 h-3.5" /> CSV</button>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      {state.loading && !d ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Jobs assigned" value={t.assigned} />
            <StatCard label="Completed" value={t.completed} tone="green" />
            <StatCard label="Acceptance rate" value={pctLabel(t.acceptanceRate)} hint={`${t.rejected} rejected`} />
            <StatCard label="SLA met" value={pctLabel(t.slaCompliance)} tone="blue" />
            <StatCard label="First time right" value={pctLabel(t.firstTimeRightRate)} hint={`${t.revisions} sent back for rework`} tone="amber" />
            <StatCard label="Closed job value" value={formatINR(t.closedValue)} />
          </div>

          <ChartCard title="Completed jobs per engineer" subtitle="Work submitted in the period" rows={chartRows} columns={[{ key: 'label', label: 'Engineer' }, { key: 'completed', label: 'Completed' }]}>
            <HBarChart rows={chartRows} labelKey="label" valueKey="completed" valueName="Completed" />
          </ChartCard>

          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-gray-900">By engineer</h2>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold" aria-label="Sort engineers">
                {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </div>
            {!rows.length ? <EmptyState title="No engineers" message="Add engineers to track their performance." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                    <tr>
                      <th className="px-4 py-2.5">Engineer</th><th className="px-3 py-2.5 text-right">Assigned</th><th className="px-3 py-2.5 text-right">Acceptance</th>
                      <th className="px-3 py-2.5 text-right">Avg response</th><th className="px-3 py-2.5 text-right">Completed</th><th className="px-3 py-2.5 text-right">SLA met</th>
                      <th className="px-3 py-2.5 text-right">Avg work</th><th className="px-3 py-2.5 text-right">Turnaround</th><th className="px-3 py-2.5 text-right">Rework</th>
                      <th className="px-3 py-2.5 text-right">Closed value</th><th className="px-3 py-2.5 text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={`border-t border-gray-100 ${!r.assigned && !r.completed ? 'text-gray-400' : ''}`}>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => setOpenId(r.id)} className="font-bold text-gray-900 hover:underline">{r.name}</button>
                          {r.status !== 'ACTIVE' && <span className="ml-2"><TeamStatusBadge row={r} /></span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.assigned}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pctLabel(r.acceptanceRate)}{r.rejected ? <span className="text-red-600"> ({r.rejected} rej.)</span> : ''}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{minutesLabel(r.avgResponseMinutes)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold">{r.completed}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pctLabel(r.slaCompliance)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{minutesLabel(r.avgWorkMinutes)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{minutesLabel(r.avgTurnaroundMinutes)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.revisions}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.closedValue ? formatINR(r.closedValue) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.rating ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="text-[11px] text-gray-500">Acceptance = accepted ÷ (accepted + rejected). Response = assignment → engineer accepts. Work = start → submission. Turnaround = assignment → submission. Rework = jobs the client sent back.</p>
        </>
      )}

      {openId && <EngineerDrawer engineerId={openId} services={services} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

export default EngineerPerformance;
