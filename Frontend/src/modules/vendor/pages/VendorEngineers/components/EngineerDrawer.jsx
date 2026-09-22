import React, { useCallback, useEffect, useState } from 'react';
import { X, Phone, Mail, MapPin, CalendarClock, Wrench, ShieldCheck, Briefcase, BarChart3, History, Plane } from 'lucide-react';
import { Skeleton, ErrorState, StatusBadge } from '../../../components/ops/OpsUi';
import { formatDateTime, formatDate } from '../../../components/ops/opsFormat';
import { getEngineer, errorMessage } from '../../../services/vendorJobsService';
import { TeamStatusBadge, AvailabilityBadge, EngineerEditModal } from './EngineerUi';
import TeamActions from './TeamActions';
import { minutesLabel, pctLabel } from '../engineerMeta';

const Section = ({ icon, title, children }) => {
  const Icon = icon;
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-3"><Icon className="w-3.5 h-3.5" /> {title}</h4>
      {children}
    </section>
  );
};
const Stat = ({ label, value }) => (
  <div className="bg-gray-50 rounded-lg px-3 py-2">
    <p className="text-[10px] text-gray-500">{label}</p>
    <p className="text-sm font-extrabold text-gray-900 tabular-nums">{value ?? '—'}</p>
  </div>
);
const WBI_LABEL = { approved: 'Verified', pending: 'Pending verification', rejected: 'Rejected', suspended: 'Suspended' };
const VENDOR_LABEL = { approved: 'Approved by you', pending_approval: 'Waiting for your approval', rejected: 'Declined', not_required: 'Added by you' };

/** Full profile of one engineer, every value from GET /vendors/:id/engineers/:engineerId. */
const EngineerDrawer = ({ engineerId, services, onClose, onChanged }) => {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getEngineer(engineerId);
      setState({ loading: false, error: '', data: res.data });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err, 'Could not load engineer'), data: null });
    }
  }, [engineerId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const changed = () => { load(); onChanged?.(); };
  const d = state.data;
  const p = d?.performance;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Engineer details" onClick={onClose}>
      <aside className="w-full sm:max-w-xl h-full bg-gray-50 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 bg-gray-900 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center font-bold overflow-hidden shrink-0">
              {d?.photo ? <img src={d.photo} alt="" className="w-full h-full object-cover" /> : (d?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold truncate">{d?.name || 'Engineer'}</h3>
              {d && <div className="flex flex-wrap gap-1.5 mt-1"><TeamStatusBadge row={d} /><AvailabilityBadge availability={d.availability} /></div>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></button>
        </header>

        {d && (
          <div className="px-5 py-3 bg-white border-b border-gray-200 shrink-0 space-y-2">
            {d.statusReason && <p className={`text-xs font-semibold ${d.status === 'INACTIVE' ? 'text-red-700' : 'text-amber-800'}`}>{d.statusReason}</p>}
            <TeamActions row={d} onChanged={changed} onEdit={() => setEditing(true)} size="lg" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {state.loading ? <Skeleton rows={8} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : d && (
            <>
              <Section icon={Phone} title="Contact">
                <div className="space-y-1.5 text-sm">
                  <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400" /> <a href={`tel:${d.phone}`} className="font-semibold text-gray-900">{d.phone}</a></p>
                  {d.email && <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400" /> {d.email}</p>}
                  <p className="text-xs text-gray-500">In your team since {formatDate(d.joinedAt)} · {d.verification.joinedVia === 'invite' ? 'joined with your invite link' : 'added by you'}</p>
                </div>
              </Section>

              <Section icon={ShieldCheck} title="Verification">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="WBI documents" value={WBI_LABEL[d.verification.wbi] || d.verification.wbi} />
                  <Stat label="Your approval" value={VENDOR_LABEL[d.verification.vendor] || d.verification.vendor} />
                </div>
              </Section>

              <Section icon={CalendarClock} title="Availability & schedule">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Stat label="Right now" value={<AvailabilityBadge availability={d.availability} />} />
                  <Stat label="App status" value={d.availability.online ? 'Online' : 'Offline'} />
                  <Stat label="Workload" value={`${d.availability.activeJobs} / ${d.availability.maxActiveJobs} jobs`} />
                  <Stat label="Working days" value={d.schedule.workingDays.length ? d.schedule.workingDays.map((x) => x.slice(0, 3)).join(' ') : 'Every day'} />
                  <Stat label="Hours" value={d.workingHours ? `${d.workingHours.start} – ${d.workingHours.end}` : '—'} />
                  <Stat label="Emergency call-outs" value={d.schedule.emergencyService ? 'Yes' : 'No'} />
                </div>
                {d.availability.onLeave && <p className="mt-2 text-xs text-rose-700 font-semibold">On leave until {formatDate(d.availability.leaveUntil)}</p>}
              </Section>

              <Section icon={Wrench} title="Skills & coverage">
                <div className="flex flex-wrap gap-1.5">
                  {d.skills.length ? d.skills.map((s) => <span key={s} className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold">{s}</span>) : <span className="text-xs text-gray-500">No skills recorded</span>}
                </div>
                <p className="mt-2 text-xs text-gray-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {[d.coverage.city, ...d.coverage.cities].filter(Boolean).join(', ') || '—'}{d.coverage.radiusKm ? ` · within ${d.coverage.radiusKm} km` : ''}</p>
                <p className="text-xs text-gray-500 mt-1">{d.experienceYears} year(s) experience</p>
              </Section>

              <Section icon={Briefcase} title={`Current jobs (${d.currentJobs.length})`}>
                {d.currentJobs.length ? (
                  <ul className="space-y-2">
                    {d.currentJobs.map((j) => (
                      <li key={j.id} className="flex items-center justify-between gap-2 text-xs">
                        <span><b className="font-mono">{j.jobCode}</b> · {j.service} · {j.city}</span>
                        <StatusBadge status={j.status} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-gray-500">Not on any of your jobs right now.</p>}
              </Section>

              <Section icon={BarChart3} title="Performance · last 90 days">
                {p ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="Assigned" value={p.assigned} />
                    <Stat label="Completed" value={p.completed} />
                    <Stat label="Acceptance" value={pctLabel(p.acceptanceRate)} />
                    <Stat label="SLA met" value={pctLabel(p.slaCompliance)} />
                    <Stat label="Avg response" value={minutesLabel(p.avgResponseMinutes)} />
                    <Stat label="Avg on-site work" value={minutesLabel(p.avgWorkMinutes)} />
                    <Stat label="Rework requests" value={p.revisions} />
                    <Stat label="Rating" value={d.rating ?? 'Not rated'} />
                  </div>
                ) : <p className="text-xs text-gray-500">No work in this period.</p>}
              </Section>

              <Section icon={History} title="Assignment history">
                {d.assignments.length ? (
                  <ul className="divide-y divide-gray-100">
                    {d.assignments.map((a) => (
                      <li key={a.id} className="py-2 text-xs flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p><b className="font-mono">{a.jobCode}</b> · <span className="capitalize">{a.status}</span>{a.open ? ' (current)' : ''}</p>
                          {a.note && <p className="text-gray-500 truncate">{a.note}</p>}
                        </div>
                        <span className="text-gray-400 whitespace-nowrap">{formatDateTime(a.assignedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-gray-500">No assignments yet.</p>}
              </Section>

              {d.leaves.length > 0 && (
                <Section icon={Plane} title="Leave">
                  <ul className="space-y-1 text-xs">
                    {d.leaves.map((l, i) => <li key={i}><span className="capitalize font-semibold">{l.type}</span> · {formatDate(l.from)} – {formatDate(l.to)} · <span className="capitalize">{l.status.replace('_', ' ')}</span></li>)}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </aside>
      {editing && d && (
        <div onClick={(e) => e.stopPropagation()}>
          <EngineerEditModal engineer={d} services={services} onClose={() => setEditing(false)} onSaved={changed} />
        </div>
      )}
    </div>
  );
};

export default EngineerDrawer;
