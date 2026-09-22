import React, { useCallback, useEffect, useState } from 'react';
import { FiSettings, FiLoader, FiSave } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

/**
 * Platform settings for the B2B ecosystem.
 *
 * These are the values the services read at runtime — routing timeouts and
 * fallback order, SLA profiles, top-up methods, bulk limits, business hours.
 * Changing one here takes effect immediately, with no deploy.
 */

const ROUTING_MODES = [
  ['vendor_first', 'Vendors first, then freelancers'],
  ['freelancer_first', 'Freelancers first, then vendors'],
  ['vendor_only', 'Vendors only'],
  ['freelancer_only', 'Freelancers only']
];

const B2BSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/b2b/settings');
      setConfig(res.data?.data || null);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load B2B settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (section) => {
    try {
      setSaving(true);
      const res = await api.patch('/admin/b2b/settings', { [section]: config[section] });
      setConfig(res.data?.data || config);
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not save the settings');
    } finally {
      setSaving(false);
    }
  };

  const setIn = (section, key, value) =>
    setConfig({ ...config, [section]: { ...config[section], [key]: value } });

  const num = (section, key, label, hint = '') => (
    <label className="block">
      <span className="text-[11px] font-semibold text-gray-500">{label}</span>
      <input
        type="number"
        value={config[section]?.[key] ?? ''}
        onChange={(e) => setIn(section, key, Number(e.target.value))}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      {hint ? <span className="text-[10px] text-gray-400">{hint}</span> : null}
    </label>
  );

  const toggle = (section, key, label) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={Boolean(config[section]?.[key])}
        onChange={(e) => setIn(section, key, e.target.checked)}
      />
      {label}
    </label>
  );

  if (loading || !config) {
    return (
      <CardShell icon={FiSettings} title="B2B settings">
        <div className="flex justify-center py-16">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </CardShell>
    );
  }

  const saveButton = (section) => (
    <button
      type="button"
      onClick={() => save(section)}
      disabled={saving}
      className="mt-4 inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:bg-gray-300"
    >
      <FiSave /> {saving ? 'Saving…' : 'Save'}
    </button>
  );

  return (
    <div className="space-y-6">
      <CardShell icon={FiSettings} title="Routing">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Who is tried first</span>
            <select
              value={config.routing?.mode || 'vendor_first'}
              onChange={(e) => setIn('routing', 'mode', e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              {ROUTING_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {num('routing', 'vendorOfferTimeoutMinutes', 'Vendor offer timeout (minutes)')}
          {num('routing', 'engineerAcceptTimeoutMinutes', 'Engineer acceptance timeout (minutes)', 'Past this, the request expires and routing moves on.')}
          {num('routing', 'engineerMaxActiveJobs', 'Maximum jobs per engineer')}
          {num('routing', 'maxFallbackAttempts', 'Fallback attempts before the unassigned queue')}
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Fallback order</span>
            <input
              type="text"
              value={(config.routing?.fallbackOrder || []).join(', ')}
              onChange={(e) => setIn('routing', 'fallbackOrder', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
        {toggle('routing', 'escalateToUnassigned', 'Park a job in the unassigned queue instead of retrying forever')}
        {saveButton('routing')}
      </CardShell>

      <CardShell icon={FiSettings} title="SLA">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">How often deadlines are checked (cron)</span>
            <input
              type="text"
              value={config.sla?.checkCron || ''}
              onChange={(e) => setIn('sla', 'checkCron', e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </label>
          <div className="flex items-end">{toggle('sla', 'breachNotificationsEnabled', 'Announce SLA breaches')}</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Profile</th>
                <th className="py-2 pr-4">Assignment</th>
                <th className="py-2 pr-4">Acceptance</th>
                <th className="py-2 pr-4">Arrival</th>
                <th className="py-2 pr-4">Response</th>
                <th className="py-2 pr-4">Resolution</th>
                <th className="py-2">Default</th>
              </tr>
            </thead>
            <tbody>
              {(config.sla?.profiles || []).map((p, i) => (
                <tr key={p.name} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-semibold text-gray-800">{p.name}</td>
                  {['assignmentMinutes', 'acceptanceMinutes', 'arrivalMinutes', 'responseMinutes', 'resolutionMinutes'].map((k) => (
                    <td key={k} className="py-2 pr-4">
                      <input
                        type="number"
                        value={p[k] ?? ''}
                        onChange={(e) => {
                          const next = [...config.sla.profiles];
                          next[i] = { ...p, [k]: Number(e.target.value) };
                          setIn('sla', 'profiles', next);
                        }}
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
                      />
                    </td>
                  ))}
                  <td className="py-2">{p.isDefault ? 'yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {saveButton('sla')}
      </CardShell>

      <CardShell icon={FiSettings} title="Payments and wallet">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {num('payments', 'minimumWalletBalance', 'Minimum wallet balance')}
          {num('payments', 'lowBalanceThreshold', 'Warn the company below')}
          {num('payments', 'defaultTaxPercent', 'Default tax %')}
          {num('payments', 'platformFeePercent', 'Platform fee % (settlements)')}
        </div>
        <div className="mt-3 space-y-2">
          {toggle('payments', 'reservationRequired', 'Reserve the full cost of an upload before any job is created')}
          {toggle('payments', 'demoPaymentsEnabled', 'Allow demo companies to top up with simulated money')}
        </div>

        <p className="text-[11px] font-semibold text-gray-500 mt-5 mb-2">Top-up methods offered to companies</p>
        <div className="space-y-2">
          {(config.payments?.topUpMethods || []).map((m, i) => (
            <div key={m.key} className="flex flex-wrap items-center gap-3 border border-gray-100 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={m.enabled !== false}
                onChange={(e) => {
                  const next = [...config.payments.topUpMethods];
                  next[i] = { ...m, enabled: e.target.checked };
                  setIn('payments', 'topUpMethods', next);
                }}
              />
              <span className="text-sm font-semibold text-gray-800 w-48">{m.label}</span>
              <span className="text-[11px] text-gray-400 font-mono">{m.key}</span>
              <label className="text-[11px] text-gray-500">
                min
                <input
                  type="number"
                  value={m.minAmount ?? 0}
                  onChange={(e) => {
                    const next = [...config.payments.topUpMethods];
                    next[i] = { ...m, minAmount: Number(e.target.value) };
                    setIn('payments', 'topUpMethods', next);
                  }}
                  className="ml-1 w-24 border border-gray-200 rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="text-[11px] text-gray-500 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(m.requiresApproval)}
                  onChange={(e) => {
                    const next = [...config.payments.topUpMethods];
                    next[i] = { ...m, requiresApproval: e.target.checked };
                    setIn('payments', 'topUpMethods', next);
                  }}
                />
                needs finance approval
              </label>
            </div>
          ))}
        </div>
        {saveButton('payments')}
      </CardShell>

      <CardShell icon={FiSettings} title="Bulk upload and business hours">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {num('bulkUpload', 'maxRows', 'Maximum rows per file')}
          {num('bulkUpload', 'maxFileSizeMb', 'Maximum file size (MB)')}
          {num('bulkUpload', 'duplicateWindowDays', 'Duplicate check window (days)')}
        </div>
        <div className="mt-3 space-y-2">
          {toggle('bulkUpload', 'rejectUnknownColumns', 'Reject a file that carries columns the template does not define')}
          {toggle('bulkUpload', 'duplicateCheckEnabled', 'Check new rows against open jobs')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Business hours start</span>
            <input
              type="time"
              value={config.businessHours?.start || '09:00'}
              onChange={(e) => setIn('businessHours', 'start', e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Business hours end</span>
            <input
              type="time"
              value={config.businessHours?.end || '18:00'}
              onChange={(e) => setIn('businessHours', 'end', e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-500">Working days (0 = Sunday)</span>
            <input
              type="text"
              value={(config.businessHours?.workingDays || []).join(', ')}
              onChange={(e) => setIn('businessHours', 'workingDays', e.target.value.split(',').map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v)))}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex gap-3">
          {saveButton('bulkUpload')}
          {saveButton('businessHours')}
        </div>
      </CardShell>
    </div>
  );
};

export default B2BSettings;
