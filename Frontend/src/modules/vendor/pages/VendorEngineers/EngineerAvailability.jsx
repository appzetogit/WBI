import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Clock, Pencil, Plane, Wifi, WifiOff } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, ErrorState, EmptyState } from '../../components/ops/OpsUi';
import { formatDate } from '../../components/ops/opsFormat';
import { listEngineers, errorMessage } from '../../services/vendorJobsService';
import { useVendorSocket } from '../../context/VendorSocketContext';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import { AvailabilityBadge, EngineerEditModal } from './components/EngineerUi';
import EngineerDrawer from './components/EngineerDrawer';
import useTeamServices from './useTeamServices';
import { AVAILABILITY, AVAILABILITY_ORDER, availabilityCount, inAvailability } from './engineerMeta';

const HINT = {
  available: 'Can be assigned now',
  busy: 'On one or more jobs',
  on_leave: 'Approved leave today',
  off_today: 'Not a working day',
  offline: 'App offline — can still be assigned'
};

/** Live availability of active engineers (same rules routing uses). */
const EngineerAvailability = () => {
  const { basePath } = useVendorBasePath();
  const services = useTeamServices();
  const [params, setParams] = useSearchParams();
  const filter = AVAILABILITY_ORDER.includes(params.get('filter')) ? params.get('filter') : '';
  const [state, setState] = useState({ loading: true, error: '', rows: [], counts: null });
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const { socket } = useVendorSocket() || {};

  const load = useCallback(async () => {
    try {
      const res = await listEngineers({ tab: 'active', limit: 200 });
      setState({ loading: false, error: '', rows: res.data || [], counts: res.counts || null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load availability') }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Job changes change workload; refresh live.
  const timer = useRef(null);
  useEffect(() => {
    if (!socket?.on) return undefined;
    const events = ['job:statusChanged', 'vendor:jobNotice'];
    const onEvent = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 800); };
    events.forEach((e) => socket.on(e, onEvent));
    return () => { clearTimeout(timer.current); events.forEach((e) => socket.off?.(e, onEvent)); };
  }, [socket, load]);

  const c = state.counts;
  const rows = filter ? state.rows.filter((e) => inAvailability(e.availability.status, filter)) : state.rows;
  const cannotWork = c ? c.pending + c.inactive : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Engineers"
        title="Engineer Availability"
        subtitle="Who can take a job right now, and why the others cannot. Updates as jobs move."
        actions={(
          <>
            <Link to={`${basePath}/engineers/roster`} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5"><Plane className="w-3.5 h-3.5" /> Roster & leave</Link>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AVAILABILITY_ORDER.map((k) => {
              const active = filter === k;
              return (
                <button key={k} type="button" onClick={() => setParams(active ? {} : { filter: k })} aria-pressed={active}
                  className={`text-left p-3 rounded-2xl border bg-white ${active ? 'ring-2 ring-gray-900 border-gray-900' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${AVAILABILITY[k].dot}`} />
                  <p className="text-2xl font-extrabold tabular-nums text-gray-900 mt-1">{availabilityCount(c?.availability, k)}</p>
                  <p className="text-xs font-bold text-gray-800">{AVAILABILITY[k].label}</p>
                  <p className="text-[10px] text-gray-500">{HINT[k]}</p>
                </button>
              );
            })}
          </div>
          {cannotWork > 0 && (
            <p className="text-xs text-gray-600">
              {cannotWork} more engineer(s) cannot take jobs at all: <Link to={`${basePath}/engineers?tab=pending`} className="font-bold underline">{c.pending} pending</Link> · <Link to={`${basePath}/engineers?tab=inactive`} className="font-bold underline">{c.inactive} inactive</Link>
            </p>
          )}

          {!rows.length ? (
            <EmptyState title={filter ? `Nobody is ${AVAILABILITY[filter].label.toLowerCase()}` : 'No active engineers'} message={filter ? 'Pick another status above.' : 'Engineers appear here once they are verified and active.'} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                  <tr><th className="px-4 py-2.5">Engineer</th><th className="px-3 py-2.5">Now</th><th className="px-3 py-2.5 min-w-[140px]">Workload</th><th className="px-3 py-2.5">Current jobs</th><th className="px-3 py-2.5">Schedule</th><th className="px-3 py-2.5" /></tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const a = e.availability;
                    const pct = Math.min(100, Math.round((a.activeJobs / Math.max(1, a.maxActiveJobs)) * 100));
                    return (
                      <tr key={e.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setOpenId(e.id)} className="font-bold text-gray-900 hover:underline">{e.name}</button>
                          <p className="text-gray-500 flex items-center gap-1 mt-0.5">{a.online ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3" />} {a.online ? 'App online' : 'App offline'}</p>
                        </td>
                        <td className="px-3 py-3">
                          <AvailabilityBadge availability={a} />
                          {a.onLeave && <p className="text-rose-700 mt-1">until {formatDate(a.leaveUntil)}{a.leaveType ? ` · ${a.leaveType}` : ''}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="img" aria-label={`${a.activeJobs} of ${a.maxActiveJobs} jobs`}>
                            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-orange-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 tabular-nums text-gray-600">{a.activeJobs} / {a.maxActiveJobs} jobs</p>
                        </td>
                        <td className="px-3 py-3 text-gray-700">{e.currentJobs.length ? e.currentJobs.map((j) => <p key={j.id}><span className="font-mono font-bold">{j.jobCode}</span> · {j.city}</p>) : '—'}</td>
                        <td className="px-3 py-3 text-gray-700">
                          <p className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {e.schedule.workingDays.length ? e.schedule.workingDays.map((d) => d.slice(0, 3)).join(' ') : 'Every day'}</p>
                          {e.schedule.workingHours && <p className="flex items-center gap-1 text-gray-500"><Clock className="w-3 h-3" /> {e.schedule.workingHours.start} – {e.schedule.workingHours.end}</p>}
                          {e.schedule.emergencyService && <p className="text-emerald-700 font-semibold">Emergency call-outs</p>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => setEditing(e)} className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Schedule</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {openId && <EngineerDrawer engineerId={openId} services={services} onClose={() => setOpenId(null)} onChanged={load} />}
      {editing && <EngineerEditModal engineer={editing} services={services} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
};

export default EngineerAvailability;
