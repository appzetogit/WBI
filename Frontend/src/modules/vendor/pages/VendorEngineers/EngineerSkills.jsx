import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Pencil, Lightbulb } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, ErrorState, EmptyState, StatCard } from '../../components/ops/OpsUi';
import { getEngineerSkills, errorMessage } from '../../services/vendorJobsService';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import { TeamStatusBadge, AvailabilityBadge } from './components/EngineerUi';
import EngineerDrawer from './components/EngineerDrawer';
import useTeamServices from './useTeamServices';
import { SKILL_GAP } from './engineerMeta';

/** Skills matrix: every figure computed by the routing matcher on the server. */
const EngineerSkills = () => {
  const { basePath } = useVendorBasePath();
  const services = useTeamServices();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getEngineerSkills();
      setState({ loading: false, error: '', data: res.data });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err, 'Could not load skills'), data: null });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const d = state.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Engineers"
        title="Engineer Skills"
        subtitle="Which of your engineers can do each service you offer, using the same skill match routing uses to send you jobs."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Services you offer" value={d.summary.services} />
            <StatCard label="Services with a gap" value={d.summary.servicesWithGaps} tone={d.summary.servicesWithGaps ? 'red' : 'green'} />
            <StatCard label="Engineers matching no service" value={d.summary.engineersWithoutMatch} tone={d.summary.engineersWithoutMatch ? 'amber' : 'gray'} />
          </div>

          <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-bold text-gray-900 border-b border-gray-100">Services</h2>
            {!d.services.length ? (
              <p className="p-6 text-sm text-gray-500">No approved services on your account yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {d.services.map((s) => (
                  <li key={s.serviceKey} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-3">
                      <p className="text-sm font-bold text-gray-900">{s.serviceName}</p>
                      <p className="text-[11px] font-mono text-gray-500">{s.serviceKey}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{s.covered ? `${s.coverageAreas} service area(s)` : 'No service area'}</p>
                    </div>
                    <div className="lg:col-span-3 grid grid-cols-4 gap-1.5 text-center">
                      {[['Active', s.engineers.active], ['Free now', s.engineers.available], ['Pending', s.engineers.pending], ['Inactive', s.engineers.inactive]].map(([l, n]) => (
                        <div key={l} className="bg-gray-50 rounded-lg py-1.5"><p className="text-sm font-extrabold tabular-nums">{n}</p><p className="text-[10px] text-gray-500">{l}</p></div>
                      ))}
                    </div>
                    <div className="lg:col-span-6 space-y-2">
                      {s.gap ? (
                        <p className="text-xs text-red-700 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{SKILL_GAP[s.gap]}{' '}
                            {['no_coverage', 'no_engineer_no_coverage'].includes(s.gap) && <Link to={`${basePath}/services`} className="underline font-bold">Set service area</Link>}
                            {['no_active_engineer', 'no_engineer_no_coverage'].includes(s.gap) && <> <Link to={`${basePath}/engineers/add`} className="underline font-bold">Add an engineer</Link></>}
                          </span>
                        </p>
                      ) : <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Ready for routing</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {s.activeEngineers.map((e) => (
                          <button key={e.id} type="button" onClick={() => setOpenId(e.id)} className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-1.5">
                            {e.name} <AvailabilityBadge availability={{ status: e.availability }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.unmatchedSkills.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-amber-900 flex items-center gap-1.5"><Lightbulb className="w-4 h-4" /> Skills you do not offer yet</h2>
              <p className="text-xs text-amber-900/80 mt-1">These engineers match none of your services, so routing never sends them work. Apply for the service with WBI, or update their skills.</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {d.unmatchedSkills.map((u) => <li key={u.skill}><b>{u.skill}</b>: {u.engineers.map((e) => e.name).join(', ')}</li>)}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <h2 className="px-4 py-3 text-sm font-bold text-gray-900 border-b border-gray-100">Engineers</h2>
            {!d.engineers.length ? <EmptyState title="No engineers yet" message="Add engineers to see their skills here." /> : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                  <tr><th className="px-4 py-2.5">Engineer</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Skills</th><th className="px-3 py-2.5">Matches your services</th><th className="px-3 py-2.5 text-right">Experience</th><th className="px-3 py-2.5" /></tr>
                </thead>
                <tbody>
                  {d.engineers.map((e) => (
                    <tr key={e.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-2.5"><button type="button" onClick={() => setOpenId(e.id)} className="font-bold text-gray-900 hover:underline">{e.name}</button></td>
                      <td className="px-3 py-2.5"><TeamStatusBadge row={e} /></td>
                      <td className="px-3 py-2.5 text-gray-700">{e.skills.join(', ') || '—'}</td>
                      <td className="px-3 py-2.5">{e.matchesServices.length ? e.matchesServices.join(', ') : <span className="text-amber-700 font-semibold">None</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.experienceYears} y</td>
                      <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setOpenId(e.id)} className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {openId && <EngineerDrawer engineerId={openId} services={services} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

export default EngineerSkills;
