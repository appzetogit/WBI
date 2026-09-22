import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  X, User, Building2, MapPin, CalendarClock, Timer, Wrench, UserCheck, Package, Image as ImageIcon,
  History, Wallet, ShieldCheck, CheckCircle2, Circle, Phone, Download
} from 'lucide-react';
import { StatusBadge, SlaBadge, PriorityBadge, SourceBadge, Skeleton, ErrorState, ConfirmDialog } from '../../../components/ops/OpsUi';
import { formatDateTime, formatINR } from '../../../components/ops/opsFormat';
import { getJob, acceptJob, declineJob, releaseJob, transitionJob, errorMessage } from '../../../services/vendorJobsService';
import AssignEngineerDialog from './AssignEngineerDialog';

/** Resume returns a held job to where it was paused. */
const RESUME_LABEL = { EN_ROUTE: 'back to en route', ARRIVED: 'back on site', IN_PROGRESS: 'continue work' };

const Section = ({ icon: Icon, title, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 p-4">
    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-3">
      {Icon && <Icon className="w-3.5 h-3.5" />} {title}
    </h4>
    {children}
  </section>
);

const Field = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[11px] text-gray-500">{label}</p>
    <p className="text-sm font-semibold text-gray-900 break-words">{value ?? '—'}</p>
  </div>
);

/** Visual lifecycle — every timestamp comes from the backend timeline. */
const VisualTimeline = ({ timeline }) => (
  <ol className="relative">
    {timeline.milestones.map((m, i) => {
      const last = i === timeline.milestones.length - 1;
      return (
        <li key={m.key} className="flex gap-3 pb-3 last:pb-0">
          <div className="flex flex-col items-center">
            {m.reached ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <Circle className={`w-5 h-5 shrink-0 ${m.skipped ? 'text-gray-200' : 'text-gray-300'}`} />}
            {!last && <span className={`w-0.5 flex-1 mt-1 ${m.reached ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
          </div>
          <div className="min-w-0 -mt-0.5">
            <p className={`text-sm font-bold ${m.reached ? 'text-gray-900' : 'text-gray-400'}`}>
              {m.label}
              {m.skipped && <span className="ml-2 text-[10px] font-medium text-gray-400">not applicable</span>}
              {m.implied && <span className="ml-2 text-[10px] font-medium text-amber-700">recorded with next step</span>}
            </p>
            {m.reached && (
              <p className="text-[11px] text-gray-500">
                {formatDateTime(m.at)}{m.actorRole ? ` · by ${m.actorRole}` : ''}
              </p>
            )}
          </div>
        </li>
      );
    })}
  </ol>
);

const JobDetailDrawer = ({ jobId, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getJob(jobId);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load job'));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };
  const act = async (fn, success) => {
    try {
      const res = await fn();
      toast.success(res?.message || success);
      setDialog(null);
      changed();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  // Accepting a job leads straight into choosing the engineer.
  const acceptThenAssign = async () => {
    try {
      await acceptJob(data.overview.id);
      toast.success('Job accepted — now assign an engineer');
      changed();
      setDialog('assign');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const d = data;
  const a = d?.actions || {};
  const jobForDialogs = d && {
    id: d.overview.id,
    jobCode: d.overview.jobCode,
    service: d.service.service,
    location: d.location,
    engineer: d.assignment.engineer
  };

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...d }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${d.overview.jobCode}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="w-full sm:max-w-2xl h-full bg-gray-50 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 bg-gray-900 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-mono">{d?.overview.jobCode || 'Loading…'}</p>
            <h3 className="text-lg font-bold truncate">{d ? `${d.service.service}${d.service.subService ? ` — ${d.service.subService}` : ''}` : 'Job details'}</h3>
            {d && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <StatusBadge status={d.overview.status} isOffer={d.overview.isOffer} />
                <SourceBadge source={d.overview.source} />
                <PriorityBadge priority={d.overview.priority} />
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </header>

        {d && (
          <div className="px-5 py-3 bg-white border-b border-gray-200 flex flex-wrap gap-2 shrink-0">
            {a.accept && <button type="button" onClick={acceptThenAssign} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Accept job</button>}
            {a.decline && <button type="button" onClick={() => setDialog('decline')} className="px-3 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-xs font-bold">Decline</button>}
            {a.assign && <button type="button" onClick={() => setDialog('assign')} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Assign engineer</button>}
            {a.release && <button type="button" onClick={() => setDialog('release')} className="px-3 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-xs font-bold">Hand back</button>}
            {a.reassign && <button type="button" onClick={() => setDialog('reassign')} className="px-3 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-bold">Reassign</button>}
            {a.hold && <button type="button" onClick={() => setDialog('hold')} className="px-3 py-2 bg-white border border-orange-200 text-orange-700 rounded-lg text-xs font-bold">Put on hold</button>}
            {a.resume && a.resumeTo && <button type="button" onClick={() => act(() => transitionJob(d.overview.id, a.resumeTo), 'Job resumed')} className="px-3 py-2 bg-white border border-gray-200 text-gray-800 rounded-lg text-xs font-bold">Resume ({RESUME_LABEL[a.resumeTo] || a.resumeTo})</button>}
            {a.contact && d.customer.phone && <a href={`tel:${d.customer.phone}`} className="px-3 py-2 bg-white border border-gray-200 text-gray-800 rounded-lg text-xs font-bold flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Call customer</a>}
            {a.download && <button type="button" onClick={downloadReport} className="px-3 py-2 bg-white border border-gray-200 text-gray-800 rounded-lg text-xs font-bold flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Download</button>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading && !d ? <Skeleton rows={8} /> : error ? <ErrorState message={error} onRetry={load} /> : d && (
            <>
              {d.overview.unassignedReason && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">{d.overview.unassignedReason}</div>
              )}
              {d.overview.isOffer && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
                  This job was routed to you because your service coverage includes it. Customer contact details are shared once you accept.
                </div>
              )}

              <Section icon={History} title="Timeline"><VisualTimeline timeline={d.timeline} /></Section>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Section icon={User} title="Customer">
                  <div className="grid grid-cols-1 gap-2">
                    <Field label="Name" value={d.customer.name || 'Shared after acceptance'} />
                    <Field label="Phone" value={d.customer.phone || '—'} />
                    <Field label="Email" value={d.customer.email || '—'} />
                  </div>
                </Section>
                {d.b2b && (
                  <Section icon={Building2} title="B2B client">
                    <div className="grid grid-cols-1 gap-2">
                      <Field label="Company" value={d.b2b.companyName} />
                      <Field label="Batch" value={d.b2b.batch?.code} />
                      <Field label="Site / Device" value={`${d.b2b.siteId || '—'} / ${d.b2b.deviceId || '—'}`} />
                    </div>
                  </Section>
                )}
                <Section icon={Wrench} title="Service">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Service" value={d.service.service} />
                    <Field label="Service key" value={d.service.serviceKey} />
                    <Field label="Sub-service" value={d.service.subService || '—'} />
                    <Field label="Sub-service key" value={d.service.subServiceKey} />
                  </div>
                </Section>
                <Section icon={MapPin} title="Location">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="City" value={d.location.city} />
                    <Field label="Pincode" value={d.location.pincode} />
                    <div className="col-span-2"><Field label="Address" value={d.location.address || 'Shared after acceptance'} /></div>
                  </div>
                </Section>
                <Section icon={CalendarClock} title="Schedule">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Preferred date" value={formatDateTime(d.schedule.preferredDate)} />
                    <Field label="Time slot" value={d.schedule.preferredTime} />
                  </div>
                </Section>
                <Section icon={Timer} title="SLA">
                  <div className="flex items-center gap-3">
                    <SlaBadge sla={d.sla} />
                    <span className="text-xs text-gray-600">Due {formatDateTime(d.sla.dueAt)}</span>
                  </div>
                </Section>
              </div>

              <Section icon={UserCheck} title="Assignment">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Field label="Vendor" value={d.assignment.vendor?.name} />
                  <Field label="Engineer" value={d.assignment.engineer?.name || 'Not assigned'} />
                  <Field label="Assigned at" value={formatDateTime(d.assignment.assignedAt)} />
                  <Field label="Accepted at" value={formatDateTime(d.assignment.acceptedAt)} />
                </div>
                {d.assignment.lastRejection && (
                  <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">
                    Last rejection {formatDateTime(d.assignment.lastRejection.at)}: {d.assignment.lastRejection.reason}
                    {d.assignment.lastRejection.remarks ? ` — ${d.assignment.lastRejection.remarks}` : ''}
                  </p>
                )}
                {d.assignment.history?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-gray-500 text-left">
                        <tr><th className="py-1 pr-3">Engineer</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3">By</th><th className="py-1 pr-3">Assigned</th><th className="py-1">Reason</th></tr>
                      </thead>
                      <tbody>
                        {d.assignment.history.map((h) => (
                          <tr key={h._id} className="border-t border-gray-100">
                            <td className="py-1.5 pr-3 font-semibold">{h.engineerId?.name || h.engineerName}</td>
                            <td className="py-1.5 pr-3 capitalize">{h.status}{h.isOpen ? ' (current)' : ''}</td>
                            <td className="py-1.5 pr-3">{h.assignedBy?.role}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">{formatDateTime(h.assignedAt)}</td>
                            <td className="py-1.5 text-gray-600">{h.closeReason || h.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {d.attachments && (
                <Section icon={ImageIcon} title="Work evidence">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Field label="Before photos" value={d.attachments.beforePhotos.length} />
                    <Field label="After photos" value={d.attachments.afterPhotos.length} />
                    <Field label="Customer signature" value={d.attachments.customerSignature ? 'Captured' : '—'} />
                    <Field label="Checklist items" value={d.attachments.checklist.length} />
                  </div>
                  {[...d.attachments.beforePhotos, ...d.attachments.afterPhotos].length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[...d.attachments.beforePhotos, ...d.attachments.afterPhotos].map((src) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                          <img src={src} alt="Work evidence" className="w-full h-full object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              <Section icon={Package} title="Parts">
                {d.parts.items?.length > 0 && (
                  <ul className="divide-y divide-gray-100 text-xs mb-3">
                    {d.parts.items.map((p) => (
                      <li key={p.id} className="py-1.5 flex items-center justify-between gap-2">
                        <span><b>{p.name}</b> × {p.quantity} {p.unit}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold ${p.status === 'used' ? 'bg-emerald-50 text-emerald-700' : p.status === 'reserved' ? 'bg-blue-50 text-blue-700' : p.stockState === 'short' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                          {p.status === 'used' ? 'Used' : p.status === 'reserved' ? 'Reserved' : p.stockState === 'short' ? `Short by ${p.shortBy}` : 'Needed'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Field label="Parts replaced (engineer note)" value={d.parts.partsReplaced || 'None reported'} />
                {d.actions?.view && <p className="text-[11px] text-gray-500 mt-2">Add or update parts under Parts → Required Parts / Used Parts.</p>}
              </Section>

              {d.workUpdates?.length > 0 && (
                <Section icon={History} title="Work updates (field)">
                  <ul className="space-y-1.5 text-xs">
                    {d.workUpdates.map((w, i) => (
                      <li key={i} className="flex gap-2"><span className="text-gray-500 whitespace-nowrap">{formatDateTime(w.at)}</span><span className="text-gray-800">{w.remarks || w.status}</span></li>
                    ))}
                  </ul>
                </Section>
              )}

              {d.payment && (
                <Section icon={Wallet} title="Payment">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="Job amount" value={formatINR(d.payment.jobAmount)} />
                    <Field label="Commission + GST" value={formatINR((d.payment.commission || 0) + (d.payment.gst || 0))} />
                    <Field label="Your earnings" value={formatINR(d.payment.vendorEarnings)} />
                    <Field label="Status" value={d.payment.status} />
                  </div>
                </Section>
              )}

              <Section icon={History} title="Event log">
                <ul className="space-y-1.5 text-xs max-h-64 overflow-y-auto">
                  {[...d.timeline.events].reverse().map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="text-gray-500 whitespace-nowrap">{formatDateTime(e.at)}</span>
                      <span className="text-gray-800"><b>{e.to || e.event}</b>{e.from && e.from !== e.to ? ` (from ${e.from})` : ''} — {e.remark} <span className="text-gray-400">[{e.role}]</span></span>
                    </li>
                  ))}
                </ul>
              </Section>

              {d.audit?.length > 0 && (
                <Section icon={ShieldCheck} title="Audit history">
                  <ul className="space-y-1.5 text-xs">
                    {d.audit.map((x) => (
                      <li key={x._id} className="flex gap-2"><span className="text-gray-500 whitespace-nowrap">{formatDateTime(x.createdAt)}</span><span className="text-gray-800">{x.eventMessage} <span className="text-gray-400">[{x.actorRole}]</span></span></li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </aside>

      {dialog === 'assign' && <div onClick={(e) => e.stopPropagation()}><AssignEngineerDialog job={jobForDialogs} mode="assign" onClose={() => setDialog(null)} onDone={changed} /></div>}
      {dialog === 'reassign' && <div onClick={(e) => e.stopPropagation()}><AssignEngineerDialog job={jobForDialogs} mode="reassign" onClose={() => setDialog(null)} onDone={changed} /></div>}
      {dialog === 'decline' && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Decline this job?"
            message="The job will be offered to other eligible vendors."
            confirmLabel="Decline job"
            danger
            requireReason
            onCancel={() => setDialog(null)}
            onConfirm={(reason) => act(() => declineJob(d.overview.id, reason), 'Job declined')}
          />
        </div>
      )}
      {dialog === 'release' && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Hand this job back?"
            message="You accepted this job but have not assigned an engineer. Handing it back returns it to routing so another vendor can take it. It stays in your Rejected list."
            confirmLabel="Hand back job"
            danger
            requireReason
            onCancel={() => setDialog(null)}
            onConfirm={(reason) => act(() => releaseJob(d.overview.id, reason), 'Job handed back')}
          />
        </div>
      )}
      {dialog === 'hold' && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Put job on hold?"
            message="The customer, B2B client and admin will see the job as On Hold with your reason."
            confirmLabel="Put on hold"
            requireReason
            onCancel={() => setDialog(null)}
            onConfirm={(reason) => act(() => transitionJob(d.overview.id, 'ON_HOLD', reason), 'Job put on hold')}
          />
        </div>
      )}
    </div>
  );
};

export default JobDetailDrawer;
