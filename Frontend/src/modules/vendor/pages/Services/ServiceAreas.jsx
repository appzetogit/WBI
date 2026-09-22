import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Hash, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, StatCard, ConfirmDialog } from '../../components/ops/OpsUi';
import { getServiceAreas, updateServiceAreas, errorMessage } from '../../services/vendorJobsService';

const splitList = (text) => [...new Set(String(text || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Every city and pincode you cover, across services — add or remove areas in one step. */
const ServiceAreas = () => {
  const [state, setState] = useState({ loading: true, error: '', data: [], services: [], summary: {} });
  const [form, setForm] = useState({ cities: '', pincodes: '', serviceKeys: [] });
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [type, setType] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await getServiceAreas();
      setState({ loading: false, error: '', data: res.data || [], services: res.services || [], summary: res.summary || {} });
      setForm((f) => (f.serviceKeys.length ? f : { ...f, serviceKeys: (res.services || []).map((s) => s.serviceKey) }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load service areas') }));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const pins = splitList(form.pincodes);
  const badPins = pins.filter((p) => !/^[1-9][0-9]{5}$/.test(p));
  const cities = splitList(form.cities);

  const add = async (e) => {
    e.preventDefault();
    if ((!cities.length && !pins.length) || badPins.length || !form.serviceKeys.length) return;
    setBusy(true);
    try {
      await updateServiceAreas({ action: 'add', cities, pincodes: pins, serviceKeys: form.serviceKeys });
      toast.success(`${cities.length + pins.length} area(s) added — routing uses them immediately`);
      setForm((f) => ({ ...f, cities: '', pincodes: '' }));
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add areas'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const a = removing;
    try {
      await updateServiceAreas({
        action: 'remove',
        ...(a.type === 'city' ? { cities: [a.value] } : { pincodes: [a.value] }),
        serviceKeys: a.services.map((s) => s.serviceKey)
      });
      toast.success(`${a.type === 'city' ? title(a.value) : a.value} removed`);
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove the area'));
    }
  };

  const rows = type === 'all' ? state.data : state.data.filter((a) => a.type === type);
  const s = state.summary;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Services"
        title="Service Areas"
        subtitle="Cities and pincodes where routing can send you jobs, with the engineers who work there and your recent jobs."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />

      {state.loading ? <Skeleton rows={5} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Cities" value={s.cities} />
            <StatCard label="Pincodes" value={s.pincodes} />
            <StatCard label="Cities without an engineer" value={s.withoutEngineers} tone={s.withoutEngineers ? 'amber' : 'gray'} />
          </div>

          <form onSubmit={add} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add areas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Cities</span>
                <textarea rows={2} value={form.cities} onChange={(e) => setForm((f) => ({ ...f, cities: e.target.value }))} placeholder="Dewas, Ujjain" className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Pincodes</span>
                <textarea rows={2} value={form.pincodes} onChange={(e) => setForm((f) => ({ ...f, pincodes: e.target.value }))} placeholder="455001, 456001" className="mt-1 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                {badPins.length > 0 && <span className="text-[11px] text-red-600">Invalid pincode(s): {badPins.slice(0, 5).join(', ')}</span>}
              </label>
            </div>
            <fieldset>
              <legend className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1">For services</legend>
              <div className="flex flex-wrap gap-1.5">
                {state.services.map((sv) => {
                  const on = form.serviceKeys.includes(sv.serviceKey);
                  return (
                    <button key={sv.serviceKey} type="button" aria-pressed={on} onClick={() => setForm((f) => ({ ...f, serviceKeys: on ? f.serviceKeys.filter((k) => k !== sv.serviceKey) : [...f.serviceKeys, sv.serviceKey] }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>
                      {sv.serviceName}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex justify-end">
              <button type="submit" disabled={busy || badPins.length > 0 || (!cities.length && !pins.length) || !form.serviceKeys.length} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add {cities.length + pins.length || ''} area(s)
              </button>
            </div>
          </form>

          <div className="flex gap-1.5">
            {[['all', 'All'], ['city', 'Cities'], ['pincode', 'Pincodes']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setType(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${type === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
          </div>

          {!rows.length ? <EmptyState title="No service areas yet" message="Add the cities or pincodes you work in so routing can send you jobs." /> : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                  <tr><th className="px-4 py-3">Area</th><th className="px-3 py-3">Services</th><th className="px-3 py-3">Engineers</th><th className="px-3 py-3 text-right">Your jobs (30 days)</th><th className="px-3 py-3" /></tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={`${a.type}:${a.value}`} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-gray-900 flex items-center gap-1.5">{a.type === 'city' ? <MapPin className="w-3.5 h-3.5 text-gray-400" /> : <Hash className="w-3.5 h-3.5 text-gray-400" />}{a.type === 'city' ? title(a.value) : a.value}</p>
                        {a.warning && <p className="text-amber-700 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {a.warning}</p>}
                      </td>
                      <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{a.services.map((sv) => <span key={sv.serviceKey} className={`px-2 py-0.5 rounded ${sv.active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500 line-through'}`}>{sv.serviceName}</span>)}</div></td>
                      <td className="px-3 py-2.5">{a.engineers === null ? <span className="text-gray-400">By pincode</span> : a.engineers ? <span title={a.engineerNames.join(', ')}>{a.engineers} · {a.engineerNames.slice(0, 2).join(', ')}{a.engineers > 2 ? '…' : ''}</span> : <span className="text-amber-700">None</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{a.jobs30d}</td>
                      <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setRemoving(a)} className="p-1.5 border border-gray-200 rounded-lg text-red-600" aria-label={`Remove ${a.value}`}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.type === 'city' ? title(removing.value) : removing.value}?`}
          message={`You stop receiving new ${removing.services.map((x) => x.serviceName).join(', ')} jobs here. Jobs you already hold are not affected.`}
          confirmLabel="Remove area"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
};

export default ServiceAreas;
