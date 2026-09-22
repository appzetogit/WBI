import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiExternalLink, FiLoader, FiRefreshCw, FiSave } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';

/**
 * Operational controls for one B2B company, shown inside the existing
 * company inspect panel: account status, commercial controls, the company's
 * users and its audit trail. Every write goes to an existing admin endpoint
 * that validates it and records an audit entry.
 */

const errMsg = (e, fallback) => e?.response?.data?.message || fallback;

const STATUS_STYLE = {
  ACTIVE: 'bg-green-100 text-green-700',
  APPROVED: 'bg-green-100 text-green-700',
  PENDING: 'bg-orange-100 text-orange-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  REJECTED: 'bg-red-100 text-red-700',
  INACTIVE: 'bg-gray-200 text-gray-700'
};
const NEEDS_REASON = ['SUSPENDED', 'REJECTED', 'INACTIVE'];

export const AccountStatusBadge = ({ status }) => (
  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>
    {status || 'PENDING'}
  </span>
);

const label = 'text-[10px] font-bold text-gray-400 uppercase block mb-1';
const input = 'w-full h-9 bg-gray-50 border border-gray-200 text-xs rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-blue-500/25';

/* ───────────── Operations ───────────── */
const OperationsTab = ({ company, onChanged }) => {
  const [status, setStatus] = useState(company.accountStatus || 'PENDING');
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const [services, setServices] = useState([]);
  const [slaProfiles, setSlaProfiles] = useState([]);
  const [controls, setControls] = useState({
    allowedServices: company.allowedServices || [],
    allowedLocations: (company.allowedLocations || []).map((l) => `${l.type || 'city'}:${l.value}`).join(', '),
    pricingProfile: company.pricingProfile || '',
    slaProfile: company.slaProfile || '',
    billingMode: company.billingMode || 'LIVE',
    creditLimit: '',
    reason: ''
  });
  const [savingControls, setSavingControls] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/admin/service-management', { params: { limit: 200 } }),
      api.get('/admin/b2b/settings'),
      api.get(`/admin/b2b-companies/${company._id}`)
    ]).then(([svc, cfg, detail]) => {
      if (!alive) return;
      setServices(svc.data?.data || []);
      const profiles = cfg.data?.data?.sla?.profiles?.length ? cfg.data.data.sla.profiles : (cfg.data?.defaults?.slaProfiles || []);
      setSlaProfiles(profiles);
      const limit = detail.data?.data?.creditProfile?.approvedLimit ?? detail.data?.creditProfile?.approvedLimit;
      if (limit !== undefined && limit !== null) setControls((c) => ({ ...c, creditLimit: String(limit) }));
    }).catch((e) => toast.error(errMsg(e, 'Failed to load company controls')));
    return () => { alive = false; };
  }, [company._id]);

  const saveStatus = async () => {
    if (NEEDS_REASON.includes(status) && !statusReason.trim()) {
      toast.error('Give a reason to suspend, reject or deactivate a company');
      return;
    }
    setSavingStatus(true);
    try {
      const res = await api.patch(`/admin/b2b-companies/${company._id}/status`, { status, reason: statusReason.trim() });
      toast.success(res.data?.message || 'Status updated');
      setStatusReason('');
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, 'Failed to change status'));
    } finally {
      setSavingStatus(false);
    }
  };

  const toggleService = (code) => setControls((c) => ({
    ...c,
    allowedServices: c.allowedServices.includes(code) ? c.allowedServices.filter((s) => s !== code) : [...c.allowedServices, code]
  }));

  const saveControls = async () => {
    const billingChanged = controls.billingMode !== (company.billingMode || 'LIVE');
    if (billingChanged && !controls.reason.trim()) {
      toast.error('Give a reason to change how the company is billed');
      return;
    }
    const allowedLocations = controls.allowedLocations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [type, ...rest] = s.includes(':') ? s.split(':') : ['city', s];
        return { type: type.trim(), value: rest.join(':').trim() };
      });
    setSavingControls(true);
    try {
      const res = await api.patch(`/admin/b2b-companies/${company._id}/controls`, {
        allowedServices: controls.allowedServices,
        allowedLocations,
        pricingProfile: controls.pricingProfile.trim() || null,
        slaProfile: controls.slaProfile || null,
        billingMode: controls.billingMode,
        creditLimit: controls.creditLimit === '' ? undefined : Number(controls.creditLimit),
        reason: controls.reason.trim()
      });
      toast.success(res.data?.message || 'Controls saved');
      setControls((c) => ({ ...c, reason: '' }));
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, 'Failed to save controls'));
    } finally {
      setSavingControls(false);
    }
  };

  const links = [
    ['Wallet ledger', `/admin/b2b/transactions?companyId=${company._id}`],
    ['Contracts', '/admin/b2b/contracts'],
    ['Pricing rules', '/admin/b2b/pricing'],
    ['Reports', `/admin/b2b/reports?companyId=${company._id}`],
    ['Unassigned jobs', '/admin/b2b/unassigned'],
    ['Job submissions', '/admin/b2b/submissions']
  ];

  return (
    <div className="space-y-5">
      <section className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase">Account status</span>
          <AccountStatusBadge status={company.accountStatus} />
        </div>
        {company.statusReason && (
          <p className="text-[11px] text-gray-500">Last reason: “{company.statusReason}”</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={input} aria-label="New status">
            {['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} className={input}
            placeholder={NEEDS_REASON.includes(status) ? 'Reason (required)' : 'Reason (optional)'} maxLength={500} />
        </div>
        {NEEDS_REASON.includes(status) && status !== company.accountStatus && (
          <p className="text-[11px] text-red-600 flex items-center gap-1"><FiAlertTriangle /> The company and its users lose panel access immediately.</p>
        )}
        <button type="button" onClick={saveStatus} disabled={savingStatus || status === company.accountStatus}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold py-2 rounded-xl">
          {savingStatus ? 'Saving…' : 'Change status'}
        </button>
      </section>

      <section className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
        <span className="text-[10px] font-bold text-gray-400 uppercase block">Commercial controls</span>
        <div>
          <span className={label}>Allowed services {controls.allowedServices.length ? `(${controls.allowedServices.length})` : '(all)'}</span>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {services.map((s) => {
              const code = String(s.categoryCode || '').toUpperCase();
              const on = controls.allowedServices.includes(code);
              return (
                <button key={code} type="button" onClick={() => toggleService(code)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                  {s.categoryName || code}
                </button>
              );
            })}
            {!services.length && <span className="text-[11px] text-gray-400">No services configured in Service Management.</span>}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">None selected means every active service is allowed.</p>
        </div>
        <div>
          <span className={label}>Allowed locations</span>
          <input value={controls.allowedLocations} onChange={(e) => setControls({ ...controls, allowedLocations: e.target.value })}
            className={input} placeholder="city:Mumbai, pincode:4000, state:Maharashtra — empty = anywhere" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={label}>SLA profile</span>
            <select value={controls.slaProfile} onChange={(e) => setControls({ ...controls, slaProfile: e.target.value })} className={input}>
              <option value="">Platform default</option>
              {slaProfiles.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Pricing profile</span>
            <input value={controls.pricingProfile} onChange={(e) => setControls({ ...controls, pricingProfile: e.target.value })} className={input} placeholder="Matches pricing rules" />
          </div>
          <div>
            <span className={label}>Billing mode</span>
            <select value={controls.billingMode} onChange={(e) => setControls({ ...controls, billingMode: e.target.value })} className={input}>
              <option value="LIVE">LIVE (real money)</option>
              <option value="DEMO">DEMO (simulated)</option>
            </select>
          </div>
          <div>
            <span className={label}>Credit limit (₹)</span>
            <input type="number" min="0" value={controls.creditLimit} onChange={(e) => setControls({ ...controls, creditLimit: e.target.value })} className={input} />
          </div>
        </div>
        <input value={controls.reason} onChange={(e) => setControls({ ...controls, reason: e.target.value })} className={input}
          placeholder="Reason (required when changing billing mode)" maxLength={500} />
        <button type="button" onClick={saveControls} disabled={savingControls}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5">
          <FiSave /> {savingControls ? 'Saving…' : 'Save controls'}
        </button>
      </section>

      <section className="space-y-1.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase block">Open for this company</span>
        <div className="grid grid-cols-2 gap-2">
          {links.map(([text, to]) => (
            <Link key={text} to={to} className="text-[11px] font-bold text-blue-600 bg-white border border-gray-200 hover:bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
              <FiExternalLink /> {text}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

/* ───────────── Users ───────────── */
const UsersTab = ({ companyId }) => {
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/b2b-companies/${companyId}/users`);
      setUsers(res.data?.data || []);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to load company users'));
      setUsers([]);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const setUserStatus = async (user, status) => {
    if (status === 'blocked' && !window.confirm(`Block ${user.name || user.email}? They will be signed out of the B2B panel.`)) return;
    setBusy(user._id);
    try {
      await api.patch(`/admin/b2b-companies/${companyId}/users/${user._id}/status`, { status });
      toast.success(`User is now ${status}`);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Failed to update user'));
    } finally {
      setBusy(null);
    }
  };

  if (users === null) return <div className="flex justify-center py-10"><FiLoader className="animate-spin text-gray-400" /></div>;
  if (!users.length) return <p className="text-xs text-gray-400 text-center py-8">Only the company login exists. No invited users yet.</p>;

  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div key={u._id} className="border border-gray-100 bg-gray-50/50 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0">
            <p className="font-bold text-gray-800 truncate">{u.name || u.fullName || u.email}</p>
            <p className="text-[10px] text-gray-500 truncate">{u.email} · {u.accessRole || u.role}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${u.status === 'active' ? 'bg-green-100 text-green-700' : u.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'}`}>{u.status}</span>
            <select value="" disabled={busy === u._id} onChange={(e) => e.target.value && setUserStatus(u, e.target.value)}
              className="h-7 text-[10px] font-bold border border-gray-200 rounded-lg bg-white" aria-label="Change user status">
              <option value="">Change…</option>
              {['active', 'inactive', 'blocked'].filter((s) => s !== u.status).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ───────────── Activity ───────────── */
const ActivityTab = ({ companyId }) => {
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/b2b-companies/${companyId}/activity`, { params: { page, limit: 20 } });
      setRows(res.data?.data || []);
      setPages(res.data?.pagination?.pages || 1);
    } catch (e) {
      toast.error(errMsg(e, 'Failed to load activity'));
      setRows([]);
    }
  }, [companyId, page]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <div className="flex justify-center py-10"><FiLoader className="animate-spin text-gray-400" /></div>;

  const fmt = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(', ') : typeof x === 'object' && x !== null ? JSON.stringify(x) : x}`).join(' · ') : String(v));

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={load} className="text-[10px] font-bold text-blue-600 flex items-center gap-1"><FiRefreshCw /> Refresh</button>
      </div>
      {!rows.length && <p className="text-xs text-gray-400 text-center py-8">No recorded activity yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="border border-gray-100 rounded-xl p-3 text-xs">
          <div className="flex justify-between gap-2">
            <span className="font-bold text-gray-800">{String(r.action || '').replace(/_/g, ' ')}</span>
            <span className="text-[10px] text-gray-400 shrink-0">{r.at ? new Date(r.at).toLocaleString('en-IN') : ''}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 capitalize">By {r.actorRole || 'system'}</p>
          {(r.oldValue || r.newValue) && (
            <p className="text-[10px] text-gray-600 mt-1 break-words">
              {fmt(r.oldValue) && <span className="line-through text-gray-400 mr-1">{fmt(r.oldValue)}</span>}
              {fmt(r.newValue)}
            </p>
          )}
          {r.reason && <p className="text-[10px] text-gray-600 mt-1">Reason: “{r.reason}”</p>}
        </div>
      ))}
      {pages > 1 && (
        <div className="flex justify-between items-center pt-2 text-[10px] font-bold">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-blue-600 disabled:text-gray-300">Previous</button>
          <span className="text-gray-500">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="text-blue-600 disabled:text-gray-300">Next</button>
        </div>
      )}
    </div>
  );
};

const CompanyOperations = ({ company, tab, onChanged }) => {
  if (tab === 'users') return <UsersTab companyId={company._id} />;
  if (tab === 'activity') return <ActivityTab companyId={company._id} />;
  return <OperationsTab key={company._id + (company.accountStatus || '')} company={company} onChanged={onChanged} />;
};

export default CompanyOperations;
