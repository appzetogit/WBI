import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState } from '../../components/ops/OpsUi';
import { getServiceKeys, resolveServiceName, errorMessage } from '../../services/vendorJobsService';

const copy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${text} copied`);
  } catch {
    toast.error('Copy failed');
  }
};

/** Service keys routing and bulk uploads use, with the names they accept. */
const ServiceKeys = () => {
  const [state, setState] = useState({ loading: true, error: '', data: [] });
  const [probe, setProbe] = useState({ service: '', subService: '' });
  const [check, setCheck] = useState({ busy: false, result: null });

  const load = useCallback(async () => {
    try {
      const res = await getServiceKeys();
      setState({ loading: false, error: '', data: res.data || [] });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load service keys') }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const runCheck = async (e) => {
    e.preventDefault();
    if (probe.service.trim().length < 2) return;
    setCheck({ busy: true, result: null });
    try {
      const res = await resolveServiceName({ service: probe.service.trim(), ...(probe.subService.trim() ? { subService: probe.subService.trim() } : {}) });
      setCheck({ busy: false, result: res.data });
    } catch (err) {
      setCheck({ busy: false, result: null });
      toast.error(errorMessage(err, 'Could not check'));
    }
  };
  const r = check.result;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Services"
        title="Service Keys"
        subtitle="Every job carries a service key. Clients' bulk uploads and routing map the service name they type to one of these keys using the names and aliases below."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />

      <form onSubmit={runCheck} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Check a service name</h2>
        <p className="text-xs text-gray-500">Type a service exactly as a client would write it, to see which key it becomes and whether it reaches you.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={probe.service} onChange={(e) => setProbe((p) => ({ ...p, service: e.target.value }))} placeholder="e.g. Air conditioner repair" aria-label="Service name" className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          <input value={probe.subService} onChange={(e) => setProbe((p) => ({ ...p, subService: e.target.value }))} placeholder="Sub-service (optional)" aria-label="Sub-service" className="sm:w-56 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          <button type="submit" disabled={check.busy || probe.service.trim().length < 2} className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
            {check.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Check
          </button>
        </div>
        {r && (
          <p className={`text-sm flex items-center gap-2 ${r.serviceKey && r.yours ? 'text-emerald-800' : 'text-red-700'}`}>
            {r.serviceKey && r.yours ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {r.serviceKey
              ? <span>“{r.input}” → <b className="font-mono">{r.serviceKey}</b> ({r.serviceName}){r.subServiceKey ? <> · sub-service <b className="font-mono">{r.subServiceKey}</b></> : ''}. {r.yours ? `You are ${r.yourStatus === 'active' ? 'approved' : r.yourStatus} for it.` : 'You are not approved for this service, so these jobs will not reach you.'}</span>
              : <span>“{r.input}” does not match any service in the WBI catalog — the upload row would be rejected.</span>}
          </p>
        )}
      </form>

      {state.loading ? <Skeleton rows={4} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.data.length ? (
        <EmptyState title="No services yet" message="Keys appear here for the services WBI approves for you." />
      ) : (
        <div className="space-y-3">
          {state.data.map((k) => (
            <article key={k.serviceKey} className="bg-white rounded-2xl border border-gray-200 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-3">
                <button type="button" onClick={() => copy(k.serviceKey)} className="font-mono text-base font-extrabold text-gray-900 flex items-center gap-1.5" title="Copy key">{k.serviceKey} <Copy className="w-3.5 h-3.5 text-gray-400" /></button>
                <p className="text-sm text-gray-700">{k.serviceName}</p>
                <p className={`text-[11px] font-bold mt-1 ${k.status === 'active' ? 'text-emerald-700' : k.status === 'suspended' ? 'text-red-700' : 'text-amber-700'}`}>{k.status === 'active' ? 'Approved' : k.status === 'suspended' ? 'Suspended' : 'Pending approval'}{!k.catalogActive ? ' · not active in catalog' : ''}</p>
              </div>
              <div className="lg:col-span-3 text-xs">
                <p className="font-bold text-gray-800 mb-1">Also matches</p>
                <div className="flex flex-wrap gap-1">
                  <span className="px-2 py-0.5 rounded bg-gray-100">{k.serviceName}</span>
                  {k.aliases.map((a) => <span key={a} className="px-2 py-0.5 rounded bg-gray-100">{a}</span>)}
                </div>
                {k.requiredSkills.length > 0 && <p className="mt-2 text-gray-600">Engineer skills: {k.requiredSkills.join(', ')}</p>}
              </div>
              <div className="lg:col-span-3 text-xs">
                <p className="font-bold text-gray-800 mb-1">Sub-service keys</p>
                {k.subServices.length ? (
                  <ul className="space-y-0.5">
                    {k.subServices.map((x) => <li key={x.key}><span className="font-mono font-bold">{x.key}</span> · {x.name}{!x.approved && <span className="text-amber-700"> (not approved for you)</span>}</li>)}
                  </ul>
                ) : <p className="text-gray-500">None</p>}
              </div>
              <div className="lg:col-span-3 text-xs">
                <p className="font-bold text-gray-800 mb-1">SLA by priority</p>
                {k.slaRules.length ? (
                  <ul className="space-y-0.5">
                    {k.slaRules.map((x) => <li key={x.key}><span className="font-mono">{x.key}</span> · {x.label}: {x.responseMinutes} min / {x.resolutionHours} h</li>)}
                  </ul>
                ) : <p className="text-gray-500">Default 24 h</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceKeys;
