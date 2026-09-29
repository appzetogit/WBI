import React, { useState } from 'react';
import api from '../../../../services/api';
import { Page, Card, Table, Badge, Loading, Empty, ErrorBox, Button, Field } from './ui';
import { useApi, act, inputCls } from './helpers';

const TYPES = [['state', 'States'], ['service_area', 'Service areas'], ['pincode', 'Pincodes'], ['country', 'Countries']];

const Locations = () => {
  const [type, setType] = useState('service_area');
  const list = useApi('/admin/locations', { type });
  const cities = useApi('/admin/cities');
  const [form, setForm] = useState({ name: '', code: '', cityId: '', pincodes: '', serviceKeys: '' });
  const [pin, setPin] = useState('');
  const [svc, setSvc] = useState('');
  const [coverage, setCoverage] = useState(null);
  const cityList = cities.raw?.data || cities.raw?.cities || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const split = (s) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

  const create = async () => {
    const body = { type, name: form.name, code: form.code || undefined, cityId: form.cityId || undefined };
    if (type === 'service_area') { body.pincodes = split(form.pincodes); body.serviceKeys = split(form.serviceKeys.toUpperCase()); }
    if (type === 'pincode') body.code = form.code || form.name;
    if (await act(() => api.post('/admin/locations', body), 'Location added')) { setForm({ name: '', code: '', cityId: '', pincodes: '', serviceKeys: '' }); list.reload(); }
  };
  const lookup = async () => {
    try { setCoverage((await api.get('/admin/locations/coverage', { params: { pincode: pin, serviceKey: svc || undefined } })).data.data); }
    catch (e) { setCoverage({ error: e?.response?.data?.message || 'Lookup failed' }); }
  };

  return (
    <Page title="Locations & Coverage" subtitle="Countries, states, pincodes and service areas, plus who can serve a pincode."
      actions={<Button variant="ghost" onClick={async () => { if (await act(() => api.post('/admin/locations/seed-india'))) list.reload(); }}>Seed India states</Button>}>
      <Card title="Coverage lookup">
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="Pincode"><input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="452001" className={inputCls} /></Field>
          <Field label="Service code (optional)"><input value={svc} onChange={(e) => setSvc(e.target.value.toUpperCase())} placeholder="C12" className={inputCls} /></Field>
          <Button onClick={lookup} disabled={!/^\d{6}$/.test(pin)}>Check</Button>
        </div>
        {coverage && (coverage.error ? <p className="text-sm text-red-600 mt-3">{coverage.error}</p> : (
          <div className="grid sm:grid-cols-4 gap-3 mt-4 text-sm">
            <div><div className="text-[10px] uppercase font-bold text-gray-400">Service areas</div>{coverage.serviceAreas.map((a) => <div key={a.id}>{a.name} <span className="text-gray-400">({a.city})</span></div>)}{!coverage.serviceAreas.length && '—'}</div>
            <div><div className="text-[10px] uppercase font-bold text-gray-400">Vendor coverage</div>{coverage.vendors.map((v, i) => <div key={i}>{v.vendor} · {v.serviceKey} {v.byPincode && <Badge tone="green">pincode</Badge>}</div>)}{!coverage.vendors.length && <span className="text-red-600">No vendor covers this</span>}</div>
            <div><div className="text-[10px] uppercase font-bold text-gray-400">Engineers</div>{coverage.engineers.length} ({coverage.engineers.filter((e) => e.status === 'ONLINE').length} online)</div>
            <div><div className="text-[10px] uppercase font-bold text-gray-400">Workers</div>{coverage.workers}</div>
          </div>
        ))}
      </Card>
      <div className="flex gap-1.5">
        {TYPES.map(([k, l]) => <button key={k} type="button" onClick={() => setType(k)} className={`px-3 h-8 rounded-full text-xs font-bold border ${type === k ? 'bg-[#10AFA5] text-white border-[#10AFA5]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>)}
      </div>
      <Card title={`Add ${TYPES.find(([k]) => k === type)[1].replace(/s$/, '').toLowerCase()}`}>
        <div className="grid sm:grid-cols-5 gap-2 items-end">
          <Field label="Name"><input value={form.name} onChange={set('name')} className={inputCls} /></Field>
          {type !== 'service_area' && <Field label={type === 'pincode' ? 'Pincode' : 'Code'}><input value={form.code} onChange={set('code')} className={inputCls} /></Field>}
          {(type === 'service_area' || type === 'pincode') && (
            <Field label="City"><select value={form.cityId} onChange={set('cityId')} className={inputCls}><option value="">—</option>{cityList.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
          )}
          {type === 'service_area' && <>
            <Field label="Pincodes (comma separated)"><input value={form.pincodes} onChange={set('pincodes')} className={inputCls} /></Field>
            <Field label="Service codes (blank = all)"><input value={form.serviceKeys} onChange={set('serviceKeys')} className={inputCls} /></Field>
          </>}
          <Button onClick={create} disabled={!form.name && !form.code}>Add</Button>
        </div>
      </Card>
      <Card>
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.length ? <Empty /> : (
          <Table rows={list.data} columns={[
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code' },
            { key: 'parent', label: 'Parent / City', render: (r) => r.cityId?.name || r.parentId?.name || '—' },
            { key: 'pincodes', label: 'Pincodes', render: (r) => (r.pincodes || []).join(', ') || '—' },
            { key: 'serviceKeys', label: 'Services', render: (r) => (r.serviceKeys || []).join(', ') || (r.type === 'service_area' ? 'All' : '—') },
            { key: 'isActive', label: 'Active', render: (r) => (
              <button type="button" onClick={async () => { if (await act(() => api.put(`/admin/locations/${r._id}`, { isActive: !r.isActive }))) list.reload(); }}>
                <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'active' : 'off'}</Badge>
              </button>) },
            { key: 'del', label: '', render: (r) => <button type="button" className="text-xs text-red-600 font-bold" onClick={async () => { if (window.confirm(`Delete ${r.name}?`) && await act(() => api.delete(`/admin/locations/${r._id}`))) list.reload(); }}>Delete</button> }
          ]} />
        )}
      </Card>
    </Page>
  );
};

export default Locations;
