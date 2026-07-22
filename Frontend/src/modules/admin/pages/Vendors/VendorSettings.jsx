import React, { useCallback, useEffect, useState } from 'react';
import { FiSave, FiPlus, FiTrash2, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminVendorSettingsService from '../../../../services/adminVendorSettingsService';

const LIST_SECTIONS = [
  ['sections', 'Portal Sections'],
  ['companyFields', 'Company Fields'],
  ['financeFields', 'Finance Fields'],
  ['notificationChannels', 'Notification Channels'],
  ['integrationProviders', 'Integrations'],
  ['serviceSettingFields', 'Service Setting Fields']
];

const emptyItem = (section) => {
  if (section === 'sections') {
    return {
      key: `section_${Date.now()}`,
      label: 'New Section',
      icon: 'settings',
      description: '',
      sortOrder: 99,
      isActive: true,
      vendorCanEdit: true,
      adminOnly: false
    };
  }
  if (section === 'companyFields' || section === 'financeFields') {
    return {
      key: `field_${Date.now()}`,
      label: 'New Field',
      path: section === 'financeFields' ? 'financeSettings.newField' : 'companyProfile.newField',
      type: 'text',
      vendorEditable: true,
      adminLocked: false,
      sortOrder: 99,
      isActive: true
    };
  }
  if (section === 'notificationChannels') {
    return { key: `channel_${Date.now()}`, label: 'New Channel', defaultEnabled: true, vendorEditable: true, sortOrder: 99, isActive: true };
  }
  if (section === 'integrationProviders') {
    return {
      key: `integration_${Date.now()}`,
      label: 'New Integration',
      defaultEnabled: false,
      adminManaged: true,
      vendorEditable: false,
      sortOrder: 99,
      isActive: true
    };
  }
  return { key: `item_${Date.now()}`, label: 'New Item', type: 'text', vendorEditable: true, sortOrder: 99, isActive: true };
};

const VendorSettingsAdmin = () => {
  const [section, setSection] = useState('sections');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminVendorSettingsService.getConfig();
      if (res.success) setConfig(res.data);
      else toast.error(res.message || 'Failed to load config');
    } catch {
      toast.error('Failed to load vendor settings config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await adminVendorSettingsService.saveConfig(config);
      if (res.success) {
        setConfig(res.data);
        toast.success('Vendor settings configuration saved');
      } else toast.error(res.message || 'Save failed');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const items = config?.[section] || [];

  const updateItem = (idx, patch) => {
    setConfig((c) => {
      const next = { ...c, [section]: [...(c[section] || [])] };
      next[section][idx] = { ...next[section][idx], ...patch };
      return next;
    });
  };

  const addItem = () => {
    setConfig((c) => ({ ...c, [section]: [...(c[section] || []), emptyItem(section)] }));
  };

  const removeItem = (idx) => {
    setConfig((c) => ({
      ...c,
      [section]: (c[section] || []).filter((_, i) => i !== idx)
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
        <FiLoader className="animate-spin" /> Loading settings module…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CardShell
        title="Vendor Settings Module"
        subtitle="Control portal sections, editable fields, notification channels and integrations. Vendor UI reads this config dynamically."
        actions={
          <button
            type="button"
            onClick={saveConfig}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-60"
          >
            <FiSave /> {saving ? 'Saving…' : 'Save Config'}
          </button>
        }
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {LIST_SECTIONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                section === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex justify-end mb-3">
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium">
            <FiPlus /> Add
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={`${item.key || idx}-${idx}`} className="grid grid-cols-1 gap-2 p-3 border border-gray-200 rounded-xl md:grid-cols-6 bg-gray-50/50">
              <input
                className="px-2 py-1.5 text-sm border rounded-lg md:col-span-1"
                value={item.key || ''}
                onChange={(e) => updateItem(idx, { key: e.target.value })}
                placeholder="key"
              />
              <input
                className="px-2 py-1.5 text-sm border rounded-lg md:col-span-2"
                value={item.label || ''}
                onChange={(e) => updateItem(idx, { label: e.target.value })}
                placeholder="label"
              />
              <input
                className="px-2 py-1.5 text-sm border rounded-lg md:col-span-1"
                type="number"
                value={item.sortOrder ?? 0}
                onChange={(e) => updateItem(idx, { sortOrder: Number(e.target.value) })}
                placeholder="order"
              />
              <label className="flex items-center gap-2 text-xs text-gray-600 md:col-span-1">
                <input type="checkbox" checked={item.isActive !== false} onChange={(e) => updateItem(idx, { isActive: e.target.checked })} />
                Active
              </label>
              <div className="flex items-center justify-between gap-2 md:col-span-1">
                {'vendorCanEdit' in item || 'vendorEditable' in item ? (
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={item.vendorCanEdit !== false && item.vendorEditable !== false}
                      onChange={(e) => {
                        if ('vendorCanEdit' in item) updateItem(idx, { vendorCanEdit: e.target.checked });
                        else updateItem(idx, { vendorEditable: e.target.checked });
                      }}
                    />
                    Vendor edit
                  </label>
                ) : (
                  <span />
                )}
                <button type="button" onClick={() => removeItem(idx)} className="text-red-500 p-1">
                  <FiTrash2 />
                </button>
              </div>
              {item.path != null ? (
                <input
                  className="px-2 py-1.5 text-sm border rounded-lg md:col-span-3"
                  value={item.path || ''}
                  onChange={(e) => updateItem(idx, { path: e.target.value })}
                  placeholder="path"
                />
              ) : null}
              {item.description != null ? (
                <input
                  className="px-2 py-1.5 text-sm border rounded-lg md:col-span-3"
                  value={item.description || ''}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  placeholder="description"
                />
              ) : null}
              {'adminLocked' in item ? (
                <label className="flex items-center gap-2 text-xs text-gray-600 md:col-span-2">
                  <input type="checkbox" checked={Boolean(item.adminLocked)} onChange={(e) => updateItem(idx, { adminLocked: e.target.checked })} />
                  Admin locked
                </label>
              ) : null}
              {'adminManaged' in item ? (
                <label className="flex items-center gap-2 text-xs text-gray-600 md:col-span-2">
                  <input type="checkbox" checked={Boolean(item.adminManaged)} onChange={(e) => updateItem(idx, { adminManaged: e.target.checked })} />
                  Admin managed
                </label>
              ) : null}
            </div>
          ))}
          {!items.length ? <p className="text-sm text-gray-500">No items — add one or save defaults from seed.</p> : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Team departments (comma-separated)
            <textarea
              className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
              rows={2}
              value={(config?.teamCatalog?.departments || []).join(', ')}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  teamCatalog: {
                    ...(c.teamCatalog || {}),
                    departments: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  }
                }))
              }
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Team roles
            <textarea
              className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
              rows={2}
              value={(config?.teamCatalog?.roles || []).join(', ')}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  teamCatalog: {
                    ...(c.teamCatalog || {}),
                    roles: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  }
                }))
              }
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Team permissions
            <textarea
              className="mt-1 w-full px-3 py-2 text-sm border rounded-lg"
              rows={2}
              value={(config?.teamCatalog?.permissions || []).join(', ')}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  teamCatalog: {
                    ...(c.teamCatalog || {}),
                    permissions: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  }
                }))
              }
            />
          </label>
        </div>
      </CardShell>
    </div>
  );
};

export default VendorSettingsAdmin;
