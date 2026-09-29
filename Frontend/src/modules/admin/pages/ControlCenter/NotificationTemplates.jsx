import React, { useState } from 'react';
import api from '../../../../services/api';
import { Page, Card, Table, Badge, Loading, ErrorBox, Modal, Button, Field } from './ui';
import { useApi, act, inputCls } from './helpers';

const CHANNELS = ['in_app', 'push', 'email', 'sms', 'whatsapp'];

const Editor = ({ tpl, onClose, onSaved }) => {
  const o = tpl.override || {};
  const [enabled, setEnabled] = useState(o.enabled !== false);
  const [channels, setChannels] = useState(o.channels?.length ? o.channels : tpl.defaultChannels);
  const [title, setTitle] = useState(o.title || '');
  const [message, setMessage] = useState(o.message || '');
  return (
    <Modal title={tpl.eventKey} onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <p className="text-gray-500">Default title: <b>{tpl.defaultTitle}</b><br />Default message: <b>{tpl.defaultMessage}</b><br />
          Use the same <code>{'{{variables}}'}</code> in your text. Leave a field blank to keep the default.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send this notification</label>
        <Field label="Channels">
          <div className="flex flex-wrap gap-3">{CHANNELS.map((c) => (
            <label key={c} className="flex items-center gap-1.5"><input type="checkbox" checked={channels.includes(c)} onChange={() => setChannels((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))} />{c}</label>
          ))}</div>
        </Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tpl.defaultTitle} className={inputCls} /></Field>
        <Field label="Message"><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tpl.defaultMessage} rows={3} className={`${inputCls} h-auto py-2`} /></Field>
        <div className="flex gap-2 justify-end">
          {tpl.override && <Button variant="ghost" onClick={async () => { if (await act(() => api.delete(`/admin/notifications/templates/${tpl.eventKey}`))) { onSaved(); onClose(); } }}>Revert to default</Button>}
          <Button onClick={async () => { if (await act(() => api.put(`/admin/notifications/templates/${tpl.eventKey}`, { enabled, channels, title, message }))) { onSaved(); onClose(); } }}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};

const NotificationTemplates = () => {
  const list = useApi('/admin/notifications/templates');
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  const rows = list.data.filter((t) => !q || `${t.eventKey} ${t.category}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Notification Templates" subtitle="Turn events on/off, choose channels (push, SMS, email…) and edit the text. Delivery logs are under Notifications.">
      <Card>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter events" className={`${inputCls} max-w-sm mb-3`} />
        <Table rows={rows} rowKey={(r) => r.eventKey} onRowClick={setEdit} columns={[
          { key: 'eventKey', label: 'Event', render: (r) => <div className="font-mono text-xs">{r.eventKey}<div className="text-gray-400 font-sans">{r.category}</div></div> },
          { key: 'recipients', label: 'Goes to', render: (r) => (r.recipients || []).join(', ') },
          { key: 'channels', label: 'Channels', render: (r) => (r.override?.channels?.length ? r.override.channels : r.defaultChannels).join(', ') },
          { key: 'text', label: 'Title', render: (r) => <span className="text-xs">{r.override?.title || r.defaultTitle}</span> },
          { key: 'state', label: '', render: (r) => (r.override ? <Badge tone={r.override.enabled === false ? 'red' : 'blue'}>{r.override.enabled === false ? 'off' : 'customised'}</Badge> : <Badge>default</Badge>) }
        ]} />
      </Card>
      {edit && <Editor tpl={edit} onClose={() => setEdit(null)} onSaved={list.reload} />}
    </Page>
  );
};

export default NotificationTemplates;
