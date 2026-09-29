import React, { useState } from 'react';
import { Page, Card, Table, Badge, Loading, Empty, ErrorBox, Pager, Modal, Field, Button } from './ui';
import { when, useApi, inputCls } from './helpers';

const Json = ({ value }) => (value === null || value === undefined
  ? <span className="text-gray-400">—</span>
  : <pre className="text-[11px] bg-gray-50 rounded p-2 whitespace-pre-wrap break-all max-h-60 overflow-auto">{JSON.stringify(value, null, 2)}</pre>);

/** Who did what, to which record, old → new, and why. */
const AuditLogs = () => {
  const [filters, setFilters] = useState({ adminOnly: 'true', q: '', targetId: '', from: '', to: '', status: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [row, setRow] = useState(null);
  const params = Object.fromEntries(Object.entries({ ...applied, page, limit: 50 }).filter(([, v]) => v !== ''));
  const list = useApi('/admin/audit-logs', params);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Page title="Audit Logs" subtitle="Every admin change is recorded with actor, target, old and new values, and the reason given.">
      <Card>
        <form className="grid sm:grid-cols-6 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
          <Field label="Search"><input value={filters.q} onChange={set('q')} placeholder="action, path, reason" className={inputCls} /></Field>
          <Field label="Record id"><input value={filters.targetId} onChange={set('targetId')} placeholder="user / vendor / job id" className={inputCls} /></Field>
          <Field label="From"><input type="date" value={filters.from} onChange={set('from')} className={inputCls} /></Field>
          <Field label="To"><input type="date" value={filters.to} onChange={set('to')} className={inputCls} /></Field>
          <Field label="Actor"><select value={filters.adminOnly} onChange={set('adminOnly')} className={inputCls}><option value="true">Admins</option><option value="">Everyone (incl. system)</option></select></Field>
          <Button type="submit">Apply</Button>
        </form>
      </Card>
      <Card>
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data?.length ? <Empty>No audit entries match.</Empty> : (
          <>
            <Table rows={list.data} onRowClick={setRow} columns={[
              { key: 'createdAt', label: 'When', render: (r) => when(r.createdAt) },
              { key: 'actorName', label: 'Actor', render: (r) => <div>{r.actorName || r.actorRole}<div className="text-[11px] text-gray-400">{r.actorRole}</div></div> },
              { key: 'eventMessage', label: 'Action', render: (r) => <div className="max-w-md"><div className="font-mono text-xs">{r.eventMessage || r.actionType}</div>{r.targetType && <div className="text-[11px] text-gray-400">{r.targetType} {r.targetId || ''}</div>}</div> },
              { key: 'change', label: 'Change', render: (r) => r.newValue && Object.keys(r.newValue).length ? <span className="text-xs">{Object.keys(r.newValue).join(', ')}</span> : '—' },
              { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
              { key: 'status', label: 'Result', render: (r) => <Badge tone={r.status === 'failed' ? 'red' : 'green'}>{r.status || 'success'}</Badge> }
            ]} />
            <Pager page={page} pages={list.raw?.pagination?.pages || 1} onPage={setPage} />
          </>
        )}
      </Card>
      {row && (
        <Modal title={row.actionType} onClose={() => setRow(null)} wide>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Old value</div><Json value={row.oldValue} /></div>
            <div><div className="text-[10px] font-bold uppercase text-gray-400 mb-1">New value</div><Json value={row.newValue} /></div>
            <div className="sm:col-span-2"><div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Request</div><Json value={row.changes} /></div>
            <div className="sm:col-span-2 text-xs text-gray-500">{when(row.createdAt)} · {row.ipAddress} · {row.userAgent}</div>
          </div>
        </Modal>
      )}
    </Page>
  );
};

export default AuditLogs;
