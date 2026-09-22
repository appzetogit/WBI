import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, MapPin, Clock, UserCheck, Loader2, AlertTriangle, Users, Info } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, SlaBadge, PriorityBadge } from '../../components/ops/OpsUi';
import { formatDateTime } from '../../components/ops/opsFormat';
import { getAssignmentQueue, assignJob, errorMessage } from '../../services/vendorJobsService';
import { useVendorSocket } from '../../context/VendorSocketContext';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import AssignEngineerDialog from '../Jobs/components/AssignEngineerDialog';

const AVAIL = { available: 'Available', busy: 'On a job', offline: 'App offline', on_leave: 'On leave' };

/** Jobs you accepted that need an engineer, each with its best matches. */
const AssignJob = () => {
  const { basePath } = useVendorBasePath();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [state, setState] = useState({ loading: true, error: '', rows: [], pagination: {} });
  const [busy, setBusy] = useState(null);
  const [dialogFor, setDialogFor] = useState(null);
  const { socket } = useVendorSocket() || {};

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await getAssignmentQueue({ page, limit: 10, ...(debounced ? { search: debounced } : {}) });
      setState({ loading: false, error: '', rows: res.data || [], pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load jobs to assign') }));
    }
  }, [page, debounced]);

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

  const assign = async (job, c) => {
    setBusy(`${job.id}:${c.engineerId}`);
    try {
      await assignJob(job.id, c.engineerId);
      toast.success(`${job.jobCode} assigned to ${c.name} — now waiting for them to accept`);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not assign'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Assignments"
        title="Assign Job"
        subtitle="Jobs you accepted that still need an engineer, most urgent SLA first. Suggestions are checked by the server: skill, area, leave, workload and availability."
        actions={(
          <>
            <Link to={`${basePath}/assignments/bulk`} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700">Bulk assign</Link>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job ID, service, city, pincode, customer…" aria-label="Search jobs"
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
      </div>

      {state.loading ? <Skeleton rows={5} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.rows.length ? (
        <EmptyState title={debounced ? 'No jobs match' : 'Every accepted job has an engineer'} message="New jobs appear here as soon as you accept them from Jobs → New Requests." />
      ) : (
        <>
          <ul className="space-y-3">
            {state.rows.map((j) => (
              <li key={j.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${j.engineerRejected || j.sla.state === 'breached' ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">{j.jobCode}</span>
                      <PriorityBadge priority={j.priority} />
                      <SlaBadge sla={j.sla} />
                    </div>
                    <p className="text-sm font-semibold text-gray-800 mt-1">{j.service}</p>
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {j.city} {j.pincode}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDateTime(j.scheduledAt)}{j.scheduledTime ? ` · ${j.scheduledTime}` : ''}</span>
                    </p>
                  </div>
                  <button type="button" onClick={() => setDialogFor(j)} className="self-start px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> All engineers ({j.eligibleCount} eligible)
                  </button>
                </div>
                {j.engineerRejected && (
                  <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
                    <b>{j.engineerRejected.engineerName}</b> rejected this job{j.engineerRejected.reason ? `: ${j.engineerRejected.reason}` : ''} — pick another engineer.
                  </p>
                )}
                {j.candidates.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {j.candidates.map((c, i) => (
                      <div key={c.engineerId} className={`rounded-xl border p-3 flex flex-col gap-2 ${i === 0 ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-gray-900 truncate">{c.name}</span>
                          {i === 0 && <span className="text-[10px] font-bold text-blue-700">Best match</span>}
                        </div>
                        <p className="text-[11px] text-gray-600">
                          {c.locationBasis === 'distance' && c.distanceKm !== null ? `${c.distanceKm} km away` : 'Covers the city'} · {c.activeJobs}/{c.maxActiveJobs} jobs · {AVAIL[c.availability] || c.availability}
                        </p>
                        <button type="button" disabled={Boolean(busy)} onClick={() => assign(j, c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 ${i === 0 ? 'bg-blue-600 text-white' : 'border border-blue-200 text-blue-700'}`}>
                          {busy === `${j.id}:${c.engineerId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />} Assign {c.name.split(' ')[0]}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-amber-900 bg-amber-50 rounded-lg px-3 py-2 space-y-1">
                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> No engineer can take this job right now</p>
                    {j.blockedBy.length ? <ul className="list-disc ml-5">{j.blockedBy.map((b) => <li key={b.reason}>{b.reason} ({b.engineers})</li>)}</ul> : <p>You have no engineers yet.</p>}
                    <p className="flex flex-wrap gap-3 pt-1">
                      <Link to={`${basePath}/engineers/availability`} className="underline font-bold">Engineer availability</Link>
                      <Link to={`${basePath}/engineers/skills`} className="underline font-bold">Engineer skills</Link>
                      <Link to={`${basePath}/engineers/add`} className="underline font-bold">Add engineer</Link>
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
        </>
      )}
      <p className="text-[11px] text-gray-500 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> The engineer gets the job in the TazkY app and must accept it. If they do not, it shows under Reassignment.</p>

      {dialogFor && (
        <AssignEngineerDialog
          job={{ id: dialogFor.id, jobCode: dialogFor.jobCode, service: dialogFor.service, location: { city: dialogFor.city, pincode: dialogFor.pincode }, engineer: null }}
          mode="assign"
          onClose={() => setDialogFor(null)}
          onDone={load}
        />
      )}
    </div>
  );
};

export default AssignJob;
