import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Search } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, StatusBadge } from '../../components/ops/OpsUi';
import { formatDateTime } from '../../components/ops/opsFormat';
import { listAssignments, listEngineers, errorMessage } from '../../services/vendorJobsService';

const OUTCOMES = {
  assigned: { label: 'Waiting to accept', cls: 'bg-indigo-50 text-indigo-700' },
  accepted: { label: 'Accepted', cls: 'bg-blue-50 text-blue-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700' },
  reassigned: { label: 'Reassigned', cls: 'bg-amber-50 text-amber-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700' },
  released: { label: 'Released', cls: 'bg-gray-100 text-gray-600' }
};
const BY = { vendor: 'You', admin: 'WBI', company: 'Client', system: 'Routing', engineer: 'Engineer' };

const csvCell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** Every assignment ever made on your jobs — append-only, never edited. */
const AssignmentHistory = () => {
  const [filters, setFilters] = useState({ status: '', engineerId: '', from: '', to: '', search: '' });
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', rows: [], outcomes: {}, pagination: {} });
  const [engineers, setEngineers] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(filters.search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const params = useCallback((extra = {}) => ({
    page, limit: 25,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.engineerId ? { engineerId: filters.engineerId } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59` } : {}),
    ...(debounced ? { search: debounced } : {}),
    ...extra
  }), [page, filters.status, filters.engineerId, filters.from, filters.to, debounced]);

  const load = useCallback(async () => {
    try {
      const res = await listAssignments(params());
      setState({ loading: false, error: '', rows: res.data || [], outcomes: res.outcomes || {}, pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load assignment history') }));
    }
  }, [params]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    listEngineers({ tab: 'all', limit: 200 }).then((r) => setEngineers(r.data || [])).catch(() => setEngineers([]));
  }, []);

  const set = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); if (k !== 'search') setPage(1); };

  const exportCsv = async () => {
    try {
      const res = await listAssignments(params({ page: 1, limit: 200 }));
      const head = ['Job', 'Service', 'City', 'Engineer', 'Outcome', 'Assigned by', 'Mode', 'Assigned at', 'Accepted at', 'Closed at', 'Response (min)', 'Reason', 'Close reason'];
      const lines = (res.data || []).map((r) => [r.jobCode, r.service, r.city, r.engineer?.name, r.status, BY[r.assignedBy] || r.assignedBy, r.routingMode, r.assignedAt, r.acceptedAt, r.closedAt, r.responseMinutes, r.reason, r.closeReason].map(csvCell).join(','));
      const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `assignment-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if ((res.pagination?.total || 0) > 200) toast('Exported the latest 200 rows — narrow the filters for more', { icon: 'ℹ️' });
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    }
  };

  const total = Object.values(state.outcomes).reduce((n, x) => n + x, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Assignments"
        title="Assignment History"
        subtitle="Every assignment, acceptance, rejection and reassignment on your jobs, kept permanently."
        actions={(
          <>
            <button type="button" onClick={exportCsv} className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-white"><Download className="w-3.5 h-3.5" /> CSV</button>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => set('status', '')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${!filters.status ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>All {total}</button>
        {Object.entries(OUTCOMES).map(([k, o]) => (
          <button key={k} type="button" onClick={() => set('status', filters.status === k ? '' : k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${filters.status === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
            {o.label} {state.outcomes[k] || 0}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Job ID" aria-label="Search job ID" className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs" />
        </div>
        <select value={filters.engineerId} onChange={(e) => set('engineerId', e.target.value)} aria-label="Engineer" className="px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white">
          <option value="">All engineers</option>
          {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} aria-label="Assigned from" className="px-3 py-2 border border-gray-200 rounded-lg text-xs" />
        <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} aria-label="Assigned to" className="px-3 py-2 border border-gray-200 rounded-lg text-xs" />
      </div>

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.rows.length ? (
        <EmptyState title="No assignments match" message="Change the filters, or assign a job from Assign Job." />
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                <tr><th className="px-4 py-3">Job</th><th className="px-3 py-3">Engineer</th><th className="px-3 py-3">Outcome</th><th className="px-3 py-3">By</th><th className="px-3 py-3">Assigned</th><th className="px-3 py-3">Response</th><th className="px-3 py-3">Closed</th><th className="px-3 py-3">Reason / note</th></tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-mono font-bold">{r.jobCode}</p>
                      <p className="text-gray-500">{r.service}{r.city ? ` · ${r.city}` : ''}</p>
                      {r.jobStatus && <div className="mt-1"><StatusBadge status={r.jobStatus} /></div>}
                    </td>
                    <td className="px-3 py-2.5">{r.engineer?.name || '—'}{r.replacedBy && <p className="text-gray-500">→ {r.replacedBy}</p>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${OUTCOMES[r.status]?.cls || ''}`}>{OUTCOMES[r.status]?.label || r.status}</span>
                      {r.isOpen && <p className="text-[10px] text-gray-400 mt-1">current</p>}
                    </td>
                    <td className="px-3 py-2.5">{BY[r.assignedBy] || r.assignedBy || '—'}{r.routingMode === 'auto' && <p className="text-[10px] text-blue-700 font-bold">best match</p>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(r.assignedAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.responseMinutes !== null ? `${r.responseMinutes} min` : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(r.closedAt)}</td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-xs">{r.closeReason || r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
        </>
      )}
    </div>
  );
};

export default AssignmentHistory;
