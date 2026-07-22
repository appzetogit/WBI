import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  Bell,
  CreditCard,
  Lock,
  LogOut,
  Plug,
  Save,
  Settings as SettingsIcon,
  Users,
  Video
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { fetchVendorSettings, updateVendorSettings } from '../../services/globalModulesService';
import useVendorLogout from '../../hooks/useVendorLogout';
import VendorLogoutConfirm from '../../components/VendorLogoutConfirm';
import { useVendorConfig } from '../../context/VendorConfigContext';

const ICON_MAP = {
  briefcase: Briefcase,
  building: Building2,
  users: Users,
  settings: SettingsIcon,
  'credit-card': CreditCard,
  bell: Bell,
  lock: Lock,
  plug: Plug
};

const statusBadge = (status) => {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};

const Toggle = ({ label, checked, onChange, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onChange}
    className={`flex items-center justify-between w-full p-3 text-left rounded-lg ${disabled ? 'bg-gray-100 opacity-70 cursor-not-allowed' : 'bg-gray-50'}`}
  >
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <span className={`w-10 h-5 rounded-full p-0.5 transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </button>
);

const InfoList = ({ title, items = [], editable, onChange }) => {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return (
    <div className="p-4 bg-gray-50 rounded-xl">
      <p className="mb-2 text-sm font-semibold text-gray-800">{title}</p>
      {editable ? (
        <textarea
          value={list.join(', ')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
          placeholder="Comma-separated values"
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.length ? (
            list.map((item, i) => (
              <span key={`${item}-${i}`} className="px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded-full">
                {String(item)}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400">No values</span>
          )}
        </div>
      )}
    </div>
  );
};

const RegisteredServicesPanel = ({ services = [], meta }) => {
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Your Registered Services</h2>
          <p className="text-sm text-gray-500">Live from your vendor profile — drives dashboard KPIs, intake matching, and project milestones.</p>
        </div>
        {meta?.uniqueCompanyCode ? (
          <span className="px-2 py-1 text-xs font-mono text-gray-600 bg-gray-100 rounded-md">{meta.uniqueCompanyCode}</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-md border bg-white">KYC: {meta?.kycStatus || '—'}</span>
        <span className="px-2 py-1 rounded-md border bg-white">Bank: {meta?.bankStatus || '—'}</span>
        <span className="px-2 py-1 rounded-md border bg-white">PAN: {meta?.panVerified ? 'verified' : 'pending'}</span>
        <span className="px-2 py-1 rounded-md border bg-white">GST: {meta?.gstVerified ? 'verified' : 'pending'}</span>
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
                  <p className="text-xs font-mono text-gray-500 break-all">{svc.categoryCode}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border ${statusBadge(svc.status)}`}>
                {svc.status || 'pending'}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {(svc.subServices || []).length ? (
                (svc.subServices || []).map((sub) => (
                  <li key={sub} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                    {sub}
                  </li>
                ))
              ) : (
                <li className="text-xs text-gray-400">No sub-services selected</li>
              )}
            </ul>
            {svc.approvedAt && (
              <p className="mt-3 text-[11px] text-gray-400">
                Approved{' '}
                {new Date(svc.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
  const [payload, setPayload] = useState(null);
  const [active, setActive] = useState('registered');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { loggingOut, confirmOpen, openConfirm, closeConfirm, confirmLogout } = useVendorLogout();

  const moduleConfig = payload?.moduleConfig || {};
  const settings = payload || {};
  const meta = payload?.meta || {};

  const sections = useMemo(() => {
    const list = (moduleConfig.sections || []).filter((s) => !s.adminOnly);
    return list.length
      ? list
      : [
          { key: 'registered', label: 'Your Services', icon: 'briefcase', vendorCanEdit: false },
          { key: 'company', label: 'Company Profile', icon: 'building', vendorCanEdit: true }
        ];
  }, [moduleConfig.sections]);

  useEffect(() => {
    if (!sections.find((s) => s.key === active) && sections[0]) setActive(sections[0].key);
  }, [sections, active]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVendorSettings();
      setPayload(res.data.data || {});
    } catch {
      setPayload({});
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      refetchConfig?.();
      load();
    };
    window.addEventListener('vendor-service-approved', refresh);
    window.addEventListener('vendor-service-suspended', refresh);
    return () => {
      window.removeEventListener('vendor-service-approved', refresh);
      window.removeEventListener('vendor-service-suspended', refresh);
    };
  }, [refetchConfig, load]);

  const updatePath = (path, value) => {
    setPayload((current) => {
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

  const activeSection = sections.find((s) => s.key === active);
  const canEditSection = activeSection?.vendorCanEdit !== false && active !== 'registered';

  const save = async () => {
    if (!canEditSection) return;
    setSaving(true);
    try {
      const body = {
        companyProfile: settings.companyProfile,
        teamSettings: settings.teamSettings,
        financeSettings: settings.financeSettings,
        notificationSettings: settings.notificationSettings,
        security: { twoFactorEnabled: settings.security?.twoFactorEnabled },
        integrations: settings.integrations,
        serviceSettings: settings.serviceSettings
      };
      const res = await updateVendorSettings(body);
      setPayload(res.data.data || {});
      toast.success('Settings saved');
      refetchConfig?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const servicesForPanel = meta.approvedServices?.length ? meta.approvedServices : approvedServices;

  const render = () => {
    if (active === 'registered') {
      return <RegisteredServicesPanel services={servicesForPanel} meta={meta} />;
    }
    if (!payload) return null;

    if (active === 'company') {
      const fields = moduleConfig.companyFields || [];
      const p = settings.companyProfile || {};
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((field) => {
            const locked = field.adminLocked || field.vendorEditable === false;
            return (
              <label key={field.key} className="text-sm font-medium text-gray-700">
                <span className="flex items-center gap-2">
                  {field.label}
                  {locked ? <span className="text-[10px] uppercase text-amber-600">Admin locked</span> : null}
                </span>
                <input
                  value={p[field.key] || ''}
                  disabled={locked}
                  onChange={(e) => updatePath(`companyProfile.${field.key}`, e.target.value)}
                  className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg disabled:bg-gray-50"
                />
              </label>
            );
          })}
        </div>
      );
    }

    if (active === 'team') {
      const t = settings.teamSettings || {};
      const editable = activeSection?.vendorCanEdit !== false;
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoList title="Departments" items={t.departments} editable={editable} onChange={(v) => updatePath('teamSettings.departments', v)} />
          <InfoList title="Roles" items={t.roles} editable={editable} onChange={(v) => updatePath('teamSettings.roles', v)} />
          <InfoList title="Permissions" items={t.permissions} editable={editable} onChange={(v) => updatePath('teamSettings.permissions', v)} />
          <Toggle
            label="Invitations Enabled"
            checked={t.invitationsEnabled !== false}
            onChange={() => updatePath('teamSettings.invitationsEnabled', !t.invitationsEnabled)}
            disabled={!editable}
          />
        </div>
      );
    }

    if (active === 'services') {
      const services = Array.isArray(settings.serviceSettings) ? settings.serviceSettings : [];
      const fields = moduleConfig.serviceSettingFields || [];
      if (!services.length) return <p className="text-sm text-gray-500">No service settings configured yet.</p>;
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.map((service, idx) => (
            <div key={service.serviceCategoryCode || idx} className="p-4 border border-gray-200 rounded-xl space-y-3">
              <div>
                <h3 className="font-bold text-gray-900">{service.serviceCategoryName || service.serviceCategoryCode || 'Service'}</h3>
                <p className="text-xs font-mono text-gray-400">{service.serviceCategoryCode}</p>
              </div>
              {fields.map((field) => {
                if (field.type === 'boolean') {
                  return (
                    <Toggle
                      key={field.key}
                      label={field.label}
                      checked={Boolean(service[field.key])}
                      disabled={field.vendorEditable === false}
                      onChange={() => {
                        const next = [...services];
                        next[idx] = { ...next[idx], [field.key]: !next[idx][field.key] };
                        updatePath('serviceSettings', next);
                      }}
                    />
                  );
                }
                if (field.type === 'tags') {
                  return (
                    <label key={field.key} className="block text-sm font-medium text-gray-700">
                      {field.label}
                      <input
                        value={(service[field.key] || []).join(', ')}
                        disabled={field.vendorEditable === false}
                        onChange={(e) => {
                          const next = [...services];
                          next[idx] = {
                            ...next[idx],
                            [field.key]: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          };
                          updatePath('serviceSettings', next);
                        }}
                        className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg disabled:bg-gray-50"
                      />
                    </label>
                  );
                }
                return (
                  <label key={field.key} className="block text-sm font-medium text-gray-700">
                    {field.label}
                    <input
                      value={service[field.key] || ''}
                      disabled={field.vendorEditable === false}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...next[idx], [field.key]: e.target.value };
                        updatePath('serviceSettings', next);
                      }}
                      className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg disabled:bg-gray-50"
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      );
    }

    if (active === 'finance') {
      const f = settings.financeSettings || {};
      const fields = moduleConfig.financeFields || [];
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoList title="Payment Methods" items={f.paymentMethods} />
            <InfoList
              title="Bank Accounts"
              items={(f.bankAccounts || []).map((b) => `${b.bank || ''} ${b.accountMasked || ''}${b.primary ? ' (Primary)' : ''}`.trim())}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((field) => {
              const locked = field.adminLocked || field.vendorEditable === false;
              const value = f[field.key];
              if (field.type === 'boolean') {
                return (
                  <Toggle
                    key={field.key}
                    label={field.label}
                    checked={Boolean(value)}
                    disabled={locked}
                    onChange={() => updatePath(`financeSettings.${field.key}`, !value)}
                  />
                );
              }
              return (
                <label key={field.key} className="text-sm font-medium text-gray-700">
                  <span className="flex items-center gap-2">
                    {field.label}
                    {locked ? <span className="text-[10px] uppercase text-amber-600">Admin locked</span> : null}
                  </span>
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={value ?? ''}
                    disabled={locked}
                    onChange={(e) =>
                      updatePath(
                        `financeSettings.${field.key}`,
                        field.type === 'number' ? Number(e.target.value) : e.target.value
                      )
                    }
                    className="block w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg disabled:bg-gray-50"
                  />
                </label>
              );
            })}
          </div>
          {meta.globalFinance ? (
            <div className="grid grid-cols-2 gap-3 p-3 text-xs text-gray-600 border border-gray-100 rounded-xl md:grid-cols-4 bg-gray-50">
              <div>Service GST: {meta.globalFinance.serviceGstPercentage}%</div>
              <div>Parts GST: {meta.globalFinance.partsGstPercentage}%</div>
              <div>Service payout: {meta.globalFinance.servicePayoutPercentage}%</div>
              <div>TDS: {meta.globalFinance.tdsPercentage}%</div>
            </div>
          ) : null}
        </div>
      );
    }

    if (active === 'notifications') {
      const n = settings.notificationSettings || {};
      const channels = moduleConfig.notificationChannels || [];
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {channels.map((ch) => (
            <Toggle
              key={ch.key}
              label={ch.label}
              checked={Boolean(n[ch.key])}
              disabled={ch.vendorEditable === false}
              onChange={() => updatePath(`notificationSettings.${ch.key}`, !n[ch.key])}
            />
          ))}
        </div>
      );
    }

    if (active === 'security') {
      const s = settings.security || {};
      const policy = moduleConfig.securityPolicy || {};
      const devices = (s.devices || []).map((d) => (typeof d === 'string' ? d : d?.name)).filter(Boolean);
      const tokens = (s.apiTokens || []).map((t) => (typeof t === 'string' ? t : t?.label)).filter(Boolean);
      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {policy.allowVendorToggle2fa !== false ? (
              <Toggle
                label="2FA Enabled"
                checked={Boolean(s.twoFactorEnabled)}
                onChange={() => updatePath('security.twoFactorEnabled', !s.twoFactorEnabled)}
              />
            ) : null}
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold">{s.activeSessions || 0}</p>
              <p className="text-xs text-gray-500">Active Sessions</p>
            </div>
            {policy.showDevices !== false ? <InfoList title="Devices" items={devices} /> : null}
            {policy.showApiTokens !== false ? <InfoList title="API Tokens" items={tokens} /> : null}
          </div>
          {policy.allowSignOut !== false ? (
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
          ) : null}
        </div>
      );
    }

    if (active === 'integrations') {
      const integrations = settings.integrations || {};
      const providers = moduleConfig.integrationProviders || [];
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {providers.map((p) => (
            <Toggle
              key={p.key}
              label={p.label}
              checked={Boolean(integrations[p.key])}
              disabled={p.vendorEditable === false || p.adminManaged}
              onChange={() => updatePath(`integrations.${p.key}`, !integrations[p.key])}
            />
          ))}
          {!providers.length ? <p className="text-sm text-gray-500">No integrations configured by admin.</p> : null}
        </div>
      );
    }

    return <p className="text-sm text-gray-500">This section is not available.</p>;
  };

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl">
              <SettingsIcon className="w-5 h-5 text-white" />
            </span>
            Settings
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">
            Vendor account, services, finance, security and integrations — driven by admin configuration.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !canEditSection}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-60 ${!canEditSection ? 'invisible' : ''}`}
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="h-72 bg-white border border-gray-200 rounded-xl animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          <div className="p-2 bg-white border border-gray-200 rounded-xl shadow-sm">
            {sections.map((section) => {
              const Icon = ICON_MAP[section.icon] || SettingsIcon;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActive(section.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${
                    active === section.key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {section.label}
                </button>
              );
            })}
          </div>
          <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm lg:col-span-3">{render()}</div>
        </div>
      )}

      <VendorLogoutConfirm open={confirmOpen} loggingOut={loggingOut} onCancel={closeConfirm} onConfirm={confirmLogout} />
    </div>
  );
};

export default Settings;
