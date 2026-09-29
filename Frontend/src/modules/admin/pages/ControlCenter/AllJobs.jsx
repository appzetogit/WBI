import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Card, Table, Badge, Loading, Empty, ErrorBox, Pager } from './ui';
import { statusTone, inr, when, useApi, inputCls } from './helpers';

const BUCKETS = [
  ['all', 'All'], ['new', 'New'], ['pending', 'Pending'], ['assigned', 'Assigned'], ['accepted', 'Accepted'],
  ['en_route', 'En Route'], ['checked_in', 'Checked In'], ['in_progress', 'In Progress'], ['completed', 'Completed'],
  ['cancelled', 'Cancelled'], ['disputed', 'Disputed'], ['failed', 'Failed']
];

/** One list over B2C bookings and B2B jobs, bucketed by the spec's job states. */
const AllJobs = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const bucket = params.get('bucket') || 'all';
  const source = params.get('source') || 'all';
  const page = Number(params.get('page') || 1);
  const summary = useApi('/admin/jobs/summary');
  const list = useApi('/admin/jobs', { bucket, source, page, limit: 25, q: params.get('q') || undefined });
  const set = (k, v) => { const n = new URLSearchParams(params); n.set(k, v); if (k !== 'page') n.set('page', 1); setParams(n); };
  const counts = summary.data?.buckets || {};

  return (
    <Page title="All Jobs" subtitle="B2C bookings and B2B jobs in one place">
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => set('bucket', k)}
            className={`px-3 h-8 rounded-full text-xs font-bold border ${bucket === k ? 'bg-[#10AFA5] text-white border-[#10AFA5]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {label}{k === 'all' ? (summary.data ? ` · ${summary.data.all}` : '') : (counts[k] !== undefined ? ` · ${counts[k]}` : '')}
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={source} onChange={(e) => set('source', e.target.value)} className={`${inputCls} max-w-[160px]`}>
            <option value="all">B2C + B2B</option><option value="b2c">B2C bookings</option><option value="b2b">B2B jobs</option>
          </select>
          <form onSubmit={(e) => { e.preventDefault(); set('q', q); }} className="flex-1 min-w-[220px]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booking / job id, customer, city, service" className={inputCls} />
          </form>
        </div>
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data?.length ? <Empty>No jobs in this view.</Empty> : (
          <>
            <Table
              rows={list.data}
              onRowClick={(r) => navigate(r.source === 'b2c' ? '/admin/bookings' : `/admin/b2b/unassigned?job=${r.ref}`)}
              columns={[
                { key: 'ref', label: 'Job', render: (r) => <div><div className="font-semibold text-gray-900">{r.ref}</div><Badge tone={r.source === 'b2b' ? 'blue' : 'teal'}>{r.source.toUpperCase()}</Badge></div> },
                { key: 'customer', label: 'Customer', render: (r) => <div>{r.customer}{r.site && <div className="text-xs text-gray-400">{r.site}</div>}</div> },
                { key: 'service', label: 'Service' },
                { key: 'city', label: 'City' },
                { key: 'bucket', label: 'Stage', render: (r) => <div><Badge tone={statusTone(r.bucket)}>{r.bucket.replace('_', ' ')}</Badge><div className="text-[11px] text-gray-400 mt-0.5">{r.status}</div></div> },
                { key: 'assignee', label: 'Assigned to', render: (r) => r.assignee || <span className="text-gray-400">Unassigned</span> },
                { key: 'amount', label: 'Amount', render: (r) => <div>{inr(r.amount)}<div className="text-[11px] text-gray-400">{r.paymentStatus}</div></div> },
                { key: 'createdAt', label: 'Created', render: (r) => when(r.createdAt) }
              ]}
            />
            <Pager page={page} pages={list.raw?.pagination?.pages || 1} onPage={(p) => set('page', p)} />
          </>
        )}
      </Card>
    </Page>
  );
};

export default AllJobs;
