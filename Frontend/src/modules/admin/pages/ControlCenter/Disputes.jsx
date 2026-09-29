import React, { useState } from 'react';
import api from '../../../../services/api';
import { Page, Card, Table, Badge, Loading, Empty, ErrorBox, Modal, Button, Field } from './ui';
import { statusTone, inr, when, useApi, act, inputCls } from './helpers';

const RESOLUTIONS = [['refund', 'Full refund'], ['partial_refund', 'Partial refund'], ['rework', 'Rework / revisit'], ['no_action', 'No action']];

const DisputeDetail = ({ id, onClose, onChanged }) => {
  const d = useApi(`/admin/disputes/${id}`);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('partial_refund');
  const [amount, setAmount] = useState('');
  const x = d.data;
  const open = x && ['open', 'in_review'].includes(x.status);
  const done = () => { d.reload(); onChanged(); setNote(''); };

  return (
    <Modal title={x ? `${x.disputeNumber} · ${x.sourceRef || ''}` : 'Dispute'} onClose={onClose} wide>
      {d.loading ? <Loading /> : d.error ? <ErrorBox error={d.error} /> : (
        <div className="space-y-4 text-sm">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><div className="text-[10px] uppercase text-gray-400 font-bold">Status</div><Badge tone={statusTone(x.status)}>{x.status}</Badge></div>
            <div><div className="text-[10px] uppercase text-gray-400 font-bold">Raised by</div>{x.raisedByRole} · {x.sourceType === 'booking' ? 'B2C booking' : 'B2B job'}</div>
            <div><div className="text-[10px] uppercase text-gray-400 font-bold">Amount in dispute</div>{inr(x.amountInDispute)}{x.source?.refundedAmount ? ` (refunded ${inr(x.source.refundedAmount)})` : ''}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3"><div className="font-semibold">{x.category.replace('_', ' ')} — {x.reason}</div>{x.description && <p className="text-gray-600 mt-1">{x.description}</p>}</div>
          <div>
            <div className="text-[10px] uppercase text-gray-400 font-bold mb-1">Timeline</div>
            <ul className="space-y-1.5">
              {x.timeline.map((t, i) => <li key={i} className="flex gap-2"><Badge tone={statusTone(t.status)}>{t.status}</Badge><span className="text-gray-700">{t.note}</span><span className="text-gray-400 text-xs ml-auto">{t.actorRole} · {when(t.at)}</span></li>)}
            </ul>
          </div>
          {x.resolution && <p><b>Resolution:</b> {x.resolution} {x.refundAmount ? `· refunded ${inr(x.refundAmount)}` : ''} — {x.resolutionNote}</p>}
          {open && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <Field label="Note"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} placeholder="What was checked / decided" /></Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" disabled={!note} onClick={async () => { if (await act(() => api.post(`/admin/disputes/${id}/notes`, { note, status: 'in_review' }))) done(); }}>Add note · mark in review</Button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <Field label="Resolution"><select value={resolution} onChange={(e) => setResolution(e.target.value)} className={inputCls}>{RESOLUTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                {resolution === 'partial_refund' && <Field label="Refund amount (₹)"><input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>}
                <div className="flex gap-2">
                  <Button disabled={!note || (resolution === 'partial_refund' && !amount)} onClick={async () => { if (await act(() => api.post(`/admin/disputes/${id}/resolve`, { resolution, refundAmount: amount, note }))) done(); }}>Resolve</Button>
                  <Button variant="danger" disabled={!note} onClick={async () => { if (await act(() => api.post(`/admin/disputes/${id}/reject`, { note }))) done(); }}>Reject</Button>
                </div>
              </div>
              <p className="text-xs text-gray-400">Refunds move real money: online B2C payments go back through Razorpay, cash payments to the customer wallet, B2B refunds to the company wallet.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

const Disputes = () => {
  const [status, setStatus] = useState('open');
  const [openId, setOpenId] = useState(null);
  const list = useApi('/admin/disputes', { status });
  const counts = list.raw?.counts || {};
  return (
    <Page title="Disputes" subtitle="Complaints raised by customers and B2B companies">
      <div className="flex gap-1.5">
        {['open', 'in_review', 'resolved', 'rejected', 'all'].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`px-3 h-8 rounded-full text-xs font-bold border ${status === s ? 'bg-[#10AFA5] text-white border-[#10AFA5]' : 'bg-white text-gray-600 border-gray-200'}`}>
            {s.replace('_', ' ')}{counts[s] ? ` · ${counts[s]}` : ''}
          </button>
        ))}
      </div>
      <Card>
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data?.length ? <Empty>No disputes here.</Empty> : (
          <Table rows={list.data} onRowClick={(r) => setOpenId(r._id)} columns={[
            { key: 'disputeNumber', label: 'Dispute' },
            { key: 'sourceRef', label: 'Booking / Job', render: (r) => <div>{r.sourceRef}<div className="text-[11px] text-gray-400">{r.sourceType === 'booking' ? 'B2C' : 'B2B'} · {r.raisedByRole}</div></div> },
            { key: 'reason', label: 'Reason', render: (r) => <div><Badge>{r.category}</Badge> {r.reason}</div> },
            { key: 'amountInDispute', label: 'Amount', render: (r) => inr(r.amountInDispute) },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
            { key: 'createdAt', label: 'Raised', render: (r) => when(r.createdAt) }
          ]} />
        )}
      </Card>
      {openId && <DisputeDetail id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </Page>
  );
};

export default Disputes;
