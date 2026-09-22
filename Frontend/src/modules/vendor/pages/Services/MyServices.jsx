import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Ban, LifeBuoy } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, StatCard } from '../../components/ops/OpsUi';
import { formatDate } from '../../components/ops/opsFormat';
import { getMyServices, errorMessage } from '../../services/vendorJobsService';
import useVendorBasePath from '../../hooks/useVendorBasePath';

const STATUS = {
  active: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pending WBI approval', cls: 'bg-amber-50 text-amber-800' },
  suspended: { label: 'Suspended by WBI', cls: 'bg-red-50 text-red-700' }
};
const READY = {
  ready: { label: 'Receiving jobs', icon: CheckCircle2, cls: 'text-emerald-700' },
  incomplete: { label: 'Not receiving jobs yet', icon: AlertTriangle, cls: 'text-amber-700' },
  blocked: { label: 'Blocked', icon: Ban, cls: 'text-red-700' }
};

/** Services WBI approved you for, and whether routing can send you work for each. */
const MyServices = () => {
  const { basePath } = useVendorBasePath();
  const [state, setState] = useState({ loading: true, error: '', data: [], summary: {} });

  const load = useCallback(async () => {
    try {
      const res = await getMyServices();
      setState({ loading: false, error: '', data: res.data || [], summary: res.summary || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load services') }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const fixLink = (issue) => {
    if (/service area/i.test(issue)) return <Link to={`${basePath}/services/coverage`} className="underline font-bold">Set coverage</Link>;
    if (/engineer/i.test(issue)) return <Link to={`${basePath}/engineers/skills`} className="underline font-bold">Engineer skills</Link>;
    return null;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Services"
        title="My Services"
        subtitle="Routing sends you a job only for an approved service, in an area you cover, when you have a skilled engineer. Each service below shows what is missing."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />

      {state.loading ? <Skeleton rows={5} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.data.length ? (
        <EmptyState title="No services yet" message="WBI adds services to your account when it approves them. Raise a support ticket to apply for one." action={<Link to={`${basePath}/support`} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold">Contact support</Link>} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Services" value={state.summary.services} />
            <StatCard label="Receiving jobs" value={state.summary.ready} tone="green" />
            <StatCard label="Not ready" value={state.summary.incomplete} tone={state.summary.incomplete ? 'amber' : 'gray'} />
            <StatCard label="Blocked" value={state.summary.blocked} tone={state.summary.blocked ? 'red' : 'gray'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {state.data.map((s) => {
              const r = READY[s.readiness] || READY.incomplete;
              const Icon = r.icon;
              return (
                <article key={s.serviceKey} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-gray-900">{s.serviceName}</h2>
                      <p className="text-[11px] font-mono text-gray-500">{s.serviceKey}{s.approvedAt ? ` · approved ${formatDate(s.approvedAt)}` : ''}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${STATUS[s.status]?.cls || ''}`}>{STATUS[s.status]?.label || s.status}</span>
                  </div>
                  <p className={`text-xs font-bold flex items-center gap-1.5 ${r.cls}`}><Icon className="w-4 h-4" /> {r.label}</p>
                  {s.issues.length > 0 && (
                    <ul className="text-xs space-y-1">
                      {s.issues.map((i) => <li key={i} className="text-gray-700 flex flex-wrap gap-x-2">• {i} {fixLink(i)}</li>)}
                    </ul>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                    {[['New requests', s.jobs.newRequests], ['Need engineer', s.jobs.waitingForEngineer], ['Active', s.jobs.active], ['Done (30d)', s.jobs.completed30d], ['SLA met (30d)', s.jobs.slaCompliance30d === null ? '—' : `${s.jobs.slaCompliance30d}%`]].map(([l, v]) => (
                      <div key={l} className="bg-gray-50 rounded-lg py-1.5"><p className="text-sm font-extrabold tabular-nums">{v}</p><p className="text-[10px] text-gray-500">{l}</p></div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-gray-100 p-2.5">
                      <p className="font-bold text-gray-800">Engineers</p>
                      <p className="text-gray-600">{s.engineers.active} active · {s.engineers.available} free now{s.engineers.pending ? ` · ${s.engineers.pending} pending` : ''}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-2.5">
                      <p className="font-bold text-gray-800">Coverage {s.coverage.active ? '' : <span className="text-amber-700">(off)</span>}</p>
                      <p className="text-gray-600 truncate">{s.coverage.areas ? `${s.coverage.cities.length} cities · ${s.coverage.pincodes.length} pincodes` : 'None'}</p>
                    </div>
                  </div>
                  {s.slaRules.length > 0 && (
                    <div className="text-xs">
                      <p className="font-bold text-gray-800 mb-1">SLA</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.slaRules.map((x) => <span key={x.key} className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">{x.label}: respond {x.responseMinutes} min · resolve {x.resolutionHours} h</span>)}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><LifeBuoy className="w-3.5 h-3.5" /> Services are added and approved by WBI. <Link to={`${basePath}/support`} className="underline font-bold">Raise a support ticket</Link> to apply for another service.</p>
        </>
      )}
    </div>
  );
};

export default MyServices;
