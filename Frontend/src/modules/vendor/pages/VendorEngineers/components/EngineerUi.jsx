import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Modal } from '../../../components/ops/OpsUi';
import { updateEngineer, errorMessage } from '../../../services/vendorJobsService';
import { TEAM_STATUS, PENDING_ON, AVAILABILITY, DAYS, to24h } from '../engineerMeta';

export const TeamStatusBadge = ({ row }) => {
  const meta = TEAM_STATUS[row.status] || TEAM_STATUS.INACTIVE;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${meta.cls}`}>
      {row.status === 'PENDING' && row.pendingOn ? PENDING_ON[row.pendingOn] : meta.label}
    </span>
  );
};

export const AvailabilityBadge = ({ availability }) => {
  const meta = AVAILABILITY[availability?.status] || AVAILABILITY.unavailable;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${meta.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

const input = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none';
const Label = ({ children, hint }) => (
  <span className="block text-xs font-bold text-gray-700 mb-1">
    {children}{hint && <span className="font-normal text-gray-400"> — {hint}</span>}
  </span>
);

/**
 * Engineer profile form shared by Add Engineer and Edit. Services come from
 * the vendor's approved services so skills match routing's service names.
 */
export const EngineerForm = ({ id = 'engineer-form', initial = null, services = [], onSubmit }) => {
  const editing = Boolean(initial);
  const serviceNames = services.map((s) => s.serviceName);
  const initialSkills = initial?.skills || [];
  const [f, setF] = useState(() => ({
    name: initial?.name || '',
    phone: initial?.phone || '',
    email: '',
    services: serviceNames.filter((n) => initialSkills.some((s) => s.toLowerCase() === n.toLowerCase())),
    extraSkills: initialSkills.filter((s) => !serviceNames.some((n) => n.toLowerCase() === s.toLowerCase())).join(', '),
    city: initial?.coverage?.city || '',
    cities: (initial?.coverage?.cities || []).join(', '),
    serviceRadiusKm: initial?.coverage?.radiusKm ?? 10,
    workingDays: initial?.schedule?.workingDays || [],
    start: to24h(initial?.schedule?.workingHours?.start) || '09:00',
    end: to24h(initial?.schedule?.workingHours?.end) || '18:00',
    emergencyService: Boolean(initial?.schedule?.emergencyService),
    experienceYears: initial?.experienceYears ?? 0
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const skills = useMemo(() => {
    const extra = f.extraSkills.split(',').map((s) => s.trim()).filter(Boolean);
    const seen = new Set();
    return [...f.services, ...extra].filter((s) => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  }, [f.services, f.extraSkills]);

  const submit = (e) => {
    e.preventDefault();
    if (!editing && f.name.trim().length < 2) return toast.error('Enter the engineer\'s full name');
    if (!editing && !/^[6-9][0-9]{9}$/.test(f.phone)) return toast.error('Enter a valid 10-digit mobile number');
    if (!skills.length) return toast.error('Pick at least one service or add a skill');
    if (!f.city.trim()) return toast.error('Enter the base city');
    if (f.start && f.end && f.end <= f.start) return toast.error('Working hours must end after they start');
    const body = {
      skills,
      city: f.city.trim(),
      cities: f.cities.split(',').map((s) => s.trim()).filter(Boolean),
      serviceRadiusKm: Number(f.serviceRadiusKm) || 10,
      workingDays: f.workingDays,
      workingHours: { start: f.start, end: f.end },
      emergencyService: f.emergencyService,
      experienceYears: Number(f.experienceYears) || 0
    };
    if (!editing) Object.assign(body, { name: f.name.trim(), phone: f.phone, ...(f.email.trim() ? { email: f.email.trim() } : {}) });
    return onSubmit(body);
  };

  return (
    <form id={id} onSubmit={submit} className="space-y-5">
      {!editing && (
        <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><Label>Full name</Label><input required value={f.name} onChange={set('name')} className={input} autoComplete="name" /></label>
          <label className="block"><Label>Mobile</Label><input required inputMode="numeric" value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))} className={input} placeholder="10-digit mobile" /></label>
          <label className="block sm:col-span-2"><Label hint="optional">Email</Label><input type="email" value={f.email} onChange={set('email')} className={input} /></label>
        </fieldset>
      )}

      <fieldset>
        <Label hint="routing only offers jobs for services the engineer is skilled in">Services</Label>
        {services.length ? (
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => (
              <button type="button" key={s.serviceKey} onClick={() => toggle('services', s.serviceName)} aria-pressed={f.services.includes(s.serviceName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${f.services.includes(s.serviceName) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>
                {s.serviceName}
              </button>
            ))}
          </div>
        ) : <p className="text-xs text-gray-500">No approved services on your account yet.</p>}
        <input value={f.extraSkills} onChange={set('extraSkills')} placeholder="Other skills, comma separated (e.g. Refrigeration, VRF)" aria-label="Other skills" className={`${input} mt-2`} />
      </fieldset>

      <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block"><Label>Base city</Label><input value={f.city} onChange={set('city')} className={input} /></label>
        <label className="block"><Label hint="comma separated">Other cities</Label><input value={f.cities} onChange={set('cities')} placeholder="Dewas, Ujjain" className={input} /></label>
        <label className="block"><Label>Service radius (km)</Label><input type="number" min="1" max="200" value={f.serviceRadiusKm} onChange={set('serviceRadiusKm')} className={input} /></label>
      </fieldset>

      <fieldset>
        <Label hint="none selected = every day">Working days</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button type="button" key={d} onClick={() => toggle('workingDays', d)} aria-pressed={f.workingDays.includes(d)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${f.workingDays.includes(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <label className="block"><Label>Starts</Label><input type="time" value={f.start} onChange={set('start')} className={input} /></label>
        <label className="block"><Label>Ends</Label><input type="time" value={f.end} onChange={set('end')} className={input} /></label>
        <label className="block"><Label>Experience (years)</Label><input type="number" min="0" max="60" value={f.experienceYears} onChange={set('experienceYears')} className={input} /></label>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-700 pb-2.5">
          <input type="checkbox" checked={f.emergencyService} onChange={(e) => setF((x) => ({ ...x, emergencyService: e.target.checked }))} className="w-4 h-4" />
          Emergency call-outs (any day)
        </label>
      </fieldset>
    </form>
  );
};

/** Edit skills, coverage and schedule of an engineer (identity is locked). */
export const EngineerEditModal = ({ engineer, services, onClose, onSaved }) => {
  const [busy, setBusy] = useState(false);
  const save = async (body) => {
    setBusy(true);
    try {
      await updateEngineer(engineer.id, body);
      toast.success(`${engineer.name} updated`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save engineer'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Edit ${engineer.name}`}
      subtitle="Services, coverage and working schedule. Routing uses these immediately."
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button type="submit" form="engineer-edit-form" disabled={busy} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save changes
          </button>
        </>
      )}
    >
      <EngineerForm id="engineer-edit-form" initial={engineer} services={services} onSubmit={save} />
    </Modal>
  );
};
