import React, { useState } from 'react';
import { Page, Card, Table, Badge, Loading, Empty, ErrorBox } from './ui';
import { statusTone, inr, when, useApi } from './helpers';

const Refunds = () => {
  const [source, setSource] = useState('all');
  const list = useApi('/admin/refunds', { limit: 200 });
  const rows = (list.data || []).filter((r) => source === 'all' || r.source === source);
  const totals = list.raw?.totals || {};
  return (
    <Page title="Refunds" subtitle="Customer refunds (Razorpay / wallet) and B2B wallet refunds. Issue B2C refunds from a booking's payment panel or by resolving a dispute.">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><div className="text-xs text-gray-400 font-bold uppercase">B2C refunded</div><div className="text-2xl font-extrabold">{inr(totals.b2c)}</div></Card>
        <Card><div className="text-xs text-gray-400 font-bold uppercase">B2B refunded</div><div className="text-2xl font-extrabold">{inr(totals.b2b)}</div></Card>
        <Card><div className="text-xs text-gray-400 font-bold uppercase">Showing</div>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 h-9 border border-gray-200 rounded-lg px-3 text-sm w-full">
            <option value="all">All refunds</option><option value="b2c">B2C only</option><option value="b2b">B2B only</option>
          </select>
        </Card>
      </div>
      <Card>
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !rows.length ? <Empty>No refunds yet.</Empty> : (
          <Table rows={rows} columns={[
            { key: 'createdAt', label: 'When', render: (r) => when(r.createdAt) },
            { key: 'source', label: 'Type', render: (r) => <Badge tone={r.source === 'b2b' ? 'blue' : 'teal'}>{r.source.toUpperCase()}</Badge> },
            { key: 'party', label: 'Refunded to' },
            { key: 'ref', label: 'Reference', render: (r) => <div>{r.ref || '—'}{r.providerRef && <div className="text-[11px] text-gray-400">{r.providerRef}</div>}</div> },
            { key: 'method', label: 'Method' },
            { key: 'amount', label: 'Amount', render: (r) => <b>{inr(r.amount)}</b> },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
            { key: 'reason', label: 'Reason', render: (r) => <span className="text-xs text-gray-500">{r.reason}</span> }
          ]} />
        )}
      </Card>
    </Page>
  );
};

export default Refunds;
