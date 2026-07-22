import React, { useCallback, useEffect, useState } from 'react';
import { FiHeadphones, FiLoader, FiDownload, FiSave, FiPlus, FiTrash2 } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminVendorSupportService from '../../../../services/adminVendorSupportService';

const SECTION_KEYS = [
  ['categories', 'Categories'],
  ['priorities', 'Priorities'],
  ['statuses', 'Statuses'],
  ['workflow', 'Workflow'],
  ['slaRules', 'SLA Rules'],
  ['assignmentRules', 'Assignment'],
  ['escalationMatrix', 'Escalation'],
  ['departments', 'Departments'],
  ['tags', 'Tags'],
  ['knowledgeBase', 'Knowledge Base'],
  ['notificationTemplates', 'Notifications'],
  ['rolePermissions', 'Permissions'],
  ['customFields', 'Custom Fields']
];

const emptyItem = (section) => {
  if (section === 'workflow') {
    return { from: 'open', to: 'assigned', action: 'assign', label: 'Assign', allowedRoles: ['admin', 'support_executive', 'manager'] };
  }
  if (section === 'slaRules') {
    return { code: `sla_${Date.now()}`, label: 'New SLA', priorityCode: 'medium', firstResponseMinutes: 60, resolutionMinutes: 1440, isActive: true };
  }
  if (section === 'escalationMatrix') {
    return { level: 1, afterMinutes: 60, escalateToRole: 'manager', notifyChannels: ['email', 'push'] };
  }
  if (section === 'rolePermissions') {
    return { role: 'vendor', canCreate: true, canComment: true, canClose: true, canReopen: true };
  }
  if (section === 'customFields') {
    return { key: `field_${Date.now()}`, label: 'New Field', type: 'text', required: false, isActive: true, options: [] };
  }
  if (section === 'knowledgeBase') {
    return { code: `kb_${Date.now()}`, title: 'New Article', summary: '', isActive: true, isPublic: true, sortOrder: 0 };
  }
  if (section === 'notificationTemplates') {
    return { code: `tpl_${Date.now()}`, event: 'ticket.updated', channel: 'email', subject: '', body: '', isActive: true };
  }
  if (section === 'assignmentRules') {
    return { code: `assign_${Date.now()}`, label: 'New Rule', priority: 0, match: {}, strategy: 'least_open', isActive: true };
  }
  if (section === 'departments') {
    return { code: `dept_${Date.now()}`, label: 'New Department', teamCodes: [], isActive: true };
  }
  return { code: `item_${Date.now()}`, label: 'New Item', isActive: true, sortOrder: 0, color: '#64748b' };
};

const VendorSupportAdmin = () => {
  const [tab, setTab] = useState('tickets');
  const [section, setSection] = useState('categories');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, tRes, aRes] = await Promise.all([
        adminVendorSupportService.getConfig(),
        adminVendorSupportService.listTickets({ page: 1, limit: 50 }),
        adminVendorSupportService.analytics()
      ]);
      if (cRes.success) setConfig(cRes.data);
      if (tRes.success) {
        setTickets(tRes.data || []);
        setStats(tRes.stats || []);
      }
      if (aRes.success) setAnalytics(aRes.data);
    } catch {
      toast.error('Failed to load vendor support module');
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
      const res = await adminVendorSupportService.saveConfig(config);
      if (res.success) {
        setConfig(res.data);
        toast.success('Support configuration saved');
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateListItem = (key, index, patch) => {
    setConfig((c) => {
      const list = [...(c[key] || [])];
      list[index] = { ...list[index], ...patch };
      return { ...c, [key]: list };
    });
  };

  const addItem = (key) => {
    setConfig((c) => ({ ...c, [key]: [...(c[key] || []), emptyItem(key)] }));
  };

  const removeItem = (key, index) => {
    setConfig((c) => ({ ...c, [key]: (c[key] || []).filter((_, i) => i !== index) }));
  };

  const transition = async (id, action) => {
    try {
      const res = await adminVendorSupportService.transition(id, { action });
      if (res.success) {
        toast.success('Ticket updated');
        load();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Transition failed');
    }
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <FiLoader className="animate-spin mr-2" /> Loading support module…
      </div>
    );
  }

  const list = config[section] || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[
          ['tickets', 'Tickets'],
          ['config', 'Configuration'],
          ['analytics', 'Analytics']
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              tab === key ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tickets' && (
        <CardShell icon={FiHeadphones} title="Vendor support tickets" subtitle="Lifecycle, assignment and SLA">
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => adminVendorSupportService.exportTickets().catch(() => toast.error('Export failed'))}
              className="inline-flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold"
            >
              <FiDownload /> Export CSV
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {stats.map((s) => (
              <div key={s._id} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase">{s._id}</p>
                <p className="text-xl font-bold">{s.count}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Code</th>
                  <th className="py-2">Subject</th>
                  <th className="py-2">Vendor</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Priority</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t._id} className="border-b border-gray-50">
                    <td className="py-2 font-mono text-xs">{t.ticketCode}</td>
                    <td className="py-2">{t.subject}</td>
                    <td className="py-2 text-xs">{t.vendorId?.businessName || t.vendorId?.name || '—'}</td>
                    <td className="py-2 capitalize">{t.status}</td>
                    <td className="py-2 capitalize">{t.priority}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {['assign', 'investigate', 'resolve', 'close'].map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => transition(t._id, a)}
                            className="px-2 py-1 text-[10px] border rounded"
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!tickets.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No tickets yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardShell>
      )}

      {tab === 'config' && (
        <CardShell icon={FiHeadphones} title="Support module configuration" subtitle="All vendor ticket UX is driven from here — no code deploys">
          <div className="flex flex-wrap gap-2 mb-4">
            {SECTION_KEYS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  section === key ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-gray-600">
              Editing <strong>{SECTION_KEYS.find((s) => s[0] === section)?.[1]}</strong> ({list.length} items)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addItem(section)}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-lg"
              >
                <FiPlus /> Add
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveConfig}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-[#0D8A72] rounded-lg disabled:opacity-50"
              >
                <FiSave /> {saving ? 'Saving…' : 'Save config'}
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {list.map((item, index) => (
              <div key={item.code || item.action || index} className="border rounded-xl p-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                {Object.keys(item)
                  .filter((k) => !['meta', 'match', 'options', 'memberAdminIds', 'notifyChannels', 'allowedRoles', 'appliesToCategories', 'appliesToServices', 'teamCodes', 'tags'].includes(k))
                  .slice(0, 6)
                  .map((k) => (
                    <label key={k} className="block">
                      <span className="text-[10px] uppercase text-gray-400">{k}</span>
                      {typeof item[k] === 'boolean' ? (
                        <input
                          type="checkbox"
                          className="ml-2"
                          checked={!!item[k]}
                          onChange={(e) => updateListItem(section, index, { [k]: e.target.checked })}
                        />
                      ) : (
                        <input
                          className="mt-0.5 w-full border rounded-lg px-2 py-1.5"
                          value={item[k] ?? ''}
                          onChange={(e) =>
                            updateListItem(section, index, {
                              [k]: typeof item[k] === 'number' ? Number(e.target.value) : e.target.value
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                <div className="md:col-span-4 flex justify-end">
                  <button type="button" onClick={() => removeItem(section, index)} className="text-red-600 p-2">
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
            {!list.length && <p className="text-center text-gray-500 py-6">No items — click Add</p>}
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 border-t pt-4">
            <label className="block text-sm">
              <span className="text-gray-600">Ticket prefix</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={config.ticketNumber?.prefix || ''}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, ticketNumber: { ...c.ticketNumber, prefix: e.target.value } }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Max attachments</span>
              <input
                type="number"
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={config.attachmentRules?.maxFiles || 5}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    attachmentRules: { ...c.attachmentRules, maxFiles: Number(e.target.value) }
                  }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Dashboard status codes (comma)</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2"
                value={(config.dashboardStatStatusCodes || []).join(',')}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    dashboardStatStatusCodes: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </label>
          </div>
        </CardShell>
      )}

      {tab === 'analytics' && analytics && (
        <CardShell icon={FiHeadphones} title="Support analytics">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase">Total</p>
              <p className="text-2xl font-bold">{analytics.sla?.total || 0}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase">SLA breached</p>
              <p className="text-2xl font-bold text-red-600">{analytics.sla?.breached || 0}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase">Avg response (min)</p>
              <p className="text-2xl font-bold">{Math.round(analytics.sla?.avgResponse || 0)}</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            {[
              ['By status', analytics.byStatus],
              ['By priority', analytics.byPriority],
              ['By category', analytics.byCategory]
            ].map(([title, rows]) => (
              <div key={title} className="border rounded-xl p-3">
                <h4 className="font-semibold mb-2">{title}</h4>
                {(rows || []).map((r) => (
                  <div key={r._id} className="flex justify-between py-1 border-b border-gray-50">
                    <span className="capitalize">{r._id || '—'}</span>
                    <span className="font-bold">{r.count}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardShell>
      )}
    </div>
  );
};

export default VendorSupportAdmin;
