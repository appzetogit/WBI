import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Repeat, AlertTriangle, Info } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, StatCard, StatusBadge, SlaBadge } from '../../components/ops/OpsUi';
import { formatDateTime } from '../../components/ops/opsFormat';
import { getReassignable, errorMessage } from '../../services/vendorJobsService';
import { useVendorSocket } from '../../context/VendorSocketContext';
import AssignEngineerDialog from '../Jobs/components/AssignEngineerDialog';

const FLAG_CLS = {
  engineer_inactive: 'bg-red-50 text-red-700 border-red-200',
  engineer_on_leave: 'bg-red-50 text-red-700 border-red-200',
  sla_breached: 'bg-red-50 text-red-700 border-red-200',
  not_accepted: 'bg-amber-50 text-amber-800 border-amber-200',
  sla_at_risk: 'bg-amber-50 text-amber-800 border-amber-200',
  paused_before_start: 'bg-gray-100 text-gray-700 border-gray-200',
  engineer_offline: 'bg-gray-100 text-gray-700 border-gray-200'
};

/** Jobs you can move to another engineer, the ones needing attention first. */
const Reassignment = () => {
  const [state, setState] = useState({ loading: true, error: '', rows: [], summary: {}, recent: [] });
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [dialogFor, setDialogFor] = useState(null);
  const { socket } = useVendorSocket() || {};

  const load = useCallback(async () => {
    try {
      const res = await getReassignable();
      setState({ loading: false, error: '', rows: res.data || [], summary: res.summary || {}, recent: res.recent || [] });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load jobs') }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const timer = useRef(null);
  useEffect(() => {
    if (!socket?.on) return undefined;
    const events = ['job:statusChanged', 'vendor:jobNotice'];
    const onEvent = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 600); };
    events.forEach((e) => socket.on(e, onEvent));
    return () => { clearTimeout(timer.current); events.forEach((e) => socket.off?.(e, onEvent)); };
  }, [socket, load]);

  const rows = onlyFlagged ? state.rows.filter((r) => r.flags.length) : state.rows;
  const s = state.summary;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Assignments"
        title="Reassignment"
        subtitle="Jobs with an engineer that you can still move to someone else — until work starts. The most urgent are first."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Can be reassigned" value={s.reassignable} />
            <StatCard label="Need attention" value={s.needsAttention} tone={s.needsAttention ? 'red' : 'gray'} />
            <StatCard label="Not accepted in time" value={s.notAccepted} tone={s.notAccepted ? 'amber' : 'gray'} hint={`Waiting longer than ${s.acceptWaitMinutes} min`} />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-700">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="w-4 h-4" /> Only jobs that need attention
          </label>

          {!rows.length ? (
            <EmptyState title={onlyFlagged ? 'Nothing needs attention' : 'No reassignable jobs'} message="Jobs appear here once they have an engineer and until work starts." />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                  <tr><th className="px-4 py-3">Job</th><th className="px-3 py-3">Engineer</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">SLA</th><th className="px-3 py-3">Needs attention</th><th className="px-3 py-3" /></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`border-t border-gray-100 align-top ${r.severity >= 3 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-2.5"><p className="font-mono font-bold">{r.jobCode}</p><p className="text-gray-500">{r.service} · {r.city}</p></td>
                      <td className="px-3 py-2.5"><p className="font-semibold">{r.engineer?.name}</p><p className="text-gray-500">since {formatDateTime(r.assignedAt)}</p></td>
                      <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2.5"><SlaBadge sla={r.sla} /></td>
                      <td className="px-3 py-2.5">
                        {r.flags.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.flags.map((f) => <span key={f.code} className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${FLAG_CLS[f.code] || ''}`}>{f.label}</span>)}
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" onClick={() => setDialogFor(r)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 ${r.severity >= 2 ? 'bg-blue-600 text-white' : 'border border-blue-200 text-blue-700'}`}>
                          <Repeat className="w-3.5 h-3.5" /> Reassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section className="bg-white rounded-2xl border border-gray-200 p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Recent reassignments</h2>
            {state.recent.length ? (
              <ul className="divide-y divide-gray-100">
                {state.recent.map((r) => (
                  <li key={r.id} className="py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span><b className="font-mono">{r.jobCode}</b> · {r.from || '—'} → {r.to || '—'}{r.reason ? <span className="text-gray-500"> · {r.reason}</span> : ''}</span>
                    <span className="text-gray-400 whitespace-nowrap">{formatDateTime(r.at)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-gray-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> No reassignments yet.</p>}
          </section>
          <p className="text-[11px] text-gray-500 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> A reason is required; both engineers are notified and the change is kept in Assignment History.</p>
        </>
      )}

      {dialogFor && (
        <AssignEngineerDialog
          job={{ id: dialogFor.id, jobCode: dialogFor.jobCode, service: dialogFor.service, location: { city: dialogFor.city, pincode: dialogFor.pincode }, engineer: dialogFor.engineer }}
          mode="reassign"
          onClose={() => setDialogFor(null)}
          onDone={load}
        />
      )}
    </div>
  );
};

export default Reassignment;
