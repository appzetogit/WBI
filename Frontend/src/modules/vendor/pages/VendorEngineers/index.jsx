import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserPlus, Search, Star, MapPin, Wrench, Briefcase, Info, CalendarDays } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination } from '../../components/ops/OpsUi';
import { formatDate } from '../../components/ops/opsFormat';
import { listEngineers, errorMessage } from '../../services/vendorJobsService';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import { TeamStatusBadge, AvailabilityBadge, EngineerEditModal } from './components/EngineerUi';
import TeamActions from './components/TeamActions';
import EngineerDrawer from './components/EngineerDrawer';
import useTeamServices from './useTeamServices';
import { AVAILABILITY, AVAILABILITY_ORDER, availabilityCount } from './engineerMeta';

const TABS = [
  { key: 'all', label: 'All Engineers', hint: 'Everyone linked to your company, whatever their status.' },
  { key: 'pending', label: 'Pending Engineers', hint: 'Not able to take jobs yet: join requests waiting for your approval, and engineers waiting for WBI to verify their documents.' },
  { key: 'active', label: 'Active Engineers', hint: 'Verified, approved by you and active. Routing can assign them jobs that match their skills and area.' },
  { key: 'inactive', label: 'Inactive Engineers', hint: 'Deactivated or suspended by you, suspended or rejected by WBI, or account disabled. They receive no jobs.' }
];
// Older links: ?tab=available|busy|offline → Active + that availability; suspended|rejected → Inactive.
const LEGACY_AVAILABILITY = ['available', 'busy', 'offline'];

const VendorEngineers = () => {
  const { basePath } = useVendorBasePath();
  const services = useTeamServices();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'all';
  const tab = LEGACY_AVAILABILITY.includes(rawTab) ? 'active' : ['suspended', 'rejected'].includes(rawTab) ? 'inactive' : TABS.some((t) => t.key === rawTab) ? rawTab : 'all';
  const availability = LEGACY_AVAILABILITY.includes(rawTab) ? rawTab : params.get('availability') || '';
  const pendingOn = params.get('pendingOn') || '';
  const page = Number(params.get('page') || 1);
  const section = TABS.find((t) => t.key === tab);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [state, setState] = useState({ loading: true, error: '', rows: [], counts: null, pagination: {} });
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await listEngineers({
        tab, page, limit: 24,
        ...(availability ? { availability } : {}),
        ...(pendingOn ? { pendingOn } : {}),
        ...(debounced ? { search: debounced } : {})
      });
      setState({ loading: false, error: '', rows: res.data || [], counts: res.counts || null, pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load engineers') }));
    }
  }, [tab, page, availability, pendingOn, debounced]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  const setTab = (key) => update({ tab: key, availability: null, pendingOn: null });

  const c = state.counts;
  const chip = (active) => `px-3 py-1.5 rounded-lg text-[11px] font-bold border whitespace-nowrap ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Engineers"
        title={section.label}
        subtitle="Your team, with live status from WBI verification, your approvals, leave and current jobs."
        actions={(
          <>
            <Link to={`${basePath}/engineers/add`} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Add engineer</Link>
            <RefreshButton onClick={load} spinning={false} />
          </>
        )}
      />

      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Engineer sections">
        {TABS.map((t) => {
          const active = tab === t.key;
          const n = c ? c[t.key] : 0;
          const alert = t.key === 'pending' && c?.pendingOnVendor > 0 && !active;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border whitespace-nowrap flex items-center gap-1.5 ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
              {t.label}
              <span className={`px-1.5 rounded text-[10px] tabular-nums ${active ? 'bg-white/20' : alert ? 'bg-red-500 text-white' : 'bg-gray-100'}`}>{n ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /><p>{section.hint}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); if (page !== 1) update({ page: null }); }} placeholder="Search name, phone, email, city…" aria-label="Search engineers"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        {tab === 'pending' && c && (
          <div className="flex gap-1.5">
            <button type="button" className={chip(!pendingOn)} onClick={() => update({ pendingOn: null })}>All {c.pending}</button>
            <button type="button" className={chip(pendingOn === 'vendor')} onClick={() => update({ pendingOn: 'vendor' })}>Needs your approval {c.pendingOnVendor}</button>
            <button type="button" className={chip(pendingOn === 'wbi')} onClick={() => update({ pendingOn: 'wbi' })}>WBI verification {c.pendingOnWbi}</button>
          </div>
        )}
        {tab === 'active' && c && (
          <div className="flex gap-1.5 overflow-x-auto">
            <button type="button" className={chip(!availability)} onClick={() => update({ availability: null, tab: 'active' })}>All {c.active}</button>
            {AVAILABILITY_ORDER.map((k) => (
              <button key={k} type="button" className={chip(availability === k)} onClick={() => update({ availability: k, tab: 'active' })}>
                {AVAILABILITY[k].label} {availabilityCount(c.availability, k)}
              </button>
            ))}
          </div>
        )}
      </div>

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.rows.length ? (
        <EmptyState
          title={debounced || availability || pendingOn ? 'No engineers match' : tab === 'pending' ? 'Nobody is pending' : tab === 'inactive' ? 'No inactive engineers' : 'No engineers yet'}
          message={tab === 'all' || tab === 'active' ? 'Add an engineer, or share your invite link so engineers can join your team.' : 'Try another section.'}
          action={tab === 'all' || tab === 'active' ? <Link to={`${basePath}/engineers/add`} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Add engineer</Link> : null}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {state.rows.map((e) => (
              <article key={e.id} className={`bg-white rounded-2xl border p-4 space-y-3 ${e.pendingOn === 'vendor' ? 'border-amber-300' : 'border-gray-200'}`}>
                <button type="button" onClick={() => setOpenId(e.id)} className="w-full text-left flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 overflow-hidden">
                      {e.photo ? <img src={e.photo} alt="" className="w-full h-full object-cover" /> : e.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate hover:underline">{e.name}</p>
                      <p className="text-xs text-gray-500">{e.phone} · since {formatDate(e.joinedAt)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <TeamStatusBadge row={e} />
                    {e.status === 'ACTIVE' && <AvailabilityBadge availability={e.availability} />}
                  </div>
                </button>
                {e.statusReason && e.status !== 'ACTIVE' && <p className={`text-[11px] font-semibold ${e.status === 'INACTIVE' ? 'text-red-700' : 'text-amber-800'}`}>{e.statusReason}</p>}
                <div className="space-y-1 text-xs text-gray-600">
                  <p className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{e.skills.join(', ') || 'No skills recorded'}</span></p>
                  <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{[e.coverage.city, ...e.coverage.cities].filter(Boolean).join(', ') || '—'}{e.coverage.radiusKm ? ` · ${e.coverage.radiusKm} km` : ''}</span></p>
                  <p className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 shrink-0" /> {e.schedule.workingDays.length ? e.schedule.workingDays.map((d) => d.slice(0, 3)).join(' ') : 'Every day'}{e.availability.onLeave ? <span className="text-rose-700 font-semibold"> · on leave till {formatDate(e.availability.leaveUntil)}</span> : ''}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-sm font-extrabold tabular-nums">{e.availability.activeJobs}<span className="text-gray-400 text-[10px]">/{e.availability.maxActiveJobs}</span></p><p className="text-[10px] text-gray-500">Jobs now</p></div>
                  <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-sm font-extrabold tabular-nums">{e.completedJobs}</p><p className="text-[10px] text-gray-500">Completed</p></div>
                  <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-sm font-extrabold tabular-nums flex items-center justify-center gap-0.5">{e.rating ? <><Star className="w-3 h-3 text-amber-500 fill-amber-500" />{e.rating}</> : '—'}</p><p className="text-[10px] text-gray-500">Rating</p></div>
                </div>
                {e.currentJobs.length > 0 && (
                  <p className="text-[11px] text-gray-600 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> {e.currentJobs.map((j) => j.jobCode).join(', ')}</p>
                )}
                <TeamActions row={e} onChanged={load} onEdit={setEditing} />
              </article>
            ))}
          </div>
          <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={(p) => update({ page: p })} />
        </>
      )}

      {openId && <EngineerDrawer engineerId={openId} services={services} onClose={() => setOpenId(null)} onChanged={load} />}
      {editing && <EngineerEditModal engineer={editing} services={services} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
};

export default VendorEngineers;
