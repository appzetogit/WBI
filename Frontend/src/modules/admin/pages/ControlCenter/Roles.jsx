import React, { useState } from 'react';
import api from '../../../../services/api';
import { Page, Card, Badge, Loading, ErrorBox, Button, Table } from './ui';
import { useApi, act, inputCls } from './helpers';

const group = (catalog) => Object.entries(catalog).reduce((acc, [key, label]) => {
  const g = key.split('.')[0];
  (acc[g] = acc[g] || []).push([key, label]);
  return acc;
}, {});

/** Edit each role's permissions and assign roles / extra grants to admins. */
const Roles = () => {
  const roles = useApi('/admin/rbac/roles');
  const admins = useApi('/admin/admins');
  const [editing, setEditing] = useState('admin');
  const [drafts, setDrafts] = useState({});
  const catalog = roles.data?.catalog || {};
  const current = roles.data?.roles?.find((r) => r.key === editing);
  const draft = drafts[editing] || current?.permissions || [];
  const toggle = (k) => setDrafts((all) => ({ ...all, [editing]: draft.includes(k) ? draft.filter((x) => x !== k) : [...draft, k] }));
  const adminList = admins.raw?.data || admins.raw?.admins || [];

  if (roles.loading) return <Loading />;
  if (roles.error) return <ErrorBox error={roles.error} onRetry={roles.reload} />;
  return (
    <Page title="Roles & Permissions" subtitle="The API enforces these — hiding a menu item is not the only control.">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Roles">
          <div className="space-y-1.5">
            {roles.data.roles.map((r) => (
              <button key={r.key} type="button" onClick={() => setEditing(r.key)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${editing === r.key ? 'border-teal-400 bg-teal-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                <div className="font-bold">{r.label}</div>
                <div className="text-[11px] text-gray-400">{r.permissions.includes('*') ? 'All permissions' : `${r.permissions.length} permissions`}{r.isDefault ? ' · default' : ' · customised'}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card title={current ? `${current.label} permissions` : 'Permissions'} className="lg:col-span-2"
          right={editing !== 'super_admin' && <Button onClick={async () => { if (await act(() => api.put(`/admin/rbac/roles/${editing}`, { label: current.label, permissions: draft }), 'Saved')) roles.reload(); }}>Save role</Button>}>
          {editing === 'super_admin' ? <p className="text-sm text-gray-500">Super Admin always has every permission.</p> : (
            <div className="grid sm:grid-cols-2 gap-4">
              {Object.entries(group(catalog)).map(([g, items]) => (
                <div key={g}>
                  <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">{g}</div>
                  {items.map(([k, label]) => (
                    <label key={k} className="flex items-start gap-2 text-sm py-0.5">
                      <input type="checkbox" checked={draft.includes(k)} onChange={() => toggle(k)} className="mt-1" />
                      <span><span className="font-mono text-xs text-gray-500">{k}</span><br />{label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Card title="Admins">
        {admins.loading ? <Loading /> : (
          <Table rows={adminList} columns={[
            { key: 'name', label: 'Name', render: (a) => <div>{a.name}<div className="text-[11px] text-gray-400">{a.email}</div></div> },
            { key: 'role', label: 'Role', render: (a) => (
              <select defaultValue={a.role} className={`${inputCls} max-w-[200px]`}
                onChange={async (e) => { if (await act(() => api.put(`/admin/rbac/admins/${a._id || a.id}`, { role: e.target.value }), 'Role updated')) admins.reload(); }}>
                {roles.data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>) },
            { key: 'isActive', label: 'Status', render: (a) => <Badge tone={a.isActive === false ? 'red' : 'green'}>{a.isActive === false ? 'inactive' : 'active'}</Badge> }
          ]} />
        )}
      </Card>
    </Page>
  );
};

export default Roles;
