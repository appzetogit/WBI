import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Search, SlidersHorizontal, Eye, UserPlus, Repeat, Check, XCircle, MapPin, Clock, ChevronRight, Undo2, Play,
  AlarmClock, AlertTriangle, Info
} from 'lucide-react';
import { useVendorSocket } from '../../context/VendorSocketContext';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, ConfirmDialog, StatusBadge, SlaBadge, PriorityBadge, SourceBadge } from '../../components/ops/OpsUi';
import { formatDateTime } from '../../components/ops/opsFormat';
import { listJobs, listEngineers, acceptJob, declineJob, releaseJob, transitionJob, errorMessage } from '../../services/vendorJobsService';
import JobDetailDrawer from './components/JobDetailDrawer';
import AssignEngineerDialog from './components/AssignEngineerDialog';

/**
 * The Jobs sections, in the order a job moves through them. The six stage
 * sections are exclusive (a job is in exactly one); Cancelled and Rejected
 * sit outside the main flow. Definitions live in the backend
 * (services/vendorJobs.service.js TAB_STATES) — this only labels them.
 */
const SECTIONS = [
  { key: 'all', label: 'All Jobs', hint: 'Every job you hold, plus requests currently offered to you.' },
  { key: 'new', label: 'New Requests', flow: true, hint: 'Routed to you because your service coverage includes them. Accept to take the job (then assign an engineer), or decline so it goes to another vendor.' },
  { key: 'pending_assignment', label: 'Pending Assignment', flow: true, hint: 'You accepted these and they need an engineer. Assign one of your eligible engineers, or hand the job back if you cannot staff it.' },
  { key: 'assigned', label: 'Assigned', flow: true, hint: 'Waiting for the engineer to accept in the TazkY app. Reassign if they cannot take it.' },
  { key: 'accepted', label: 'Accepted', flow: true, hint: 'The engineer accepted. The job moves to In Progress when they start travelling.' },
  { key: 'in_progress', label: 'In Progress', flow: true, hint: 'The engineer is travelling, on site or working, or the job is paused. Put a job on hold with a reason; Resume returns it to where it was paused.', states: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ON_HOLD'] },
  { key: 'completed', label: 'Completed', flow: true, hint: 'Work submitted. The client verifies it, the job closes and your payment is released.', states: ['VERIFICATION', 'COMPLETED', 'CLOSED'] },
  { key: 'cancelled', label: 'Cancelled', hint: 'Cancelled by the client or WBI, or closed as failed. The reason is shown on each job.', states: ['CANCELLED', 'FAILED'] },
  { key: 'rejected', label: 'Rejected', hint: 'Requests you declined, jobs you handed back, and assignments your engineers rejected. Kept as history.' }
];
const SECTION_KEYS = SECTIONS.map((s) => s.key);
const OVERDUE_SECTIONS = ['all', 'pending_assignment', 'assigned', 'accepted', 'in_progress'];

const SUB_LABEL = {
  EN_ROUTE: 'En route', ARRIVED: 'On site', IN_PROGRESS: 'Working', ON_HOLD: 'On hold',
  VERIFICATION: 'Awaiting verification', COMPLETED: 'Submitted', CLOSED: 'Closed', CANCELLED: 'Cancelled', FAILED: 'Failed'
};
const RESUME_LABEL = { EN_ROUTE: 'Resume travel', ARRIVED: 'Resume on site', IN_PROGRESS: 'Resume work' };
const REJECTION_LABEL = { offer_declined: 'You declined', released: 'You handed back', engineer_rejected: 'Engineer rejected' };

const EMPTY = {
  all: ['No jobs yet', 'Jobs routed to you appear here. Make sure your service coverage is set up under Services.'],
  new: ['No new requests', 'Requests appear here when routing matches your service coverage and a skilled engineer of yours. Check your coverage under Services.'],
  pending_assignment: ['Nothing waiting for an engineer', 'Jobs you accept land here until you assign an engineer.'],
  assigned: ['No job is waiting on an engineer', 'Jobs you assign wait here until the engineer accepts in the TazkY app.'],
  accepted: ['No accepted jobs waiting to start', 'Jobs move to In Progress as soon as the engineer starts travelling.'],
  in_progress: ['No job in the field right now', 'Jobs being travelled to, worked on, or paused appear here.'],
  completed: ['No completed jobs yet', 'Jobs appear here once the engineer submits the work.'],
  cancelled: ['No cancelled jobs', 'Jobs cancelled by the client or WBI appear here with the reason.'],
  rejected: ['Nothing rejected', 'Requests you decline, jobs you hand back and engineer rejections are kept here.']
};

const LIVE_EVENTS = ['job:statusChanged', 'b2b:jobRequestReceived', 'vendor:jobNotice', 'vendor:jobOfferClosed'];
const BLANK_FILTERS = { search: '', priority: '', source: '', service: '', city: '', pincode: '', engineerId: '', from: '', to: '' };

const ago = (d, now) => {
  if (!d) return '';
  const m = Math.round((now - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const until = (d, now) => {
  const m = Math.round((new Date(d).getTime() - now) / 60000);
  if (m <= 0) return 'now';
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};

/** One line under the status: why the job is in this section and what is next. */
const StageNote = ({ row, now }) => {
  const s = row.stage;
  if (row.rejections?.length) {
    return (
      <ul className="mt-1 space-y-0.5">
        {row.rejections.slice(0, 3).map((r, i) => (
          <li key={i} className="text-[11px] text-red-700">
            <b>{r.by === 'engineer' ? `${r.engineerName} rejected` : REJECTION_LABEL[r.kind]}</b>
            {r.reason ? `: ${r.reason}` : ''} <span className="text-gray-400">· {ago(r.at, now)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (!s) return null;
  const note = (text, cls = 'text-gray-500') => <p className={`mt-1 text-[11px] ${cls}`}>{text}</p>;
  switch (s.kind) {
    case 'offer':
      return s.expiresAt ? note(`Respond within ${until(s.expiresAt, now)}`, 'text-sky-700 font-semibold') : note('Open request');
    case 'awaiting_engineer':
      return s.engineerRejected
        ? note(`${s.engineerRejected.engineerName} rejected${s.engineerRejected.reason ? `: ${s.engineerRejected.reason}` : ''} — assign another engineer`, 'text-red-700 font-semibold')
        : note(`Needs an engineer · accepted ${ago(s.since, now)}`, 'text-amber-700');
    case 'awaiting_engineer_acceptance':
      return note(`Waiting for ${row.engineer?.name || 'engineer'} to accept · ${ago(s.since, now)}`);
    case 'engineer_accepted':
      return note(`Accepted ${ago(s.since, now)} · travel not started`);
    case 'in_field':
      return note(row.status === 'IN_PROGRESS' && s.startedAt ? `Working since ${formatDateTime(s.startedAt)}` : `${SUB_LABEL[row.status] || row.status} · ${ago(s.since, now)}`);
    case 'on_hold':
      return note(`Paused${s.reason ? `: ${s.reason}` : ''}${s.resumeTo ? '' : ' · reassign to continue'}`, 'text-orange-700');
    case 'awaiting_verification':
      return note(`Submitted ${ago(s.submittedAt, now)} · awaiting client verification`);
    case 'closed':
      return note(`Closed ${formatDateTime(s.closedAt)}`, 'text-emerald-700');
    case 'cancelled':
    case 'failed':
      return note(`${s.kind === 'failed' ? 'Failed' : `Cancelled${s.byRole ? ` by ${s.byRole === 'company' ? 'client' : s.byRole}` : ''}`}${s.reason ? `: ${s.reason}` : ''}`, 'text-red-700');
    default:
      return null;
  }
};

const RowStatus = ({ row, now }) => (
  <div className="min-w-0">
    {row.heldByYou || row.isOffer
      ? <StatusBadge status={row.status} isOffer={row.isOffer} />
      : <span className="inline-flex px-2.5 py-1 rounded-full border text-[11px] font-bold bg-red-50 text-red-700 border-red-200">{REJECTION_LABEL[row.rejections?.[0]?.kind] || 'Not yours'}</span>}
    <StageNote row={row} now={now} />
  </div>
);

const VendorJobs = () => {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'all';
  // Older links: ?tab=unassigned → Pending Assignment, ?tab=overdue → All + overdue filter.
  const tab = rawTab === 'unassigned' ? 'pending_assignment' : SECTION_KEYS.includes(rawTab) ? rawTab : 'all';
  const overdue = rawTab === 'overdue' || params.get('overdue') === '1';
  const activeOnly = tab === 'all' && params.get('active') === '1';
  const subStatus = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const section = SECTIONS.find((s) => s.key === tab);

  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [sort, setSort] = useState('createdAt:desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [state, setState] = useState({ loading: true, refreshing: false, error: '', rows: [], counts: {}, statusCounts: {}, pagination: {} });
  const [engineers, setEngineers] = useState([]);
  const [openJob, setOpenJob] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const { socket } = useVendorSocket() || {};

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  const query = useMemo(() => {
    const [sortField, order] = sort.split(':');
    const q = { tab, page, limit: 20, sort: sortField, order };
    ['priority', 'source', 'service', 'city', 'pincode', 'engineerId', 'from', 'to'].forEach((k) => { if (filters[k]) q[k] = filters[k]; });
    if (debouncedSearch.trim()) q.search = debouncedSearch.trim();
    if (overdue) q.overdue = 1;
    if (activeOnly) q.active = 1;
    if (subStatus) q.status = subStatus;
    return q;
  }, [tab, page, sort, filters, debouncedSearch, overdue, activeOnly, subStatus]);

  const load = useCallback(async (silent = false) => {
    setState((s) => ({ ...s, loading: !silent && !s.rows.length, refreshing: silent, error: '' }));
    try {
      const res = await listJobs(query);
      setState({ loading: false, refreshing: false, error: '', rows: res.data || [], counts: res.counts || {}, statusCounts: res.statusCounts || {}, pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, refreshing: false, error: errorMessage(err, 'Could not load jobs') }));
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    listEngineers({ tab: 'active' }).then((r) => setEngineers(r.data || [])).catch(() => setEngineers([]));
  }, []);

  // Real-time: any status change / new offer for this vendor refreshes the list.
  const reloadTimer = useRef(null);
  useEffect(() => {
    if (!socket?.on) return undefined;
    const onEvent = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => load(true), 400);
    };
    LIVE_EVENTS.forEach((e) => socket.on(e, onEvent));
    return () => {
      clearTimeout(reloadTimer.current);
      LIVE_EVENTS.forEach((e) => socket.off?.(e, onEvent));
    };
  }, [socket, load]);

  const updateParams = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === null || v === undefined || v === '' ? next.delete(k) : next.set(k, String(v))));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  const setTab = (key) => updateParams({ tab: key, status: null, active: null, overdue: OVERDUE_SECTIONS.includes(key) && overdue ? 1 : null });
  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    if (page !== 1) updateParams({ page: null });
  };
  const filtersActive = Object.values(filters).some(Boolean) || overdue || activeOnly || Boolean(subStatus);
  const clearFilters = () => {
    setFilters(BLANK_FILTERS);
    updateParams({ overdue: null, active: null, status: null, tab: tab });
  };

  const run = async (fn, fallback) => {
    try {
      const res = await fn();
      toast.success(res?.message || fallback);
      load(true);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  // Accepting a request leads straight into choosing the engineer.
  const acceptThenAssign = async (row) => {
    try {
      await acceptJob(row.id);
      toast.success(`${row.jobCode} accepted — now assign an engineer`);
      load(true);
      setAssignFor({ row: { ...row, isOffer: false, engineer: null }, mode: 'assign' });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const RowActions = ({ row }) => {
    const a = row.actions || {};
    const btn = 'px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1';
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {a.view !== false && <button type="button" onClick={() => setOpenJob(row.id)} className={`${btn} bg-gray-900 text-white`}><Eye className="w-3.5 h-3.5" /> View</button>}
        {a.accept && <button type="button" onClick={() => acceptThenAssign(row)} className={`${btn} bg-emerald-600 text-white`}><Check className="w-3.5 h-3.5" /> Accept</button>}
        {a.decline && <button type="button" onClick={() => setConfirm({ kind: 'decline', row })} className={`${btn} border border-red-200 text-red-700`}><XCircle className="w-3.5 h-3.5" /> Decline</button>}
        {a.assign && <button type="button" onClick={() => setAssignFor({ row, mode: 'assign' })} className={`${btn} bg-blue-600 text-white`}><UserPlus className="w-3.5 h-3.5" /> Assign</button>}
        {a.release && <button type="button" onClick={() => setConfirm({ kind: 'release', row })} className={`${btn} border border-red-200 text-red-700`}><Undo2 className="w-3.5 h-3.5" /> Hand back</button>}
        {a.reassign && <button type="button" onClick={() => setAssignFor({ row, mode: 'reassign' })} className={`${btn} border border-blue-200 text-blue-700`}><Repeat className="w-3.5 h-3.5" /> Reassign</button>}
        {a.resume && a.resumeTo && <button type="button" onClick={() => run(() => transitionJob(row.id, a.resumeTo), 'Job resumed')} className={`${btn} border border-gray-200 text-gray-800`}><Play className="w-3.5 h-3.5" /> {RESUME_LABEL[a.resumeTo] || 'Resume'}</button>}
        {a.contact && row.customer.phone && <a href={`tel:${row.customer.phone}`} className={`${btn} border border-gray-200 text-gray-700`}>Call</a>}
      </div>
    );
  };

  const { rows, counts, statusCounts, pagination } = state;
  const chipBase = 'px-3 py-1.5 rounded-lg text-[11px] font-bold border whitespace-nowrap flex items-center gap-1.5';

  const tabButton = (s) => {
    const active = tab === s.key;
    const n = counts[s.key] ?? 0;
    const alert = ['new', 'pending_assignment'].includes(s.key) && n > 0 && !active;
    return (
      <button
        key={s.key}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setTab(s.key)}
        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap border transition-all ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
      >
        {s.label}
        <span className={`px-1.5 rounded text-[10px] tabular-nums ${active ? 'bg-white/20' : alert ? 'bg-red-500 text-white' : 'bg-gray-100'}`}>{n}</span>
      </button>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Jobs"
        title={section?.label || 'Jobs'}
        subtitle="One job record shared live with the client, WBI and your engineers. Every step is checked by the server."
        actions={<RefreshButton onClick={() => load(true)} spinning={state.refreshing} />}
      />

      {/* Sections in flow order: All · New → Pending → Assigned → Accepted → In Progress → Completed · Cancelled · Rejected */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Job sections">
        {tabButton(SECTIONS[0])}
        <span className="w-px h-6 bg-gray-200 mx-1 shrink-0" aria-hidden="true" />
        {SECTIONS.filter((s) => s.flow).map((s, i, list) => (
          <Fragment key={s.key}>
            {tabButton(s)}
            {i < list.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" aria-hidden="true" />}
          </Fragment>
        ))}
        <span className="w-px h-6 bg-gray-200 mx-1 shrink-0" aria-hidden="true" />
        {SECTIONS.filter((s) => ['cancelled', 'rejected'].includes(s.key)).map(tabButton)}
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>{section?.hint}</p>
      </div>

      {(section?.states || OVERDUE_SECTIONS.includes(tab)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {section?.states && (
            <>
              <button type="button" onClick={() => updateParams({ status: null })} className={`${chipBase} ${!subStatus ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                All <span className="tabular-nums">{counts[tab] ?? 0}</span>
              </button>
              {section.states.map((st) => (
                <button key={st} type="button" onClick={() => updateParams({ status: subStatus === st ? null : st })} className={`${chipBase} ${subStatus === st ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {SUB_LABEL[st] || st} <span className="tabular-nums">{statusCounts[st] ?? 0}</span>
                </button>
              ))}
            </>
          )}
          {OVERDUE_SECTIONS.includes(tab) && (
            <button type="button" onClick={() => updateParams({ overdue: overdue ? null : 1 })} aria-pressed={overdue} className={`${chipBase} ${overdue ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200'}`}>
              <AlarmClock className="w-3.5 h-3.5" /> Overdue <span className="tabular-nums">{counts.overdue ?? 0}</span>
            </button>
          )}
          {tab === 'all' && (
            <button type="button" onClick={() => updateParams({ active: activeOnly ? null : 1 })} aria-pressed={activeOnly} className={`${chipBase} ${activeOnly ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-700 border-purple-200'}`}>
              Active only <span className="tabular-nums">{counts.active ?? 0}</span>
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Search job ID, customer, service, city, pincode, engineer…"
              aria-label="Search jobs"
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700" aria-label="Sort">
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="sla:asc">SLA due soonest</option>
              <option value="scheduledAt:asc">Scheduled soonest</option>
              <option value="updatedAt:desc">Recently updated</option>
            </select>
            <button type="button" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700'}`}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>
            {filtersActive && <button type="button" onClick={clearFilters} className="px-3 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">Clear</button>}
          </div>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs" aria-label="Priority">
              <option value="">All priorities</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
            </select>
            <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs" aria-label="Source">
              <option value="">All sources</option><option value="B2B">B2B</option><option value="USER_APP">User App</option><option value="ADMIN">Admin</option><option value="VENDOR">Vendor</option><option value="SYSTEM">System</option>
            </select>
            <input value={filters.service} onChange={(e) => setFilter('service', e.target.value)} placeholder="Service / key" aria-label="Service" className="px-3 py-2 border border-gray-200 rounded-lg text-xs" />
            <input value={filters.city} onChange={(e) => setFilter('city', e.target.value)} placeholder="City" aria-label="City" className="px-3 py-2 border border-gray-200 rounded-lg text-xs" />
            <input value={filters.pincode} onChange={(e) => setFilter('pincode', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="Pincode" aria-label="Pincode" className="px-3 py-2 border border-gray-200 rounded-lg text-xs" />
            <select value={filters.engineerId} onChange={(e) => setFilter('engineerId', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs" aria-label="Engineer">
              <option value="">All engineers</option>
              {engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs" aria-label="Created from" />
            <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-xs" aria-label="Created to" />
          </div>
        )}
      </div>

      {state.loading ? (
        <Skeleton rows={8} />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={() => load()} />
      ) : rows.length === 0 ? (
        filtersActive
          ? <EmptyState title="No jobs match these filters" message="Clear the filters to see every job in this section." action={<button type="button" onClick={clearFilters} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold">Clear filters</button>} />
          : <EmptyState title={EMPTY[tab][0]} message={EMPTY[tab][1]} />
      ) : (
        <>
          {/* Desktop / laptop: table */}
          <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3">Job</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Service</th>
                  <th className="px-3 py-3">Location</th><th className="px-3 py-3">Scheduled</th><th className="px-3 py-3">Engineer</th>
                  <th className="px-3 py-3">SLA</th><th className="px-3 py-3 min-w-[220px]">Status</th><th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-gray-100 align-top ${r.stage?.engineerRejected || r.sla?.state === 'breached' ? 'bg-red-50/30' : 'hover:bg-gray-50/60'}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs font-bold text-gray-900">{r.jobCode}</p>
                      <div className="mt-1 flex items-center gap-1"><SourceBadge source={r.source} /></div>
                      <p className="text-[11px] text-gray-400 mt-1">{formatDateTime(r.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3 text-xs"><p className="font-semibold text-gray-900">{r.customer.name || r.customer.companyName || '—'}</p>{r.customer.name && r.customer.companyName && <p className="text-gray-500">{r.customer.companyName}</p>}</td>
                    <td className="px-3 py-3 text-xs"><p className="font-semibold text-gray-900">{r.service}</p><div className="mt-1"><PriorityBadge priority={r.priority} /></div></td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">{r.location.city}<br /><span className="text-gray-500">{r.location.pincode}</span></td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">{formatDateTime(r.scheduledAt)}{r.scheduledTime ? <><br /><span className="text-gray-500">{r.scheduledTime}</span></> : null}</td>
                    <td className="px-3 py-3 text-xs">{r.engineer?.name || (r.heldByYou && ['PENDING_ASSIGNMENT', 'REJECTED'].includes(r.status) ? <span className="text-amber-700 font-semibold">Not assigned</span> : '—')}</td>
                    <td className="px-3 py-3"><SlaBadge sla={r.sla} /></td>
                    <td className="px-3 py-3"><RowStatus row={r} now={now} /></td>
                    <td className="px-3 py-3"><RowActions row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tablet / mobile: cards */}
          <div className="lg:hidden space-y-3">
            {rows.map((r) => (
              <article key={r.id} className={`bg-white rounded-xl border p-4 space-y-3 ${r.stage?.engineerRejected || r.sla?.state === 'breached' ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-gray-900">{r.jobCode}</p>
                    <h3 className="text-sm font-bold text-gray-900 truncate">{r.service}</h3>
                    <p className="text-xs text-gray-500">{r.customer.name || r.customer.companyName || '—'}</p>
                  </div>
                  <SlaBadge sla={r.sla} />
                </div>
                <RowStatus row={r} now={now} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {r.location.city} {r.location.pincode}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatDateTime(r.scheduledAt)}</span>
                  <PriorityBadge priority={r.priority} />
                  <SourceBadge source={r.source} />
                </div>
                {r.engineer?.name && <p className="text-xs">Engineer: <b>{r.engineer.name}</b></p>}
                <RowActions row={r} />
              </article>
            ))}
          </div>

          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPage={(p) => updateParams({ page: p })} />
        </>
      )}

      {tab === 'pending_assignment' && rows.some((r) => r.stage?.engineerRejected) && (
        <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Jobs highlighted in red were rejected by an engineer and need another engineer.</p>
      )}

      {openJob && <JobDetailDrawer jobId={openJob} onClose={() => setOpenJob(null)} onChanged={() => load(true)} />}
      {assignFor && (
        <AssignEngineerDialog
          job={assignFor.row}
          mode={assignFor.mode}
          onClose={() => setAssignFor(null)}
          onDone={() => load(true)}
        />
      )}
      {confirm?.kind === 'decline' && (
        <ConfirmDialog
          title={`Decline ${confirm.row.jobCode}?`}
          message="The request is offered to other eligible vendors. It stays in your Rejected list."
          confirmLabel="Decline request"
          danger
          requireReason
          onCancel={() => setConfirm(null)}
          onConfirm={async (reason) => { if (await run(() => declineJob(confirm.row.id, reason), 'Request declined')) setConfirm(null); }}
        />
      )}
      {confirm?.kind === 'release' && (
        <ConfirmDialog
          title={`Hand back ${confirm.row.jobCode}?`}
          message="You accepted this job but have not assigned an engineer. Handing it back returns it to routing so another vendor can take it. It stays in your Rejected list."
          confirmLabel="Hand back job"
          danger
          requireReason
          onCancel={() => setConfirm(null)}
          onConfirm={async (reason) => { if (await run(() => releaseJob(confirm.row.id, reason), 'Job handed back')) setConfirm(null); }}
        />
      )}
    </div>
  );
};

export default VendorJobs;
