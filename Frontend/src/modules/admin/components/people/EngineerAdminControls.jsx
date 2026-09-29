import React, { useState } from 'react';
import api from '../../../../services/api';
import { Button, Field } from '../../pages/ControlCenter/ui';
import { useApi, act, inputCls } from '../../pages/ControlCenter/helpers';

/**
 * Admin controls on an engineer or worker (spec §5): assign / remove vendor
 * (engineers), service location, availability, force offline, extra skills.
 */
const EngineerAdminControls = ({ kind = 'engineers', person, onSaved }) => {
  const isEngineer = kind === 'engineers';
  const vendors = useApi('/admin/vendors', { approvalStatus: 'approved', limit: 200 });
  const vendorList = vendors.raw?.data?.vendors || vendors.raw?.vendors || vendors.raw?.data || [];
  const [f, setF] = useState({
    vendorId: person?.vendorId?._id || person?.vendorId || '',
    city: person?.address?.city || '', pincode: person?.address?.pincode || '',
    lat: '', lng: '', availability: person?.availability || 'Full Time', skills: ''
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (extra = {}) => {
    const body = { city: f.city, pincode: f.pincode || undefined, availability: f.availability, ...extra };
    if (isEngineer) body.vendorId = f.vendorId || null;
    if (f.lat && f.lng) { body.lat = Number(f.lat); body.lng = Number(f.lng); }
    if (isEngineer && f.skills.trim()) body.secondarySkills = f.skills.split(',').map((s) => s.trim()).filter(Boolean);
    if (await act(() => api.patch(`/admin/${kind}/${person.id || person._id}/admin-controls`, body), 'Saved')) onSaved?.();
  };
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
      <div className="text-sm font-bold text-gray-800">Admin controls</div>
      <div className="grid sm:grid-cols-3 gap-3">
        {isEngineer && (
          <Field label="Vendor (company engineer)">
            <select value={f.vendorId} onChange={set('vendorId')} className={inputCls}>
              <option value="">Freelancer (no vendor)</option>
              {vendorList.map((v) => <option key={v._id || v.id} value={v._id || v.id}>{v.businessName || v.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="City"><input value={f.city} onChange={set('city')} className={inputCls} /></Field>
        <Field label="Pincode"><input value={f.pincode} onChange={set('pincode')} className={inputCls} /></Field>
        <Field label="Latitude"><input value={f.lat} onChange={set('lat')} placeholder="22.72" className={inputCls} /></Field>
        <Field label="Longitude"><input value={f.lng} onChange={set('lng')} placeholder="75.86" className={inputCls} /></Field>
        <Field label="Availability">
          <select value={f.availability} onChange={set('availability')} className={inputCls}>
            {['Full Time', 'Part Time', 'Weekends', 'Emergency Support'].map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        {isEngineer && <Field label="Add skills (comma separated)"><input value={f.skills} onChange={set('skills')} className={inputCls} /></Field>}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => save()}>Save controls</Button>
        <Button variant="ghost" onClick={() => save({ forceOffline: true })}>Force offline</Button>
      </div>
    </div>
  );
};

export default EngineerAdminControls;
