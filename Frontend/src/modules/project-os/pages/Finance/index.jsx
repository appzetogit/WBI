import React, { useState, useEffect } from 'react';
import { FiDollarSign, FiTrendingUp, FiCheckCircle, FiClock } from 'react-icons/fi';
import { financeApi } from '../../services/projectOS.api';
import toast from 'react-hot-toast';

function formatINR(v) { return `₹${Number(v || 0).toLocaleString('en-IN')}`; }

export default function FinancePage({ projectId, project }) {
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    financeApi.getSummary(projectId)
      .then(res => setFinance(res.data.data))
      .catch(() => toast.error('Failed to load finance data'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const invoicedPct = finance?.contractValue > 0 ? Math.round((finance.invoicedAmount / finance.contractValue) * 100) : 0;
  const receivedPct = finance?.contractValue > 0 ? Math.round((finance.receivedAmount / finance.contractValue) * 100) : 0;

  if (loading) return <div className="p-8 space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />)}</div>;

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Finance</h2>
        <p className="text-sm text-slate-500 mt-0.5">Billing model: {finance?.billingModel?.replace(/_/g,' ') || '—'}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Contract Value', value: finance?.contractValue, color: 'text-slate-800', bg: 'bg-slate-50' },
          { label: 'Invoiced', value: finance?.invoicedAmount, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Received', value: finance?.receivedAmount, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Outstanding', value: finance?.outstandingAmount, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl border border-slate-200 p-5`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{formatINR(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Progress bars */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="text-sm font-bold text-slate-700">Collection Progress</h3>
        {[
          { label: 'Invoiced', pct: invoicedPct, color: 'bg-blue-500' },
          { label: 'Received', pct: receivedPct, color: 'bg-emerald-500' },
        ].map(b => (
          <div key={b.label}>
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{b.label}</span>
              <span className="font-bold">{b.pct}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div className={`${b.color} h-2.5 rounded-full transition-all duration-700`} style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Milestone payments */}
      {finance?.milestonePayments?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700">Milestone Payments</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {['Milestone', '% of Contract', 'Amount', 'Triggered'].map(h => (
                  <th key={h} className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {finance.milestonePayments.map((m, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-800">{m.title}</td>
                  <td className="px-5 py-3 text-slate-600">{m.invoicePercentage}%</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{formatINR((finance.contractValue || 0) * m.invoicePercentage / 100)}</td>
                  <td className="px-5 py-3">
                    {m.invoiceTriggered
                      ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><FiCheckCircle size={12} /> Yes</span>
                      : <span className="flex items-center gap-1 text-slate-400 text-xs"><FiClock size={12} /> Pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
