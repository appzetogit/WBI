import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Download, FileText } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, StatCard } from '../../components/ops/OpsUi';
import { formatDateTime, formatINR } from '../../components/ops/opsFormat';
import { listJobParts, errorMessage } from '../../services/vendorJobsService';
import JobPartModal from './JobPartModal';

const isoDay = (d) => d.toISOString().slice(0, 10);
const csvCell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** Parts consumed on your jobs, with their value — plus parts engineers noted as text. */
const UsedParts = () => {
  const [range, setRange] = useState(() => ({ from: isoDay(new Date(Date.now() - 30 * 86400000)), to: isoDay(new Date()) }));
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', rows: [], summary: {}, legacy: [], pagination: {} });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await listJobParts({ view: 'used', page, limit: 25, from: range.from, to: `${range.to}T23:59:59`, ...(debounced ? { search: debounced } : {}) });
      setState({ loading: false, error: '', rows: res.data || [], summary: res.summary || {}, legacy: res.legacy || [], pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load used parts') }));
    }
  }, [page, range, debounced]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = () => {
    const head = ['Used at', 'Job', 'Engineer', 'Part', 'SKU', 'HSN', 'Qty', 'Unit', 'Unit price', 'GST %', 'Value'];
    const lines = state.rows.map((r) => [r.usedAt, r.jobCode, r.engineer, r.name, r.sku, r.hsnCode, r.quantity, r.unit, r.unitPrice, r.gstPercentage, r.lineValue].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `used-parts-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = state.summary;
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Parts"
        title="Used Parts"
        subtitle="Parts fitted on your jobs. Stock is deducted when a part is marked used."
        actions={(
          <>
            <input type="date" value={range.from} max={range.to} onChange={(e) => { setRange((r) => ({ ...r, from: e.target.value })); setPage(1); }} aria-label="From" className="px-3 py-2 border border-gray-200 rounded-xl text-xs" />
            <input type="date" value={range.to} min={range.from} onChange={(e) => { setRange((r) => ({ ...r, to: e.target.value })); setPage(1); }} aria-label="To" className="px-3 py-2 border border-gray-200 rounded-xl text-xs" />
            <button type="button" onClick={exportCsv} disabled={!state.rows.length} className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-white disabled:opacity-50"><Download className="w-3.5 h-3.5" /> CSV</button>
            <button type="button" onClick={() => setAdding(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Record used part</button>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Parts used" value={s.parts} />
            <StatCard label="Units" value={s.quantity} />
            <StatCard label="Jobs" value={s.jobs} />
            <StatCard label="Value" value={formatINR(s.value)} tone="blue" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part, job ID, engineer, SKU…" aria-label="Search used parts" className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm" />
          </div>
          {!state.rows.length ? (
            <EmptyState title="No parts used in this period" message="Mark required parts as used, or record a part fitted on a job." />
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                    <tr><th className="px-4 py-3">Used</th><th className="px-3 py-3">Job</th><th className="px-3 py-3">Part</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Value</th><th className="px-3 py-3">From stock</th></tr>
                  </thead>
                  <tbody>
                    {state.rows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(r.usedAt)}</td>
                        <td className="px-3 py-2.5"><p className="font-mono font-bold">{r.jobCode}</p>{r.engineer && <p className="text-gray-500">{r.engineer}</p>}</td>
                        <td className="px-3 py-2.5"><p className="font-semibold">{r.name}</p><p className="text-gray-500">{[r.sku, r.hsnCode && `HSN ${r.hsnCode}`].filter(Boolean).join(' · ')}</p></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.quantity} {r.unit}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.unitPrice)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold">{formatINR(r.lineValue)}</td>
                        <td className="px-3 py-2.5">{r.inventoryItemId ? 'Yes' : <span className="text-gray-500">Bought locally</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
            </>
          )}

          {state.legacy.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Noted by engineers at completion</h2>
              <p className="text-xs text-gray-500 mb-2">Free text from the TazkY app. Record them above as used parts to deduct stock and include their value.</p>
              <ul className="divide-y divide-gray-100 text-xs">
                {state.legacy.map((l) => (
                  <li key={l.jobId} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span><b className="font-mono">{l.jobCode}</b>{l.engineer ? ` · ${l.engineer}` : ''} — {l.text}</span>
                    <span className="text-gray-400 whitespace-nowrap">{formatDateTime(l.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {adding && <JobPartModal mode="used" onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
};

export default UsedParts;
