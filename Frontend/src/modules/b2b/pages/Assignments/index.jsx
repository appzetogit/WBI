import React, { useEffect, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FiSearch, FiUsers, FiUser, FiClock, FiRepeat } from 'react-icons/fi';
import api from '../../../../services/api';
import {
  PageHeader, StatCard, RouteTabs, Pagination, EmptyState, ErrorState, TableSkeleton, Badge,
  VIEW_LABEL, VIEW_TONE, fmtDateTime, fmtMinutes, inputCls
} from '../../components/ui';

const MODES = ['vendor', 'freelancer', 'history'];

const STATUS_TONE = {
  assigned: 'amber', accepted: 'blue', completed: 'green', rejected: 'red',
  expired: 'red', reassigned: 'violet', cancelled: 'gray', released: 'gray'
};

const useDebounced = (value, ms = 400) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Current jobs held by vendors or freelancers. */
const CurrentAssignments = ({ type }) => {
  const [stage, setStage] = useState('held');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  useEffect(() => setPage(1), [q, stage, type]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bAssignmentsCurrent', type, stage, q, page],
    queryFn: async () => (await api.get('/b2b/assignments/current', {
      params: { type, stage: type === 'vendor' ? stage : undefined, search: q || undefined, page, limit: 20 }
    })).data,
    refetchInterval: 30000,
    placeholderData: (prev) => prev
  });
  const rows = data?.data || [];
  const p = data?.pagination;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-50">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job, customer, city, engineer…" className={`${inputCls} w-full pl-9`} />
        </div>
        {type === 'vendor' && (
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Vendor stage">
            {[['held', 'Accepted by vendor'], ['offered', 'Offer pending']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setStage(k)}
                className={`px-3 h-9 text-xs font-semibold rounded-md ${stage === k ? 'bg-brand text-white' : 'text-gray-600 hover:text-brand'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="py-3 px-4">Job</th>
              <th className="py-3 px-4">Service / City</th>
              <th className="py-3 px-4">{type === 'vendor' ? 'Vendor' : 'Freelancer'}</th>
              {type === 'vendor' && <th className="py-3 px-4">Engineer</th>}
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Assigned</th>
              <th className="py-3 px-4">{stage === 'offered' && type === 'vendor' ? 'Offer expires' : 'SLA'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? <TableSkeleton cols={type === 'vendor' ? 7 : 6} /> : error ? (
              <tr><td colSpan={7}><ErrorState error={error} onRetry={refetch} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState
                  title={type === 'vendor' ? (stage === 'offered' ? 'No open vendor offers' : 'No jobs with vendors right now') : 'No jobs with freelancers right now'}
                  message="Jobs appear here as routing places them. Resolved, cancelled and failed jobs move to Assignment History."
                />
              </td></tr>
            ) : rows.map((j) => (
              <tr key={j._id} className="hover:bg-gray-50/50">
                <td className="py-3 px-4">
                  <p className="font-semibold text-brand">{j.jobId}</p>
                  <p className="text-xs text-gray-500">{j.customerName}</p>
                </td>
                <td className="py-3 px-4">
                  <p className="text-gray-800">{j.service}</p>
                  <p className="text-xs text-gray-500">{j.city}{j.pincode ? ` · ${j.pincode}` : ''}</p>
                </td>
                <td className="py-3 px-4">
                  {type === 'vendor'
                    ? (stage === 'offered'
                      ? <span className="text-gray-700">Offered to {j.offeredVendorCount} vendor{j.offeredVendorCount === 1 ? '' : 's'}</span>
                      : <span className="text-gray-800">{j.assignedVendorName || 'Vendor'}</span>)
                    : <span className="text-gray-800">{j.engineerName || '—'}</span>}
                </td>
                {type === 'vendor' && <td className="py-3 px-4 text-gray-700">{j.engineerName || <span className="text-gray-400">Not yet allocated</span>}</td>}
                <td className="py-3 px-4">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={VIEW_TONE[j.view]}>{VIEW_LABEL[j.view] || j.status}</Badge>
                    {j.slaBreached && <Badge tone="red">SLA breached</Badge>}
                  </div>
                </td>
                <td className="py-3 px-4 text-xs text-gray-600">{fmtDateTime(j.assignedAt || j.updatedAt)}</td>
                <td className="py-3 px-4 text-xs text-gray-600">
                  {stage === 'offered' && type === 'vendor'
                    ? (j.offerExpiresInMinutes === null ? '—' : j.offerExpiresInMinutes < 0 ? <span className="text-red-600">Lapsed</span> : `in ${fmtMinutes(j.offerExpiresInMinutes)}`)
                    : (j.sla?.resolutionDueAt ? `Due ${fmtDateTime(j.sla.resolutionDueAt)}` : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p && <Pagination page={p.page} totalPages={p.totalPages} total={p.total} limit={p.limit} onPage={setPage} />}
    </div>
  );
};

/** Every assignment ever made on the company's jobs (append-only). */
const AssignmentHistory = () => {
  const [filters, setFilters] = useState({ type: '', status: '', startDate: '', endDate: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  useEffect(() => setPage(1), [q, filters]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bAssignmentsHistory', filters, q, page],
    queryFn: async () => (await api.get('/b2b/assignments/history', {
      params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), search: q || undefined, page, limit: 25 }
    })).data,
    placeholderData: (prev) => prev
  });
  const rows = data?.data || [];
  const p = data?.pagination;
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-50">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job, customer, city…" className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filters.type} onChange={set('type')} className={inputCls} aria-label="Assignment type">
          <option value="">All types</option>
          <option value="vendor_engineer">Vendor engineer</option>
          <option value="freelancer">Freelancer</option>
          <option value="worker">Worker</option>
        </select>
        <select value={filters.status} onChange={set('status')} className={inputCls} aria-label="Outcome">
          <option value="">All outcomes</option>
          {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <input type="date" value={filters.startDate} onChange={set('startDate')} className={inputCls} aria-label="From" />
        <input type="date" value={filters.endDate} onChange={set('endDate')} className={inputCls} aria-label="To" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="py-3 px-4">Job</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Vendor / Engineer</th>
              <th className="py-3 px-4">Assigned by</th>
              <th className="py-3 px-4">Outcome</th>
              <th className="py-3 px-4">Assigned</th>
              <th className="py-3 px-4 text-right">Time to accept</th>
              <th className="py-3 px-4 text-right">Held for</th>
              <th className="py-3 px-4">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? <TableSkeleton cols={9} /> : error ? (
              <tr><td colSpan={9}><ErrorState error={error} onRetry={refetch} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9}><EmptyState title="No assignments match" message="Every engineer assignment on your jobs is recorded here, including reassignments and expiries." /></td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="py-3 px-4">
                  <p className="font-semibold text-brand">{r.job.jobId}</p>
                  <p className="text-xs text-gray-500">{r.job.service} · {r.job.city}</p>
                </td>
                <td className="py-3 px-4 text-gray-700">{r.assignmentType === 'vendor_engineer' ? 'Vendor' : r.assignmentType === 'freelancer' ? 'Freelancer' : 'Worker'}</td>
                <td className="py-3 px-4">
                  {r.vendorName && <p className="text-gray-800">{r.vendorName}</p>}
                  <p className={r.vendorName ? 'text-xs text-gray-500' : 'text-gray-800'}>{r.engineerName || '—'}</p>
                </td>
                <td className="py-3 px-4 text-xs text-gray-600 capitalize">{r.assignedByRole || '—'}{r.routingMode ? ` · ${r.routingMode}` : ''}</td>
                <td className="py-3 px-4"><Badge tone={STATUS_TONE[r.status]}>{r.status}{r.isOpen ? ' (open)' : ''}</Badge></td>
                <td className="py-3 px-4 text-xs text-gray-600">{fmtDateTime(r.assignedAt)}</td>
                <td className="py-3 px-4 text-xs text-right tabular-nums">{fmtMinutes(r.minutesToAccept)}</td>
                <td className="py-3 px-4 text-xs text-right tabular-nums">{fmtMinutes(r.minutesHeld)}</td>
                <td className="py-3 px-4 text-xs text-gray-600 max-w-[240px] truncate" title={r.closeReason}>{r.closeReason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p && <Pagination page={p.page} totalPages={p.totalPages} total={p.total} limit={p.limit} onPage={setPage} />}
    </div>
  );
};

const Assignments = () => {
  const { mode } = useParams();
  const { data: summary, isLoading } = useQuery({
    queryKey: ['b2bAssignmentsSummary'],
    queryFn: async () => (await api.get('/b2b/assignments/summary')).data.data,
    refetchInterval: 30000
  });

  if (!MODES.includes(mode)) return <Navigate to="/b2b/assignments/vendor" replace />;

  const titles = {
    vendor: ['Vendor Assignments', 'Open jobs a vendor has accepted, and offers waiting on a vendor.'],
    freelancer: ['Freelancer Assignments', 'Open jobs held by independent engineers.'],
    history: ['Assignment History', 'Every assignment on your jobs: who held it, how long, and how it ended.']
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title={titles[mode][0]} subtitle={titles[mode][1]} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="With vendors" value={summary?.vendorActive ?? 0} icon={FiUsers} loading={isLoading} />
        <StatCard label="Vendor offers pending" value={summary?.vendorOffered ?? 0} icon={FiClock} tone="warn" loading={isLoading} />
        <StatCard label="With freelancers" value={summary?.freelancerActive ?? 0} icon={FiUser} loading={isLoading} />
        <StatCard
          label="Waiting for a provider"
          value={summary?.unassigned ?? 0}
          tone={summary?.unassigned ? 'warn' : 'default'}
          hint={<Link to="/b2b/jobs/pending" className="text-brand hover:underline">View pending jobs</Link>}
          loading={isLoading}
        />
        <StatCard
          label="Acceptance rate"
          value={summary?.history?.acceptanceRate === null || summary?.history?.acceptanceRate === undefined ? '—' : `${summary.history.acceptanceRate}%`}
          hint={`${(summary?.history?.total ?? 0).toLocaleString('en-IN')} assignments in total`}
          icon={FiRepeat}
          loading={isLoading}
        />
      </div>

      <RouteTabs tabs={[
        { to: '/b2b/assignments/vendor', label: 'Vendor', count: summary ? summary.vendorActive + summary.vendorOffered : undefined },
        { to: '/b2b/assignments/freelancer', label: 'Freelancer', count: summary?.freelancerActive },
        { to: '/b2b/assignments/history', label: 'History', count: summary?.history?.total }
      ]} />

      {mode === 'history' ? <AssignmentHistory /> : <CurrentAssignments key={mode} type={mode} />}
    </div>
  );
};

export default Assignments;
