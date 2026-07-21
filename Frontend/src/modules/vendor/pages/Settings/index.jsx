import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, Building2, CreditCard, Lock, LogOut, Plug, Save, Settings as SettingsIcon, Users, Video } from 'lucide-react';
import { fetchVendorSettings, updateVendorSettings } from '../../services/globalModulesService';
import useVendorLogout from '../../hooks/useVendorLogout';
import VendorLogoutConfirm from '../../components/VendorLogoutConfirm';
import { useVendorConfig } from '../../context/VendorConfigContext';

const sectionConfig = [
  { key: 'registered', label: 'Your Services', icon: Briefcase },
  { key: 'company', label: 'Company Profile', icon: Building2 },
  { key: 'team', label: 'Team Settings', icon: Users },
  { key: 'services', label: 'Service Settings', icon: SettingsIcon },
  { key: 'finance', label: 'Finance Settings', icon: CreditCard },
  { key: 'notifications', label: 'Notifications', icon: SettingsIcon },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'integrations', label: 'Integrations', icon: Plug }
];

const statusBadge = (status) => {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const Toggle = ({ label, checked, onChange }) => (
  <button type="button" onClick={onChange} className="flex items-center justify-between w-full p-3 text-left bg-gray-50 rounded-lg">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <span className={`w-10 h-5 rounded-full p-0.5 transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

const RegisteredServicesPanel = ({ services = [] }) => {
  const list = (services || []).filter((s) => s.status !== 'suspended');
  if (!list.length) {
    return (
      <div className="p-6 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
        <Briefcase className="w-10 h-10 mx-auto text-gray-300" />
        <p className="mt-2 text-sm font-medium text-gray-800">No registered services yet</p>
        <p className="mt-1 text-xs text-gray-500">Complete project service selection during onboarding, or ask admin to approve a service.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Your Registered Services</h2>
        <p className="text-sm text-gray-500">Live from your vendor profile — drives dashboard KPIs, intake matching, and project milestones.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {list.map((svc) => (
          <div key={svc.categoryCode} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                  <Video className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{svc.categoryName}</h3>
                  <p className="text-xs font-mono text-gray-400">{svc.categoryCode}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border ${statusBadge(svc.status)}`}>
                {svc.status || 'pending'}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {(svc.subServices || []).length ? (svc.subServices || []).map((sub) => (
                <li key={sub} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                  {sub}
                </li>
              )) : (
                <li className="text-xs text-gray-400">No sub-services selected</li>
              )}
            </ul>
            {svc.approvedAt && (
              <p className="mt-3 text-[11px] text-gray-400">
                Approved {new Date(svc.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const Settings = () => {
  const { approvedServices = [], refetchConfig } = useVendorConfig() || {};
  const [settings, setSettings] = useState(null);
  const [active, setActive] = useState('registered');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { loggingOut, confirmOpen, openConfirm, closeConfirm, confirmLogout } = useVendorLogout();

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
  useEffect(() => {
    // Keep services fresh when admin approves via socket/window events
    const refresh = () => { refetchConfig?.(); };
    window.addEventListener('vendor-service-approved', refresh);
    window.addEventListener('vendor-service-suspended', refresh);
    return () => {
      window.removeEventListener('vendor-service-approved', refresh);
      window.removeEventListener('vendor-service-suspended', refresh);
    };
  }, [refetchConfig]);

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
    if (active === 'registered') {
      return <RegisteredServicesPanel services={approvedServices} />;
    }
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
      const services = Array.isArray(settings.serviceSettings) ? settings.serviceSettings : [];
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.length === 0 ? (
            <p className="text-sm text-gray-500">No service settings configured yet.</p>
          ) : services.map((service, idx) => (
            <div key={service.serviceCategoryCode || service._id || idx} className="p-4 border border-gray-200 rounded-xl">
              <h3 className="font-bold text-gray-900">{service.serviceCategoryName || service.serviceCategoryCode || 'Service'}</h3>
              <p className="mt-1 text-xs text-gray-500">Coverage: {(service.coverageAreas || []).join(', ') || '—'}</p>
              <p className="mt-1 text-xs text-gray-500">Pricing: {service.pricingModel || '—'} · Hours: {service.workingHours || '—'}</p>
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
      const devices = (s.devices || []).map((d) => (typeof d === 'string' ? d : d?.name)).filter(Boolean);
      const tokens = (s.apiTokens || []).map((t) => (typeof t === 'string' ? t : t?.label)).filter(Boolean);
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Toggle label="2FA Enabled" checked={Boolean(s.twoFactorEnabled)} onChange={() => updatePath('security.twoFactorEnabled', !s.twoFactorEnabled)} />
            <div className="p-4 bg-gray-50 rounded-xl"><p className="text-2xl font-bold">{s.activeSessions || 0}</p><p className="text-xs text-gray-500">Active Sessions</p></div>
            <InfoList title="Devices" items={devices} />
            <InfoList title="API Tokens" items={tokens} />
          </div>
          <div className="p-4 border border-red-100 bg-red-50/60 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-800">Sign out of this device</p>
              <p className="text-xs text-red-700/80 mt-0.5">Ends your session, clears tokens, and stops push notifications on this device.</p>
            </div>
            <button
              type="button"
              onClick={openConfirm}
              disabled={loggingOut}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 shrink-0"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
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
        <button onClick={save} disabled={saving || active === 'registered'} className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-60 ${active === 'registered' ? 'invisible' : ''}`}><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}</button>
      </div>

      {loading && active !== 'registered' ? <div className="h-72 bg-white border border-gray-200 rounded-xl animate-pulse" /> : (
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

      <VendorLogoutConfirm
        open={confirmOpen}
        loggingOut={loggingOut}
        onCancel={closeConfirm}
        onConfirm={confirmLogout}
      />
    </div>
  );
};

const InfoList = ({ title, items = [] }) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <p className="mb-2 text-sm font-semibold text-gray-800">{title}</p>
      <div className="flex flex-wrap gap-2">
        {list.length ? list.map((item, i) => (
          <span key={`${item}-${i}`} className="px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded-full">{String(item)}</span>
        )) : (
          <span className="text-xs text-gray-400">No values</span>
        )}
      </div>
    </div>
  );
};

export default Settings;
