import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminOnboardingDashboard,
  adminOnboardingDetail,
  adminOnboardingReview,
  adminOnboardingActivity
} from '../../../b2b/services/b2bOnboardingApi';

export default function B2BEnterpriseOnboardingAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activity, setActivity] = useState(null);
  const [search, setSearch] = useState('');

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await adminOnboardingDashboard({ search, limit: 50 });
      setItems(res.data.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []);

  const openDetail = async (companyId) => {
    setSelectedId(String(companyId));
    const res = await adminOnboardingDetail(companyId);
    setDetail(res.data.data);
    const act = await adminOnboardingActivity(companyId);
    setActivity(act.data.data);
  };

  const runReview = async (action) => {
    if (!selectedId) return;
    const note = window.prompt('Note (optional)') || '';
    try {
      await adminOnboardingReview(selectedId, { action, note });
      await openDetail(selectedId);
      await loadList();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const onboarding = detail?.onboarding;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">B2B Enterprise Onboarding</h1>
          <p className="text-sm text-gray-500">Approval queue, KYC scores, activation gates</p>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/b2b/onboarding/config" className="text-sm text-teal-700 hover:underline">Configuration</Link>
          <Link to="/admin/b2b/companies" className="text-sm text-teal-700 hover:underline">Legacy company list</Link>
        </div>
      </div>

      <div className="flex gap-2">
        <input className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-md" placeholder="Search company, email, GST…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" onClick={loadList} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm">Search</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">Onboarding queue</div>
          {loading ? <p className="p-4 text-sm text-gray-500">Loading…</p> : (
            <ul className="divide-y max-h-[32rem] overflow-y-auto">
              {items.map((row) => {
                const c = row.companyId;
                const id = c?._id || row.companyId;
                return (
                  <li key={row._id}>
                    <button type="button" onClick={() => openDetail(id)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selectedId === String(id) ? 'bg-teal-50' : ''}`}>
                      <div className="font-medium text-sm">{c?.companyName || 'Draft / unlinked'}</div>
                      <div className="text-xs text-gray-500">{row.lifecycleStatus} · KYC {row.scores?.kyc ?? 0} · missing docs {row.documentStatusSummary?.missing ?? 0}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-white border rounded-xl p-4">
          {!detail ? (
            <p className="text-sm text-gray-500">Select a company to review.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h2 className="font-bold text-lg">{detail.company?.companyName}</h2>
                <p className="text-gray-500">{detail.company?.email} · {detail.company?.gstNumber}</p>
                <p className="mt-1">Status: <strong>{onboarding?.lifecycleStatus}</strong></p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="KYC" value={onboarding?.scores?.kyc} />
                <Stat label="Risk" value={onboarding?.scores?.risk} />
                <Stat label="Credit" value={onboarding?.scores?.credit} />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Documents</h3>
                <p className="text-xs text-gray-600">
                  {onboarding?.documentStatusSummary?.verified || 0} / {onboarding?.documentStatusSummary?.total || 0} verified ·{' '}
                  {onboarding?.documentStatusSummary?.missing || 0} missing
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Verification flags</h3>
                <ul className="text-xs space-y-1">
                  {['gst', 'pan', 'bank', 'agreementSigned', 'financeApproved', 'complianceApproved', 'operationsApproved'].map((k) => (
                    <li key={k}>{k}: {onboarding?.kycFlags?.[k]?.status || 'pending'}</li>
                  ))}
                </ul>
              </div>
              <div className="max-h-40 overflow-y-auto text-xs bg-gray-50 rounded-lg p-2">
                <h3 className="font-semibold mb-1">Activity timeline</h3>
                {(activity?.onboardingTimeline || []).slice(-8).reverse().map((t, i) => (
                  <div key={i}>{new Date(t.at).toLocaleString()} — {t.event}</div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <ReviewBtn onClick={() => runReview('finance_approve')}>Finance approve</ReviewBtn>
                <ReviewBtn onClick={() => runReview('compliance_approve')}>Compliance approve</ReviewBtn>
                <ReviewBtn onClick={() => runReview('operations_approve')}>Ops approve</ReviewBtn>
                <ReviewBtn primary onClick={() => runReview('admin_approve')}>Activate customer</ReviewBtn>
                <ReviewBtn danger onClick={() => runReview('admin_reject')}>Reject</ReviewBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2 text-center">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}

function ReviewBtn({ children, onClick, primary, danger }) {
  let cls = 'px-3 py-1.5 rounded-lg border text-xs';
  if (primary) cls = 'px-3 py-1.5 rounded-lg text-xs text-white bg-teal-600';
  if (danger) cls = 'px-3 py-1.5 rounded-lg text-xs text-white bg-red-600';
  return <button type="button" className={cls} onClick={onClick}>{children}</button>;
}
