import React, { useCallback, useEffect, useState } from 'react';
import { FiSave, FiRefreshCw, FiActivity } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import adminPaymentConfigService from '../../../../services/adminPaymentConfigService';

const PaymentConfig = () => {
  const [tab, setTab] = useState('config'); // config | audit | settlements
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [audit, setAudit] = useState([]);
  const [settlements, setSettlements] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminPaymentConfigService.getConfig();
      if (res.success) setConfig(res.data);
    } catch {
      toast.error('Failed to load payment config');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const res = await adminPaymentConfigService.getAuditLogs({ limit: 50 });
      if (res.success) setAudit(res.data || []);
    } catch {
      toast.error('Failed to load audit logs');
    }
  }, []);

  const loadSettlements = useCallback(async () => {
    try {
      const res = await adminPaymentConfigService.getSettlements({ count: 30 });
      if (res.success) setSettlements(res.data || []);
      else toast.error(res.message || 'Settlements unavailable');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Settlements unavailable');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'audit') loadAudit();
    if (tab === 'settlements') loadSettlements();
  }, [tab, loadAudit, loadSettlements]);

  const toggleMethod = (key) => {
    setConfig((c) => ({
      ...c,
      methods: (c.methods || []).map((m) =>
        m.key === key ? { ...m, enabled: !m.enabled } : m
      )
    }));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await adminPaymentConfigService.updateConfig({
        methods: config.methods,
        cod: config.cod,
        fraud: config.fraud,
        gateway: { verificationAmount: config.gateway?.verificationAmount }
      });
      if (res.success) {
        setConfig(res.data);
        toast.success('Payment configuration saved');
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading payment config…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Payment configuration</h1>
          <p className="text-xs text-gray-500">
            Gateway: {config.gateway?.provider} · Key: {config.gateway?.publicKeyId || '—'} ·{' '}
            {config.gateway?.testMode ? 'TEST' : 'LIVE'} · Webhook:{' '}
            {config.gateway?.webhookConfigured ? 'configured' : 'missing secret'}
          </p>
        </div>
        <div className="flex gap-2">
          {['config', 'audit', 'settlements'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t}
            </button>
          ))}
          <button type="button" onClick={load} className="p-2 hover:bg-gray-100 rounded-lg">
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {tab === 'config' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-gray-800">Methods</h2>
            {(config.methods || []).map((m) => (
              <label key={m.key} className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm font-medium capitalize">{m.label || m.key}</span>
                <input type="checkbox" checked={!!m.enabled} onChange={() => toggleMethod(m.key)} />
              </label>
            ))}
            <div className="pt-2">
              <label className="text-xs font-semibold text-gray-600">Verification amount (₹)</label>
              <input
                type="number"
                min={1}
                value={config.gateway?.verificationAmount ?? 1}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    gateway: { ...c.gateway, verificationAmount: Number(e.target.value) }
                  }))
                }
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-gray-800">COD rules</h2>
            <label className="flex items-center justify-between text-sm">
              COD enabled
              <input
                type="checkbox"
                checked={!!config.cod?.enabled}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, cod: { ...c.cod, enabled: e.target.checked } }))
                }
              />
            </label>
            <div>
              <label className="text-xs font-semibold text-gray-600">Min order amount</label>
              <input
                type="number"
                value={config.cod?.minOrderAmount ?? 0}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    cod: { ...c.cod, minOrderAmount: Number(e.target.value) }
                  }))
                }
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Max order amount (blank = none)</label>
              <input
                type="number"
                value={config.cod?.maxOrderAmount ?? ''}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    cod: {
                      ...c.cod,
                      maxOrderAmount: e.target.value === '' ? null : Number(e.target.value)
                    }
                  }))
                }
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Verification note</label>
              <textarea
                value={config.cod?.verificationNote || ''}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, cod: { ...c.cod, verificationNote: e.target.value } }))
                }
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px]"
              />
            </div>

            <h2 className="text-sm font-bold text-gray-800 pt-2">Fraud limits</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600">Max failed attempts</label>
                <input
                  type="number"
                  value={config.fraud?.maxFailedAttempts ?? 5}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      fraud: { ...c.fraud, maxFailedAttempts: Number(e.target.value) }
                    }))
                  }
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Velocity / hour</label>
                <input
                  type="number"
                  value={config.fraud?.velocityLimitPerHour ?? 20}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      fraud: { ...c.fraud, velocityLimitPerHour: Number(e.target.value) }
                    }))
                  }
                  className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="mt-3 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg flex items-center gap-2 disabled:opacity-60"
            >
              <FiSave /> {saving ? 'Saving…' : 'Save configuration'}
            </button>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500">No audit logs</td>
                </tr>
              ) : (
                audit.map((row) => (
                  <tr key={row._id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.createdAt
                        ? formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.action}</td>
                    <td className="px-3 py-2">{row.actorRole}</td>
                    <td className="px-3 py-2">{row.targetType || '—'} {row.targetId || ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'settlements' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b text-xs text-gray-500 flex items-center gap-2">
            <FiActivity /> Razorpay settlements
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500">
                    No settlements returned (check Razorpay credentials / live account)
                  </td>
                </tr>
              ) : (
                settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-mono">{s.id}</td>
                    <td className="px-3 py-2">
                      ₹{((s.amount || 0) / 100).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2">{s.status || '—'}</td>
                    <td className="px-3 py-2">
                      {s.created_at
                        ? new Date(s.created_at * 1000).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PaymentConfig;
