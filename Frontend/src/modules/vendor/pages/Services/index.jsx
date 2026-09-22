import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Hash, Loader2, Save, AlertTriangle } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState } from '../../components/ops/OpsUi';
import { formatDateTime } from '../../components/ops/opsFormat';
import { getCoverage, saveCoverage, errorMessage } from '../../services/vendorJobsService';

const splitList = (text) => [...new Set(String(text || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];

const CoverageCard = ({ service, coverage, onSaved }) => {
  const [cities, setCities] = useState((coverage?.coverageCities || []).join(', '));
  const [pins, setPins] = useState((coverage?.coveragePincodes || []).join(', '));
  const [active, setActive] = useState(coverage ? coverage.active : true);
  const [busy, setBusy] = useState(false);
  const badPins = splitList(pins).filter((p) => !/^[1-9][0-9]{5}$/.test(p));
  const suspended = service.approvalStatus === 'suspended';

  const save = async () => {
    setBusy(true);
    try {
      await saveCoverage(service.serviceKey, { coverageCities: splitList(cities), coveragePincodes: splitList(pins), active });
      toast.success(`${service.serviceName} coverage saved`);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save coverage'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900">{service.serviceName}</h3>
          <p className="text-xs font-mono text-gray-500">Service key: {service.serviceKey}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={suspended} className="w-4 h-4" />
          {active ? 'Active' : 'Inactive'}
        </label>
      </div>
      {suspended && (
        <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> WBI has suspended this service for your account.</p>
      )}
      {!coverage && !suspended && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">No coverage yet — you will not receive jobs for this service until you add cities or pincodes.</p>
      )}
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Cities</span>
        <textarea rows={2} value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Indore, Dewas" className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Pincodes</span>
        <textarea rows={2} value={pins} onChange={(e) => setPins(e.target.value)} placeholder="452001, 452010" className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" />
        {badPins.length > 0 && <span className="text-[11px] text-red-600">Invalid pincode(s): {badPins.slice(0, 5).join(', ')}</span>}
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">{coverage ? `Last updated ${formatDateTime(coverage.updatedAt)}` : ''}</span>
        <button type="button" onClick={save} disabled={busy || badPins.length > 0 || suspended} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save coverage
        </button>
      </div>
    </div>
  );
};

const Services = () => {
  const [state, setState] = useState({ loading: true, error: '', services: [], coverage: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await getCoverage();
      setState({ loading: false, error: '', services: res.data?.services || [], coverage: res.data?.coverage || [] });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err), services: [], coverage: [] });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const byKey = new Map(state.coverage.map((c) => [c.serviceKey, c]));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Services"
        title="Service Coverage"
        subtitle="Per service, the cities and pincodes where routing may send you jobs. Switch a service off to pause new jobs for it. To add one area to several services at once, use Service Areas."
        actions={<RefreshButton onClick={load} spinning={state.loading && state.services.length > 0} />}
      />
      {state.loading && !state.services.length ? <Skeleton rows={4} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.services.length ? (
        <EmptyState title="No approved services" message="Once WBI approves a service for your account, set its coverage here." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.services.map((s) => (
            <CoverageCard key={`${s.serviceKey}-${byKey.get(s.serviceKey)?.updatedAt || 'new'}`} service={s} coverage={byKey.get(s.serviceKey)} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Services;
