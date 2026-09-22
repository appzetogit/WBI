import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Search, PackageCheck, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, StatCard, ConfirmDialog, StatusBadge } from '../../components/ops/OpsUi';
import { formatDateTime, formatINR } from '../../components/ops/opsFormat';
import { listJobParts, reserveJobPart, markJobPartUsed, cancelJobPart, errorMessage } from '../../services/vendorJobsService';
import JobPartModal from './JobPartModal';

const STOCK = {
  reserved: { label: 'Reserved', cls: 'bg-emerald-50 text-emerald-700' },
  available: { label: 'In stock', cls: 'bg-blue-50 text-blue-700' },
  short: { label: 'Short', cls: 'bg-red-50 text-red-700' },
  not_stocked: { label: 'Not stocked', cls: 'bg-gray-100 text-gray-600' }
};

/** Parts your open jobs need, with live stock against each. */
const RequiredParts = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [state, setState] = useState({ loading: true, error: '', rows: [], summary: {}, pagination: {} });
  const [adding, setAdding] = useState(false);
  const [cancelFor, setCancelFor] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await listJobParts({ view: 'required', page, limit: 25, ...(debounced ? { search: debounced } : {}) });
      setState({ loading: false, error: '', rows: res.data || [], summary: res.summary || {}, pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load required parts') }));
    }
  }, [page, debounced]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (id, fn, success) => {
    setBusy(id);
    try {
      const res = await fn();
      toast.success(res?.message || success);
      load();
      return true;
    } catch (err) {
      toast.error(errorMessage(err), { duration: 6000 });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const s = state.summary;
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Parts"
        title="Required Parts"
        subtitle="Parts your jobs need before or during the visit. Reserve them from stock so they are kept for the job; a cancelled job returns its reservations automatically."
        actions={(
          <>
            <button type="button" onClick={() => setAdding(true)} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add required part</button>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Needed" value={s.required} tone="amber" />
            <StatCard label="Reserved" value={s.reserved} tone="green" />
            <StatCard label="Short on stock" value={s.short} tone={s.short ? 'red' : 'gray'} />
            <StatCard label="Not stocked" value={s.notStocked} />
            <StatCard label="Value" value={formatINR(s.value)} hint={`${s.jobs || 0} job(s)`} />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part, job ID, engineer, SKU…" aria-label="Search required parts" className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm" />
          </div>
          {!state.rows.length ? (
            <EmptyState title="No parts needed" message="Add a part a job needs, or record parts used on the job under Used Parts." />
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                    <tr><th className="px-4 py-3">Job</th><th className="px-3 py-3">Part</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3">Stock</th><th className="px-3 py-3 text-right">Value</th><th className="px-3 py-3">Requested</th><th className="px-3 py-3" /></tr>
                  </thead>
                  <tbody>
                    {state.rows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-2.5"><p className="font-mono font-bold">{r.jobCode}</p>{r.jobStatus && <div className="mt-1"><StatusBadge status={r.jobStatus} /></div>}{r.engineer && <p className="text-gray-500 mt-1">{r.engineer}</p>}</td>
                        <td className="px-3 py-2.5"><p className="font-semibold">{r.name}</p><p className="text-gray-500">{[r.sku, r.hsnCode && `HSN ${r.hsnCode}`].filter(Boolean).join(' · ')}</p>{r.note && <p className="text-gray-500 italic">{r.note}</p>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.quantity} {r.unit}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold ${STOCK[r.stockState]?.cls || ''}`}>{STOCK[r.stockState]?.label}{r.stockState === 'short' ? ` by ${r.shortBy}` : ''}</span>
                          {r.inStock !== null && r.stockState !== 'reserved' && <p className="text-gray-500 mt-1">{r.inStock} free</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.lineValue)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(r.requiredAt)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {r.status === 'required' && r.stockState === 'available' && (
                              <button type="button" disabled={busy === r.id} onClick={() => act(r.id, () => reserveJobPart(r.id), 'Reserved')} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white flex items-center gap-1 disabled:opacity-50"><PackageCheck className="w-3.5 h-3.5" /> Reserve</button>
                            )}
                            <button type="button" disabled={busy === r.id} onClick={() => act(r.id, () => markJobPartUsed(r.id), 'Marked as used')} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-blue-200 text-blue-700 flex items-center gap-1 disabled:opacity-50"><CheckCircle2 className="w-3.5 h-3.5" /> Used</button>
                            <button type="button" onClick={() => setCancelFor(r)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 text-red-700 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
            </>
          )}
        </>
      )}

      {adding && <JobPartModal mode="required" onClose={() => setAdding(false)} onSaved={load} />}
      {cancelFor && (
        <ConfirmDialog
          title={`Cancel ${cancelFor.name} for ${cancelFor.jobCode}?`}
          message={cancelFor.status === 'reserved' ? 'The reserved stock goes back to your free stock.' : 'The part is removed from the job’s needs.'}
          confirmLabel="Cancel part"
          danger
          requireReason
          onCancel={() => setCancelFor(null)}
          onConfirm={async (reason) => { if (await act(cancelFor.id, () => cancelJobPart(cancelFor.id, reason), 'Part cancelled')) setCancelFor(null); }}
        />
      )}
    </div>
  );
};

export default RequiredParts;
