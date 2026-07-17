import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CreditCard, Lock, Plug, Save, Settings as SettingsIcon, Users } from 'lucide-react';
import { fetchVendorSettings, updateVendorSettings } from '../../services/globalModulesService';

const sectionConfig = [
  { key: 'company', label: 'Company Profile', icon: Building2 },
  { key: 'team', label: 'Team Settings', icon: Users },
  { key: 'services', label: 'Service Settings', icon: SettingsIcon },
  { key: 'finance', label: 'Finance Settings', icon: CreditCard },
  { key: 'notifications', label: 'Notifications', icon: SettingsIcon },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'integrations', label: 'Integrations', icon: Plug }
];

const Toggle = ({ label, checked, onChange }) => (
  <button type="button" onClick={onChange} className="flex items-center justify-between w-full p-3 text-left bg-gray-50 rounded-lg">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <span className={`w-10 h-5 rounded-full p-0.5 transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

const Settings = () => {
  const [settings, setSettings] = useState(null);
  const [active, setActive] = useState('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVendorSettings();
      setSettings(res.data.data || {});
    } catch {
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updatePath = (path, value) => {
    setSettings((current) => {
      const next = structuredClone(current || {});
      let ref = next;
      const keys = path.split('.');
      keys.slice(0, -1).forEach((key) => {
        ref[key] = ref[key] || {};
        ref = ref[key];
      });
      ref[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateVendorSettings(settings || {});
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const render = () => {
    if (!settings) return null;
    if (active === 'company') {
      const p = settings.companyProfile || {};
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            ['Company Name', 'companyName'],
            ['GST', 'gst'],
            ['PAN', 'pan'],
            ['Address', 'address'],
            ['Website', 'website']
          ].map(([label, key]) => (
            <label key={key} className="text-sm font-medium text-gray-700">
              {label}
              <input value={p[key] || ''} onChange={(e) => updatePath(`companyProfile.${key}`, e.target.value)} className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg" />
            </label>
          ))}
        </div>
      );
    }
    if (active === 'team') {
      const t = settings.teamSettings || {};
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoList title="Departments" items={t.departments} />
          <InfoList title="Roles" items={t.roles} />
          <InfoList title="Permissions" items={t.permissions} />
          <Toggle label="Invitations Enabled" checked={t.invitationsEnabled !== false} onChange={() => updatePath('teamSettings.invitationsEnabled', !t.invitationsEnabled)} />
        </div>
      );
    }
    if (active === 'services') {
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(settings.serviceSettings || []).map((service) => (
            <div key={service.serviceCategoryCode} className="p-4 border border-gray-200 rounded-xl">
              <h3 className="font-bold text-gray-900">{service.serviceCategoryName}</h3>
              <p className="mt-1 text-xs text-gray-500">Coverage: {service.coverageAreas?.join(', ')}</p>
              <p className="mt-1 text-xs text-gray-500">Pricing: {service.pricingModel} · Hours: {service.workingHours}</p>
              <span className={`inline-flex mt-3 text-xs px-2 py-1 rounded-full ${service.emergencyAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                Emergency {service.emergencyAvailable ? 'available' : 'off'}
              </span>
            </div>
          ))}
        </div>
      );
    }
    if (active === 'finance') {
      const f = settings.financeSettings || {};
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoList title="Payment Methods" items={f.paymentMethods} />
          <InfoList title="Bank Accounts" items={(f.bankAccounts || []).map((b) => `${b.bank} ${b.accountMasked}${b.primary ? ' (Primary)' : ''}`)} />
          <label className="text-sm font-medium text-gray-700">Invoice Prefix<input value={f.invoicePrefix || ''} onChange={(e) => updatePath('financeSettings.invoicePrefix', e.target.value)} className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg" /></label>
          <label className="text-sm font-medium text-gray-700">Commission %<input type="number" value={f.commissionPercent || 0} onChange={(e) => updatePath('financeSettings.commissionPercent', Number(e.target.value))} className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg" /></label>
        </div>
      );
    }
    if (active === 'notifications') {
      const n = settings.notificationSettings || {};
      return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{['email', 'sms', 'push', 'whatsapp', 'marketing', 'systemAlerts'].map((key) => <Toggle key={key} label={key.replace(/([A-Z])/g, ' $1')} checked={Boolean(n[key])} onChange={() => updatePath(`notificationSettings.${key}`, !n[key])} />)}</div>;
    }
    if (active === 'security') {
      const s = settings.security || {};
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Toggle label="2FA Enabled" checked={Boolean(s.twoFactorEnabled)} onChange={() => updatePath('security.twoFactorEnabled', !s.twoFactorEnabled)} />
          <div className="p-4 bg-gray-50 rounded-xl"><p className="text-2xl font-bold">{s.activeSessions || 0}</p><p className="text-xs text-gray-500">Active Sessions</p></div>
          <InfoList title="Devices" items={(s.devices || []).map((d) => d.name)} />
          <InfoList title="API Tokens" items={(s.apiTokens || []).map((t) => t.label)} />
        </div>
      );
    }
    const integrations = settings.integrations || {};
    return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{['googleMaps', 'paymentGateway', 'smsProvider', 'cloudStorage', 'email'].map((key) => <Toggle key={key} label={key.replace(/([A-Z])/g, ' $1')} checked={Boolean(integrations[key])} onChange={() => updatePath(`integrations.${key}`, !integrations[key])} />)}</div>;
  };

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><SettingsIcon className="w-5 h-5 text-white" /></span>
            Settings
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">Vendor account, services, finance, security and integrations read dynamically by every module.</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-60"><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}</button>
      </div>

      {loading ? <div className="h-72 bg-white border border-gray-200 rounded-xl animate-pulse" /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          <div className="p-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            {sectionConfig.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActive(key)} className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${active === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm lg:col-span-3">{render()}</div>
        </div>
      )}
    </div>
  );
};

const InfoList = ({ title, items = [] }) => (
  <div className="p-4 bg-gray-50 rounded-xl">
    <p className="mb-2 text-sm font-semibold text-gray-800">{title}</p>
    <div className="flex flex-wrap gap-2">{items.length ? items.map((item) => <span key={item} className="px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded-full">{item}</span>) : <span className="text-xs text-gray-400">No values</span>}</div>
  </div>
);

export default Settings;
