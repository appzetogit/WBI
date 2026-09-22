import React, { useMemo, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { FiDownload, FiFileText, FiStar } from 'react-icons/fi';
import api from '../../../../services/api';
import useB2BSession from '../../hooks/useB2BSession';
import { downloadFile } from '../../utils/download';
import {
  PageHeader, Card, StatCard, RouteTabs, EmptyState, ErrorState, Badge,
  inr, fmtDateTime, fmtMinutes, inputCls, btnSecondary, VIEW_LABEL
} from '../../components/ui';

const SECTIONS = ['jobs', 'sla', 'engineers', 'financial', 'exports'];
const SECTION_TABS = [
  { to: '/b2b/reports/jobs', label: 'Job Reports' },
  { to: '/b2b/reports/sla', label: 'SLA Reports' },
  { to: '/b2b/reports/engineers', label: 'Engineer Reports' },
  { to: '/b2b/reports/financial', label: 'Financial Reports' },
  { to: '/b2b/reports/exports', label: 'Exports' }
];
const SERIES = ['#10AFA5', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#64748B'];
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' };

const iso = (d) => d.toLocaleDateString('en-CA');
const presetRange = (preset) => {
  const now = new Date();
  if (preset === 'month') return { startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: iso(now) };
  if (preset === 'last_month') {
    return {
      startDate: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: iso(new Date(now.getFullYear(), now.getMonth(), 0))
    };
  }
  if (preset === 'quarter') return { startDate: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), endDate: iso(now) };
  if (preset === 'year') return { startDate: iso(new Date(now.getFullYear(), 0, 1)), endDate: iso(now) };
  return { startDate: '', endDate: '' };
};

/* ───────────── Filters (shared by every section) ───────────── */
const FilterBar = ({ value, onChange, showEngineer }) => {
  const { data: meta } = useQuery({
    queryKey: ['b2bJobsFilterMeta'],
    queryFn: async () => (await api.get('/b2b/jobs/filter-meta')).data?.data || {},
    staleTime: 60_000
  });
  const { data: engineers } = useQuery({
    queryKey: ['b2bReportEngineerOptions'],
    queryFn: async () => (await api.get('/b2b/engineers', { params: { limit: 100 } })).data?.data || [],
    enabled: showEngineer,
    staleTime: 60_000
  });
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 mb-1">Period</label>
        <select value={value.preset} onChange={(e) => set({ preset: e.target.value, ...presetRange(e.target.value) })} className={inputCls}>
          <option value="all">All time</option>
          <option value="month">This month</option>
          <option value="last_month">Last month</option>
          <option value="quarter">Last 3 months</option>
          <option value="year">This year</option>
          <option value="custom">Custom range</option>
        </select>
      </div>
      {value.preset === 'custom' && (
        <>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">From</label>
            <input type="date" value={value.startDate} max={value.endDate || undefined} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">To</label>
            <input type="date" value={value.endDate} min={value.startDate || undefined} onChange={(e) => set({ endDate: e.target.value })} className={inputCls} />
          </div>
        </>
      )}
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 mb-1">Service</label>
        <select value={value.service} onChange={(e) => set({ service: e.target.value })} className={`${inputCls} max-w-[220px]`}>
          <option value="">All services</option>
          {(meta?.services || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-gray-500 mb-1">City</label>
        <select value={value.city} onChange={(e) => set({ city: e.target.value })} className={inputCls}>
          <option value="">All cities</option>
          {(meta?.cities || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {showEngineer && (
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Engineer</label>
          <select value={value.engineer} onChange={(e) => set({ engineer: e.target.value })} className={`${inputCls} max-w-[200px]`}>
            <option value="">All engineers</option>
            {(engineers || []).map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
        </div>
      )}
      <button type="button" className="h-10 text-sm font-semibold text-brand hover:underline"
        onClick={() => onChange({ preset: 'all', startDate: '', endDate: '', service: '', city: '', engineer: '' })}>
        Reset
      </button>
    </div>
  );
};

const useReport = (key, url, params, enabled = true) =>
  useQuery({
    queryKey: ['b2bReport', key, params],
    queryFn: async () => (await api.get(url, { params })).data.data,
    enabled,
    placeholderData: (prev) => prev
  });

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

/* ───────────── Job Reports ───────────── */
const JobReports = ({ params }) => {
  const summary = useReport('summary', '/b2b/reports/summary', params);
  const services = useReport('services', '/b2b/reports/service-performance', params);
  const status = useReport('status', '/b2b/reports/job-status', params);
  const { data: stats } = useQuery({
    queryKey: ['b2bJobsStats'],
    queryFn: async () => (await api.get('/b2b/jobs/stats')).data
  });
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.refetch} />;
  const s = summary.data;

  const statusData = status.data
    ? [
      { name: 'Completed', value: status.data.completed || 0 },
      { name: 'Pending', value: status.data.pending || 0 },
      { name: 'Cancelled', value: status.data.cancelled || 0 }
    ].filter((d) => d.value > 0)
    : [];
  const views = (stats?.views || []).filter((v) => !['all', 'active'].includes(v.key));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total jobs" value={(s?.totalJobs?.value ?? 0).toLocaleString('en-IN')} hint={s?.totalJobs?.changeText} loading={summary.isLoading} />
        <StatCard label="Completed" value={(s?.completedJobs?.value ?? 0).toLocaleString('en-IN')} hint={s?.completedJobs?.changeText} tone="good" loading={summary.isLoading} />
        <StatCard label="Pending" value={(s?.pendingJobs?.value ?? 0).toLocaleString('en-IN')} hint={s?.pendingJobs?.changeText} tone="warn" loading={summary.isLoading} />
        <StatCard label="Cancelled" value={(s?.cancelledJobs?.value ?? 0).toLocaleString('en-IN')} hint={s?.cancelledJobs?.changeText} loading={summary.isLoading} />
        <StatCard label="SLA compliance" value={pct(s?.slaCompliance?.value)} hint={s?.slaCompliance?.changeText} loading={summary.isLoading} />
        <StatCard label="First-time fix" value={pct(s?.firstTimeFixRate?.value)} hint={s?.firstTimeFixRate?.changeText} loading={summary.isLoading} />
        <StatCard label="Total spend" value={inr(s?.totalSpend?.value)} hint={s?.totalSpend?.changeText} loading={summary.isLoading} />
        <StatCard label="Avg. rating" value={s?.averageRating?.value != null ? `${s.averageRating.value} / 5` : '—'} hint={s?.averageRating?.changeText} icon={FiStar} loading={summary.isLoading} />
      </div>

      {views.length > 0 && (
        <Card title="Where your jobs are now" subtitle="Live, all time. Select a view to open it.">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {views.map((v) => (
              <Link key={v.key} to={`/b2b/jobs/${v.key}`} className="border border-gray-100 rounded-xl p-3 hover:border-brand/40">
                <p className="text-[11px] text-gray-500">{VIEW_LABEL[v.key]}</p>
                <p className="text-lg font-bold tabular-nums">{v.count.toLocaleString('en-IN')}</p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Service performance" className="lg:col-span-2">
          {services.isLoading ? <div className="h-40 bg-gray-50 rounded animate-pulse" /> : !services.data?.length ? (
            <EmptyState title="No jobs in this period" />
          ) : (
            <div className="overflow-x-auto -m-5">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-3 px-5 text-left">Service</th>
                    <th className="py-3 px-5 text-right">Jobs</th>
                    <th className="py-3 px-5 text-right">Completed</th>
                    <th className="py-3 px-5 text-right">Pending</th>
                    <th className="py-3 px-5 text-left">Completion</th>
                    <th className="py-3 px-5 text-right">Avg. time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {services.data.map((r) => {
                    const rate = parseInt(r.completionRate, 10) || 0;
                    return (
                      <tr key={r.serviceName}>
                        <td className="py-3 px-5 font-medium text-gray-900">{r.serviceName}</td>
                        <td className="py-3 px-5 text-right tabular-nums">{r.totalJobs}</td>
                        <td className="py-3 px-5 text-right tabular-nums">{r.completed}</td>
                        <td className="py-3 px-5 text-right tabular-nums">{r.pending}</td>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2">
                            <span className="w-10 tabular-nums text-xs">{r.completionRate}</span>
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full"><div className="h-full bg-brand rounded-full" style={{ width: `${rate}%` }} /></div>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-right text-gray-600">{r.averageCompletionTime}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Outcome mix" subtitle={`${(status.data?.totalJobs ?? 0).toLocaleString('en-IN')} jobs in this period`}>
          {status.isLoading ? <div className="h-48 bg-gray-50 rounded animate-pulse" /> : statusData.length === 0 ? (
            <EmptyState title="No jobs in this period" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2}>
                    {statusData.map((d, i) => <Cell key={d.name} fill={['#10AFA5', '#F59E0B', '#EF4444'][i % 3]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

/* ───────────── SLA Reports ───────────── */
const SlaReports = ({ params }) => {
  const { data, isLoading, error, refetch } = useReport('sla', '/b2b/reports/sla', params);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="SLA attainment" value={pct(s?.attainment)} tone={s?.attainment != null && s.attainment < 90 ? 'danger' : 'good'} loading={isLoading} hint="Jobs with no SLA breach" />
        <StatCard label="Jobs tracked" value={(s?.jobsWithSla ?? 0).toLocaleString('en-IN')} loading={isLoading} />
        <StatCard label="Breached jobs" value={(s?.breachedJobs ?? 0).toLocaleString('en-IN')} tone={s?.breachedJobs ? 'danger' : 'default'} loading={isLoading}
          hint={<Link to="/b2b/jobs/sla_breached" className="text-brand hover:underline">Open breached jobs</Link>} />
        <StatCard label="Overdue, still open" value={(s?.overdueOpen ?? 0).toLocaleString('en-IN')} tone={s?.overdueOpen ? 'danger' : 'default'} loading={isLoading} />
        <StatCard label="Due in the next hour" value={(s?.atRiskNextHour ?? 0).toLocaleString('en-IN')} tone={s?.atRiskNextHour ? 'warn' : 'default'} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="By SLA stage" subtitle="Each stage has its own due time from your SLA profile">
          {isLoading ? <div className="h-40 bg-gray-50 rounded animate-pulse" /> : (
            <div className="overflow-x-auto -m-5">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-3 px-5 text-left">Stage</th>
                    <th className="py-3 px-5 text-right">Tracked</th>
                    <th className="py-3 px-5 text-right">Breaches</th>
                    <th className="py-3 px-5 text-right">Attainment</th>
                    <th className="py-3 px-5 text-right">Avg. delay</th>
                    <th className="py-3 px-5 text-right">Worst delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.metrics.map((m) => (
                    <tr key={m.metric}>
                      <td className="py-3 px-5 capitalize">{m.metric}</td>
                      <td className="py-3 px-5 text-right tabular-nums">{m.tracked}</td>
                      <td className="py-3 px-5 text-right tabular-nums">{m.breaches}</td>
                      <td className="py-3 px-5 text-right tabular-nums">{pct(m.attainment)}</td>
                      <td className="py-3 px-5 text-right tabular-nums">{fmtMinutes(m.avgDelayMinutes)}</td>
                      <td className="py-3 px-5 text-right tabular-nums">{fmtMinutes(m.maxDelayMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Breaches per day" subtitle={params.startDate ? 'Selected period' : 'Last 30 days'}>
          {isLoading ? <div className="h-48 bg-gray-50 rounded animate-pulse" /> : !data.trend.length ? (
            <EmptyState title="No breaches in this period" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="breaches" name="Breaches" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[['By service', data?.byService], ['By city', data?.byCity]].map(([title, rows]) => (
          <Card key={title} title={title}>
            {isLoading ? <div className="h-32 bg-gray-50 rounded animate-pulse" /> : !rows?.length ? <EmptyState title="No SLA-tracked jobs" /> : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{r.name}</span>
                    <span className="flex items-center gap-3 shrink-0 tabular-nums">
                      <span className="text-gray-500 text-xs">{r.breached}/{r.jobs} breached</span>
                      <Badge tone={r.attainment >= 95 ? 'green' : r.attainment >= 85 ? 'amber' : 'red'}>{pct(r.attainment)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Card title="Due within the hour" subtitle="Open jobs whose resolution time is about to pass">
        {isLoading ? <div className="h-20 bg-gray-50 rounded animate-pulse" /> : !data.atRisk.length ? (
          <EmptyState title="Nothing at risk right now" />
        ) : (
          <ul className="divide-y divide-gray-50">
            {data.atRisk.map((j) => (
              <li key={j._id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className="font-semibold text-brand">{j.jobId}</span> · {j.service} · {j.city}{j.engineer ? ` · ${j.engineer}` : ''}</span>
                <Badge tone="amber">in {fmtMinutes(j.minutesLeft)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent breaches">
        {isLoading ? <div className="h-32 bg-gray-50 rounded animate-pulse" /> : !data.recentBreaches.length ? (
          <EmptyState title="No breaches recorded" />
        ) : (
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-3 px-5 text-left">Job</th>
                  <th className="py-3 px-5 text-left">Stage</th>
                  <th className="py-3 px-5 text-left">Due</th>
                  <th className="py-3 px-5 text-left">Breached</th>
                  <th className="py-3 px-5 text-right">Late by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recentBreaches.map((b, i) => (
                  <tr key={`${b._id}-${b.metric}-${i}`}>
                    <td className="py-3 px-5"><span className="font-semibold text-brand">{b.jobId}</span><span className="text-xs text-gray-500"> · {b.service} · {b.city}</span></td>
                    <td className="py-3 px-5 capitalize">{b.metric}</td>
                    <td className="py-3 px-5 text-xs">{fmtDateTime(b.dueAt)}</td>
                    <td className="py-3 px-5 text-xs">{fmtDateTime(b.breachedAt)}</td>
                    <td className="py-3 px-5 text-right tabular-nums text-red-600">{fmtMinutes(b.delayMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

/* ───────────── Engineer Reports ───────────── */
const EngineerReports = ({ params }) => {
  const { data, isLoading, error, refetch } = useReport('engineers', '/b2b/reports/engineer-performance', params);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const rows = data || [];
  const top = [...rows].sort((a, b) => b.completedJobs - a.completedJobs).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Engineers on your jobs" value={rows.length} loading={isLoading} />
        <StatCard label="Jobs assigned" value={rows.reduce((a, r) => a + (r.assignedJobs || 0), 0).toLocaleString('en-IN')} loading={isLoading} />
        <StatCard label="Jobs completed" value={rows.reduce((a, r) => a + (r.completedJobs || 0), 0).toLocaleString('en-IN')} tone="good" loading={isLoading} />
        <StatCard label="Active now" value={rows.reduce((a, r) => a + (r.activeJobs || 0), 0).toLocaleString('en-IN')} loading={isLoading} />
      </div>

      {top.some((r) => r.completedJobs > 0) && (
        <Card title="Completed jobs by engineer" subtitle="Top 10 in this period">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="engineerName" width={120} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="completedJobs" name="Completed" fill="#10AFA5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card title="All engineers">
        {isLoading ? <div className="h-40 bg-gray-50 rounded animate-pulse" /> : !rows.length ? (
          <EmptyState title="No engineers worked on your jobs in this period" />
        ) : (
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-3 px-5 text-left">Engineer</th>
                  <th className="py-3 px-5 text-right">Assigned</th>
                  <th className="py-3 px-5 text-right">Completed</th>
                  <th className="py-3 px-5 text-right">Active</th>
                  <th className="py-3 px-5 text-right">Completion rate</th>
                  <th className="py-3 px-5 text-right">Utilisation</th>
                  <th className="py-3 px-5 text-right">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((e, i) => (
                  <tr key={e.engineerId || `${e.engineerName}-${i}`}>
                    <td className="py-3 px-5 font-medium text-gray-900">{e.engineerName}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{e.assignedJobs}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{e.completedJobs}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{e.activeJobs}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{e.assignedJobs ? `${Math.round((e.completedJobs / e.assignedJobs) * 100)}%` : '—'}</td>
                    <td className="py-3 px-5 text-right tabular-nums" title={e.utilizationBasis}>{e.utilization ?? '—'}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{e.averageRating != null ? Number(e.averageRating).toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

/* ───────────── Financial Reports ───────────── */
const COMPOSITION_LABEL = {
  base: 'Base price', geographic: 'Geographic surcharge', priority: 'Priority charge', sla: 'SLA charge',
  emergency: 'Emergency charge', afterHours: 'After-hours charge', additional: 'Additional charges', discount: 'Discounts', tax: 'Tax'
};

const FinancialReports = ({ params }) => {
  const { data, isLoading, error, refetch } = useReport('financial', '/b2b/reports/financial', params);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Top-ups" value={inr(s?.topUps, 2)} loading={isLoading} tone="good" />
        <StatCard label="Charged for jobs" value={inr(s?.charged, 2)} loading={isLoading} />
        <StatCard label="Refunds" value={inr(s?.refunds, 2)} loading={isLoading} />
        <StatCard label="Net spend" value={inr(s?.netSpend, 2)} loading={isLoading} tone="brand" hint="Charges less refunds" />
        <StatCard label="Reserved in period" value={inr(s?.reserved, 2)} loading={isLoading} />
        <StatCard label="Released in period" value={inr(s?.released, 2)} loading={isLoading} />
        <StatCard label="Jobs charged" value={(s?.chargedJobs ?? 0).toLocaleString('en-IN')} loading={isLoading} />
        <StatCard label="Avg. cost per job" value={s?.avgCostPerJob != null ? inr(s.avgCostPerJob, 2) : '—'} loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Money in and out by month" className="lg:col-span-2" subtitle="Real money only; demo rows are excluded">
          {isLoading ? <div className="h-56 bg-gray-50 rounded animate-pulse" /> : !data.monthly.length ? (
            <EmptyState title="No wallet movements in this period" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={60} tickFormatter={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v}`)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(v, 2)} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="topUps" name="Top-ups" stroke="#10AFA5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="charges" name="Charges" stroke="#3B82F6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="refunds" name="Refunds & releases" stroke="#F59E0B" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Current balance">
          {isLoading ? <div className="h-32 bg-gray-50 rounded animate-pulse" /> : (
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-gray-500">Available</dt><dd className="tabular-nums">{inr(data.balance.available, 2)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Reserved</dt><dd className="tabular-nums">{inr(data.balance.reserved, 2)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Credit limit</dt><dd className="tabular-nums">{inr(data.balance.creditLimit, 2)}</dd></div>
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold"><dt>Spendable</dt><dd className="tabular-nums text-brand">{inr(data.balance.spendable, 2)}</dd></div>
              <Link to="/b2b/billing/reconciliation" className="block text-xs text-brand hover:underline pt-2">Check reconciliation</Link>
            </dl>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[['Spend by service', data?.byService], ['Spend by city', data?.byCity]].map(([title, rows]) => (
          <Card key={title} title={title}>
            {isLoading ? <div className="h-32 bg-gray-50 rounded animate-pulse" /> : !rows?.length ? <EmptyState title="No charged jobs" /> : (
              <ul className="space-y-2 text-sm">
                {rows.map((r, i) => (
                  <li key={r.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="tabular-nums shrink-0">{inr(r.amount)} <span className="text-xs text-gray-400">· {r.jobs}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
        <Card title="What the charges were made of">
          {isLoading ? <div className="h-32 bg-gray-50 rounded animate-pulse" /> : !data.composition ? <EmptyState title="No priced jobs charged" /> : (
            <dl className="text-sm space-y-1.5">
              {Object.entries(COMPOSITION_LABEL).map(([k, label]) => (data.composition[k] ? (
                <div key={k} className="flex justify-between">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="tabular-nums">{k === 'discount' ? '−' : ''}{inr(data.composition[k], 2)}</dd>
                </div>
              ) : null))}
              <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{inr(data.composition.total, 2)}</dd></div>
            </dl>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Invoices" actions={<Link to="/b2b/billing/invoices" className="text-xs font-semibold text-brand hover:underline">Open invoices</Link>}>
          {isLoading ? <div className="h-20 bg-gray-50 rounded animate-pulse" /> : !data.invoices.length ? <EmptyState title="No invoices in this period" /> : (
            <ul className="space-y-2 text-sm">
              {data.invoices.map((r) => (
                <li key={r.status} className="flex justify-between"><span>{r.status} <span className="text-xs text-gray-400">({r.count})</span></span><span className="tabular-nums">{inr(r.amount, 2)}</span></li>
              ))}
            </ul>
          )}
        </Card>
        {data?.demo?.length > 0 && (
          <Card title="Demo money" subtitle="Simulated rows, never settled">
            <ul className="space-y-2 text-sm">
              {data.demo.map((r) => (
                <li key={r.type} className="flex justify-between"><span>{r.type} <span className="text-xs text-gray-400">({r.count})</span></span><span className="tabular-nums">{inr(r.amount, 2)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
};

/* ───────────── Exports ───────────── */
const Exports = ({ params }) => {
  const { can } = useB2BSession();
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  const { engineer: _engineer, ...jobParams } = clean;
  const range = Object.fromEntries(Object.entries({ startDate: clean.startDate, endDate: clean.endDate }).filter(([, v]) => v));

  const items = [
    { title: 'Full report workbook', desc: 'Summary, services, engineers, expenses, SLA, breaches and financials, one sheet each.', format: 'Excel', url: '/b2b/reports/export/excel', params: clean, name: 'WBI_B2B_Reports.xlsx' },
    { title: 'Report PDF', desc: 'The summary, service, engineer and expense sections as a printable document.', format: 'PDF', url: '/b2b/reports/export/pdf', params: clean, name: 'WBI_B2B_Reports.pdf' },
    { title: 'Jobs', desc: 'Every job with its view, lifecycle status, assignment, price and SLA breaches.', format: 'CSV', url: '/b2b/jobs/export', params: jobParams, name: 'WBI_Jobs.csv', permission: 'jobs.read' },
    { title: 'SLA-breached jobs', desc: 'Only jobs that missed an SLA stage.', format: 'CSV', url: '/b2b/jobs/export', params: { ...jobParams, view: 'sla_breached' }, name: 'WBI_SLA_Breached_Jobs.csv', permission: 'jobs.read' },
    { title: 'Wallet statement', desc: 'Every ledger row with the balances it left.', format: 'CSV', url: '/b2b/wallet/transactions/export', params: range, name: 'WBI_Wallet_Statement.csv', permission: 'wallet.read' },
    { title: 'Invoices', desc: 'Invoice register.', format: 'CSV', url: '/b2b/invoices/export', params: range, name: 'WBI_Invoices.csv', permission: 'invoices.read' },
    { title: 'Engineers', desc: 'Engineers who worked on your jobs, with their status and totals.', format: 'CSV', url: '/b2b/engineers/export', params: {}, name: 'WBI_Engineers.csv', permission: 'engineers.read' }
  ].filter((i) => !i.permission || can(i.permission));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((i) => (
        <div key={i.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><FiFileText className="text-brand" /> {i.title}</h3>
            <Badge>{i.format}</Badge>
          </div>
          <p className="text-xs text-gray-500 mt-2 flex-1">{i.desc}</p>
          <button type="button" className={`${btnSecondary} mt-4 self-start`}
            onClick={() => downloadFile(i.url, { params: i.params, fallbackName: i.name, label: `Preparing ${i.title.toLowerCase()}…` })}>
            <FiDownload /> Download
          </button>
        </div>
      ))}
      <p className="md:col-span-2 xl:col-span-3 text-xs text-gray-500">Exports use the period, service and city selected above.</p>
    </div>
  );
};

/* ───────────── Page ───────────── */
const HEADERS = {
  jobs: ['Job Reports', 'Volume, outcomes and service performance.'],
  sla: ['SLA Reports', 'How often each SLA stage was met, and what is at risk now.'],
  engineers: ['Engineer Reports', 'How the engineers on your jobs performed.'],
  financial: ['Financial Reports', 'Money in, money out, and what it paid for, from the wallet ledger.'],
  exports: ['Exports', 'Download your data as Excel, PDF or CSV.']
};

const Reports = () => {
  const { section } = useParams();
  const [filters, setFilters] = useState({ preset: 'all', startDate: '', endDate: '', service: '', city: '', engineer: '' });
  const params = useMemo(() => {
    const out = {};
    for (const k of ['startDate', 'endDate', 'service', 'city', 'engineer']) if (filters[k]) out[k] = filters[k];
    return out;
  }, [filters]);

  if (!SECTIONS.includes(section)) return <Navigate to="/b2b/reports/jobs" replace />;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={HEADERS[section][0]}
        subtitle={HEADERS[section][1]}
        actions={section !== 'exports' && (
          <button type="button" className={btnSecondary}
            onClick={() => downloadFile('/b2b/reports/export/excel', { params, fallbackName: 'WBI_B2B_Reports.xlsx', label: 'Compiling workbook…' })}>
            <FiDownload /> Excel
          </button>
        )}
      />
      <RouteTabs tabs={SECTION_TABS} />
      <FilterBar value={filters} onChange={setFilters} showEngineer={section === 'jobs' || section === 'engineers'} />
      {section === 'jobs' && <JobReports params={params} />}
      {section === 'sla' && <SlaReports params={params} />}
      {section === 'engineers' && <EngineerReports params={params} />}
      {section === 'financial' && <FinancialReports params={params} />}
      {section === 'exports' && <Exports params={params} />}
    </div>
  );
};

export default Reports;
