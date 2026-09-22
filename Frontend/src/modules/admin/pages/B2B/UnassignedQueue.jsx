import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FiAlertTriangle, FiRefreshCw, FiX, FiMapPin, FiClock, FiUserCheck, FiBriefcase, FiChevronDown, FiChevronUp, FiCheckCircle
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import b2bAdminService from '../../services/b2bAdminService';
import { getUserFacingError } from '../../../../utils/userFacingError';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const age = (d) => {
  if (!d) return '';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} d`;
};
const errText = (err, fallback) => getUserFacingError(err, fallback);

const PRIORITY_CLS = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-blue-50 text-blue-700',
  low: 'bg-gray-100 text-gray-600'
};

/* ── Resolve drawer: route to a vendor, or assign a freelancer directly ── */
const ResolvePanel = ({ job, onClose, onDone }) => {
  const [mode, setMode] = useState('vendor');
  const [vendorPick, setVendorPick] = useState(null);
  const [engineerPick, setEngineerPick] = useState(null);
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  const vendors = useQuery({
    queryKey: ['routingCandidates', job.id],
    queryFn: () => b2bAdminService.getVendorCandidates(job.id),
    enabled: mode === 'vendor'
  });
  const engineers = useQuery({
    queryKey: ['routingEngineers', job.id],
    queryFn: () => b2bAdminService.getEligibleEngineers(job.id),
    enabled: mode === 'engineer'
  });
  const timeline = useQuery({
    queryKey: ['routingTimeline', job.id],
    queryFn: () => b2bAdminService.getJobTimeline(job.id)
  });

  const route = useMutation({
    mutationFn: () => b2bAdminService.routeToVendor(job.id, { vendorId: vendorPick.vendorId, reason: reason.trim(), override: override || undefined }),
    onSuccess: (res) => { toast.success(res.message || 'Job routed to vendor'); onDone(); },
    onError: (err) => toast.error(errText(err, 'Could not route job'))
  });
  const assign = useMutation({
    mutationFn: () => b2bAdminService.assignEngineer(job.id, { engineerId: engineerPick.engineerId, notes: reason.trim() || undefined }),
    onSuccess: (res) => { toast.success(res.message || 'Engineer assigned'); onDone(); },
    onError: (err) => toast.error(errText(err, 'Could not assign engineer'))
  });

  const ranked = vendors.data?.data || [];
  const rejected = vendors.data?.rejected || [];
  const freelancers = engineers.data?.data || [];
  const excluded = engineers.data?.ineligible || [];
  const events = (timeline.data?.data?.events || []).slice(-6).reverse();
  const busy = route.isPending || assign.isPending;
  const vendorIsRejected = vendorPick && rejected.some((v) => v.vendorId === vendorPick.vendorId);
  const canSubmit = mode === 'vendor'
    ? Boolean(vendorPick) && reason.trim().length >= 3 && (!vendorIsRejected || override)
    : Boolean(engineerPick);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/50" role="dialog" aria-modal="true" aria-label={`Resolve ${job.jobCode}`}>
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col">
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Resolve unassigned job</p>
            <h2 className="text-lg font-bold text-gray-900 font-mono">{job.jobCode}</h2>
            <p className="text-xs text-gray-600">{job.service} · {job.city}{job.pincode ? ` ${job.pincode}` : ''} · {job.company || 'Company'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close"><FiX /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex gap-2">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            <span><b>Why it is here:</b> {job.reason}</span>
          </div>

          <div className="flex gap-2">
            {[['vendor', 'Route to a vendor', <FiBriefcase key="i" />], ['engineer', 'Assign a freelancer', <FiUserCheck key="i" />]].map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setMode(key); setReason(''); }}
                className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 ${mode === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {mode === 'vendor' && (
            <section className="space-y-2">
              <p className="text-xs text-gray-500">Vendors whose service coverage includes this job, ranked by location match, available skilled engineers, workload and SLA record.</p>
              {vendors.isLoading ? <p className="text-xs text-gray-400 py-6 text-center">Ranking vendors…</p> : vendors.isError ? (
                <p className="text-xs text-red-600">{errText(vendors.error, 'Could not rank vendors')}</p>
              ) : (
                <>
                  {ranked.length === 0 && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">{vendors.data?.reason || 'No vendor is eligible for this job.'}</p>
                  )}
                  <ul className="space-y-2">
                    {ranked.map((v) => (
                      <li key={v.vendorId}>
                        <button
                          type="button"
                          onClick={() => setVendorPick(v)}
                          className={`w-full text-left p-3 rounded-xl border ${vendorPick?.vendorId === v.vendorId ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-gray-900">{v.name}</span>
                            <span className="text-[11px] font-bold text-gray-500 tabular-nums">score {v.score}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1">
                            Covers by {v.locationMatch} · {v.availableEngineers}/{v.skilledEngineers} skilled engineers available · {v.activeJobs} active jobs · SLA {v.slaCompliance == null ? 'no history' : `${v.slaCompliance}%`}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {rejected.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setShowRejected((s) => !s)} className="text-xs font-bold text-gray-600 flex items-center gap-1">
                        {showRejected ? <FiChevronUp /> : <FiChevronDown />} {rejected.length} covering vendor(s) not eligible — why?
                      </button>
                      {showRejected && (
                        <ul className="mt-2 space-y-1.5">
                          {rejected.map((v) => (
                            <li key={v.vendorId}>
                              <button
                                type="button"
                                onClick={() => setVendorPick(v)}
                                className={`w-full text-left text-[11px] rounded-lg px-3 py-2 border ${vendorPick?.vendorId === v.vendorId ? 'border-red-400 bg-red-50' : 'border-transparent bg-gray-50'}`}
                              >
                                <b className="text-gray-800">{v.name}</b>: {v.reasons.join('; ')}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {vendorIsRejected && (
                    <label className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
                      <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5" />
                      <span>Override eligibility for this vendor. The override and your reason are written to the audit log.</span>
                    </label>
                  )}
                </>
              )}
            </section>
          )}

          {mode === 'engineer' && (
            <section className="space-y-2">
              <p className="text-xs text-gray-500">Independent (freelance) engineers with the skill who cover this location. Vendor engineers can only be assigned by their own vendor, so route the job to the vendor instead.</p>
              {engineers.isLoading ? <p className="text-xs text-gray-400 py-6 text-center">Checking engineers…</p> : engineers.isError ? (
                <p className="text-xs text-red-600">{errText(engineers.error, 'Could not load engineers')}</p>
              ) : (
                <>
                  {freelancers.length === 0 && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">No eligible freelancer for this job right now.</p>}
                  <ul className="space-y-2">
                    {freelancers.map((e) => (
                      <li key={e.engineerId}>
                        <button
                          type="button"
                          onClick={() => setEngineerPick(e)}
                          className={`w-full text-left p-3 rounded-xl border ${engineerPick?.engineerId === e.engineerId ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-gray-900">{e.name}</span>
                            <span className="text-[11px] font-bold text-gray-500 capitalize">{e.availability?.status || ''}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1">
                            {e.locationMatch?.basis === 'distance' ? `${e.locationMatch.distanceKm} km away` : 'Covers this city'} · {e.activeJobs}/{e.maxActiveJobs} active jobs
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {excluded.length > 0 && (
                    <details className="text-[11px] text-gray-600">
                      <summary className="cursor-pointer font-bold">{excluded.length} not eligible — why?</summary>
                      <ul className="mt-2 space-y-1">
                        {excluded.map((e) => <li key={e.engineerId} className="bg-gray-50 rounded px-2 py-1"><b>{e.name}</b>: {e.reasons.join('; ')}</li>)}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </section>
          )}

          <label className="block">
            <span className="block text-xs font-bold text-gray-700 mb-1">
              {mode === 'vendor' ? 'Reason for manual routing (required, audited)' : 'Notes for the engineer (optional)'}
            </span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder={mode === 'vendor' ? 'e.g. Vendor confirmed capacity by phone' : 'e.g. Customer prefers a morning visit'}
            />
          </label>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Recent history</h3>
            {timeline.isLoading ? <p className="text-xs text-gray-400">Loading…</p> : events.length === 0 ? <p className="text-xs text-gray-400">No history recorded.</p> : (
              <ol className="space-y-1.5">
                {events.map((ev) => (
                  <li key={ev.id} className="text-[11px] text-gray-700 flex gap-2">
                    <span className="text-gray-400 whitespace-nowrap">{when(ev.at)}</span>
                    <span><b>{ev.to || ev.event}</b>{ev.remark ? ` — ${ev.remark}` : ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => (mode === 'vendor' ? route.mutate() : assign.mutate())}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <FiRefreshCw className="animate-spin" /> : <FiCheckCircle />}
            {mode === 'vendor' ? 'Route to vendor' : 'Assign engineer'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Unassigned queue: jobs routing could not place (no covering vendor, no
 * skilled/available engineer, offers timed out). Every row states why.
 */
const UnassignedQueue = () => {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [expandKm, setExpandKm] = useState('');
  const [resolving, setResolving] = useState(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['routingUnassigned', page],
    queryFn: () => b2bAdminService.getUnassignedQueue({ page, limit: 25 }),
    refetchInterval: 30000,
    refetchOnWindowFocus: true
  });
  const rows = useMemo(() => data?.data || [], [data]);
  const pg = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const retry = useMutation({
    mutationFn: (ids) => b2bAdminService.retryRouting(ids, expandKm ? { expandRadiusKm: Number(expandKm) } : {}),
    onSuccess: (res) => {
      const failed = (res.data || []).filter((r) => !r.ok);
      if (failed.length) toast.error(`${res.message}. ${failed[0].message || ''}`.trim());
      else toast.success(res.message || 'Routing restarted');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['routingUnassigned'] });
    },
    onError: (err) => toast.error(errText(err, 'Retry failed'))
  });

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unassigned Jobs Queue</h1>
          <p className="text-sm text-gray-500">Jobs that automatic routing could not place. Retry routing (optionally with a wider radius), route to a vendor, or assign a freelancer.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-600 flex items-center gap-1.5">
            Expand radius to
            <input type="number" min="1" max="200" value={expandKm} onChange={(e) => setExpandKm(e.target.value)} placeholder="km" className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
          </label>
          <button
            type="button"
            disabled={!selected.size || retry.isPending}
            onClick={() => retry.mutate([...selected])}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
          >
            <FiRefreshCw className={retry.isPending ? 'animate-spin' : ''} /> Retry routing ({selected.size})
          </button>
          <button type="button" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-lg text-gray-600" aria-label="Refresh">
            <FiRefreshCw className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : isError ? (
        <div className="p-6 text-center bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-bold text-red-800">{errText(error, 'Could not load the queue')}</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-xs font-bold text-red-700 underline">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center bg-white border border-dashed border-gray-200 rounded-xl">
          <FiCheckCircle className="mx-auto text-3xl text-emerald-500 mb-2" />
          <p className="text-sm font-bold text-gray-900">Queue is empty</p>
          <p className="text-xs text-gray-500">Every job has been routed to a vendor or engineer.</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-3"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                  <th className="px-3 py-3">Job</th>
                  <th className="px-3 py-3">Service / location</th>
                  <th className="px-3 py-3">Why unassigned</th>
                  <th className="px-3 py-3">Waiting</th>
                  <th className="px-3 py-3">SLA due</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${r.jobCode}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-3 py-3">
                      <p className="font-mono font-bold text-gray-900">{r.jobCode}</p>
                      <p className="text-gray-500">{r.company || '—'} · {r.source}</p>
                      <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold capitalize ${PRIORITY_CLS[r.priority] || PRIORITY_CLS.low}`}>{r.priority || 'normal'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-gray-800">{r.service}</p>
                      <p className="text-gray-500 flex items-center gap-1"><FiMapPin /> {r.city}{r.pincode ? ` ${r.pincode}` : ''}</p>
                    </td>
                    <td className="px-3 py-3 max-w-sm text-gray-700">{r.reason}{r.retries ? <span className="block text-gray-400 mt-0.5">{r.retries} retr{r.retries === 1 ? 'y' : 'ies'}</span> : null}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600"><FiClock className="inline mr-1" />{age(r.since)}</td>
                    <td className={`px-3 py-3 whitespace-nowrap ${r.slaDueAt && new Date(r.slaDueAt) < new Date() ? 'text-red-700 font-bold' : 'text-gray-600'}`}>{when(r.slaDueAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{inr(r.amount)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => retry.mutate([r.id])} disabled={retry.isPending} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-[11px] font-bold mr-1.5 disabled:opacity-50">Retry</button>
                      <button type="button" onClick={() => setResolving(r)} className="px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[11px] font-bold">Resolve</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="lg:hidden space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.jobCode}`} />
                    <span>
                      <span className="block font-mono font-bold text-sm">{r.jobCode}</span>
                      <span className="block text-xs text-gray-500">{r.service} · {r.city} {r.pincode}</span>
                    </span>
                  </label>
                  <span className="text-xs tabular-nums font-bold">{inr(r.amount)}</span>
                </div>
                <p className="text-xs text-amber-900 bg-amber-50 rounded-lg px-2 py-1.5">{r.reason}</p>
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Waiting {age(r.since)} · SLA {when(r.slaDueAt)}</span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => retry.mutate([r.id])} className="px-2.5 py-1.5 border border-gray-200 rounded-lg font-bold">Retry</button>
                    <button type="button" onClick={() => setResolving(r)} className="px-2.5 py-1.5 bg-gray-900 text-white rounded-lg font-bold">Resolve</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {pg.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{pg.total} job(s)</span>
              <span className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40">Previous</button>
                <span className="px-2 py-1.5">Page {pg.page} of {pg.totalPages}</span>
                <button type="button" disabled={page >= pg.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40">Next</button>
              </span>
            </div>
          )}
        </>
      )}

      {resolving && (
        <ResolvePanel
          job={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            qc.invalidateQueries({ queryKey: ['routingUnassigned'] });
          }}
        />
      )}
    </div>
  );
};

export default UnassignedQueue;
