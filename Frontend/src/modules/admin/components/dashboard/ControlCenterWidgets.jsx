import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiShield, FiRotateCcw, FiFlag, FiCreditCard } from 'react-icons/fi';
import { useApi, inr, when } from '../../pages/ControlCenter/helpers';

/** Queue counts, alerts and the latest money movements (dashboard spec gaps). */
const ControlCenterWidgets = () => {
  const navigate = useNavigate();
  const { data } = useApi('/admin/dashboard/control-center');
  if (!data) return null;
  const tiles = [
    { icon: FiShield, label: 'Pending verification', value: data.pendingVerification.total,
      sub: `V ${data.pendingVerification.vendors} · E ${data.pendingVerification.engineers} · W ${data.pendingVerification.workers} · B2B ${data.pendingVerification.b2bCompanies} · docs ${data.pendingVerification.documents}`, to: '/admin/verifications' },
    { icon: FiCreditCard, label: 'Pending withdrawals', value: data.withdrawals.pending, sub: `${inr(data.withdrawals.amount)} · ${data.withdrawals.olderThan24h} older than 24h`, to: '/admin/settlements' },
    { icon: FiRotateCcw, label: 'Refunds (30 days)', value: data.refunds30d.count, sub: inr(data.refunds30d.amount), to: '/admin/control-center/refunds' },
    { icon: FiFlag, label: 'Disputes', value: data.disputes.open + data.disputes.inReview, sub: `${data.disputes.open} open · ${data.disputes.inReview} in review`, to: '/admin/control-center/disputes' }
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <button key={t.label} type="button" onClick={() => navigate(t.to)} className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><t.icon /> {t.label}</div>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">{t.value}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{t.sub}</div>
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2"><FiAlertTriangle className="text-amber-500" /> System alerts</div>
          {data.alerts.length ? data.alerts.map((a) => (
            <button key={a.key} type="button" onClick={() => navigate(a.link)} className="w-full text-left flex items-start gap-2 py-1.5 text-sm hover:bg-gray-50 rounded">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.level === 'high' ? 'bg-red-500' : 'bg-amber-400'}`} />{a.message}
            </button>
          )) : <p className="text-sm text-gray-400">All clear.</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm font-bold text-gray-800 mb-2">Recent transactions</div>
          <ul className="divide-y divide-gray-50">
            {data.recentTransactions.map((t, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="font-bold uppercase text-gray-400 w-8">{t.source}</span>
                <span className="text-gray-700 flex-1 truncate">{t.type.replace(/_/g, ' ')} {t.note ? `· ${t.note}` : ''}</span>
                <span className="font-bold text-gray-900">{inr(t.amount)}</span>
                <span className="text-gray-400 w-28 text-right">{when(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ControlCenterWidgets;
