import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Wand2, Layers, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, SlaBadge, PriorityBadge } from '../../components/ops/OpsUi';
import { getAssignmentQueue, autoAssignJobs, bulkAssign, errorMessage } from '../../services/vendorJobsService';

const AUTO = '__auto__';

/**
 * Assign many jobs at once: let the server pick the best eligible engineer for
 * each (it re-checks workload after every assignment), or choose per job.
 */
const BulkAssignment = () => {
  const [state, setState] = useState({ loading: true, error: '', rows: [], total: 0 });
  const [picked, setPicked] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getAssignmentQueue({ page: 1, limit: 25 });
      setState({ loading: false, error: '', rows: res.data || [], total: res.pagination?.total || 0 });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load jobs') }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const rows = state.rows;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const choice = (r) => picked[r.id] || AUTO;
  const chosen = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const run = async () => {
    if (!chosen.length) return;
    setBusy(true);
    setResults(null);
    try {
      const autoIds = chosen.filter((r) => choice(r) === AUTO).map((r) => r.id);
      const manual = chosen.filter((r) => choice(r) !== AUTO).map((r) => ({ jobId: r.id, engineerId: choice(r) }));
      const out = [];
      // Manual picks first so the automatic ones see that workload.
      if (manual.length) {
        const res = await bulkAssign(manual).catch((err) => err.response?.data || { data: [] });
        out.push(...(res.data || []).map((x) => ({ ...x, message: x.ok ? `Assigned to ${x.engineer}` : x.message })));
      }
      if (autoIds.length) {
        const res = await autoAssignJobs(autoIds).catch((err) => err.response?.data || { data: [] });
        out.push(...(res.data || []));
      }
      const codeOf = new Map(rows.map((r) => [r.id, r.jobCode]));
      setResults(out.map((r) => ({ ...r, jobCode: r.jobCode || codeOf.get(r.jobId) })));
      const ok = out.filter((r) => r.ok).length;
      if (ok) toast.success(`${ok} of ${out.length} job(s) assigned`);
      else toast.error('No job could be assigned — see the reasons below');
      setSelected(new Set());
      setPicked({});
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Bulk assignment failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Assignments"
        title="Bulk Assignment"
        subtitle="Select jobs and assign them in one go. “Best match” lets the server pick the most suitable eligible engineer for each job, one after another, so nobody is overloaded."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />

      {results && (
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Result</h2>
          <ul className="space-y-1 text-xs">
            {results.map((r) => (
              <li key={r.jobId} className={`flex items-start gap-2 ${r.ok ? 'text-emerald-800' : 'text-red-700'}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span><b className="font-mono">{r.jobCode || r.jobId}</b> — {r.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !rows.length ? (
        <EmptyState title="Nothing to assign" message="Every accepted job already has an engineer." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-600">{state.total > rows.length ? `Showing the ${rows.length} most urgent of ${state.total} jobs.` : `${rows.length} job(s) need an engineer.`}</p>
            <button type="button" disabled={!chosen.length || busy} onClick={run} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />} Assign {chosen.length} selected
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-3"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                  <th className="px-3 py-3">Job</th><th className="px-3 py-3">Service · area</th><th className="px-3 py-3">SLA</th><th className="px-3 py-3 min-w-[240px]">Engineer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-gray-100 ${selected.has(r.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${r.jobCode}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-3 py-2.5"><p className="font-mono font-bold">{r.jobCode}</p><PriorityBadge priority={r.priority} /></td>
                    <td className="px-3 py-2.5"><p className="font-semibold">{r.service}</p><p className="text-gray-500">{r.city} {r.pincode}</p></td>
                    <td className="px-3 py-2.5"><SlaBadge sla={r.sla} /></td>
                    <td className="px-3 py-2.5">
                      {r.candidates.length ? (
                        <select value={choice(r)} onChange={(e) => { setPicked((p) => ({ ...p, [r.id]: e.target.value })); setSelected((s) => new Set(s).add(r.id)); }}
                          aria-label={`Engineer for ${r.jobCode}`} className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                          <option value={AUTO}>Best match ({r.candidates[0].name})</option>
                          {r.candidates.map((c) => <option key={c.engineerId} value={c.engineerId}>{c.name} · {c.activeJobs}/{c.maxActiveJobs} jobs{c.distanceKm !== null ? ` · ${c.distanceKm} km` : ''}</option>)}
                        </select>
                      ) : (
                        <span className="text-amber-800 flex items-center gap-1"><Wand2 className="w-3.5 h-3.5" /> No eligible engineer{r.blockedBy[0] ? ` — ${r.blockedBy[0].reason}` : ''}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default BulkAssignment;
