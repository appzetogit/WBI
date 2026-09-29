import React, { useState } from 'react';
import api from '../../../../services/api';
import { Page, Card, Table, Badge, Loading, Empty, ErrorBox, Button } from './ui';
import { statusTone, when, useApi, act } from './helpers';

const VendorOfferings = () => {
  const [status, setStatus] = useState('PENDING');
  const list = useApi('/admin/vendor-offerings', { approvalStatus: status });
  const decide = async (id, action) => {
    const reason = action === 'approve' ? '' : window.prompt('Reason (shown to the vendor)');
    if (action !== 'approve' && !reason) return;
    if (await act(() => api.post(`/admin/vendor-offerings/${id}/${action}`, { reason }))) list.reload();
  };
  return (
    <Page title="Vendor Service Offerings" subtitle="Vendors submit offerings; approve before they can activate them.">
      <div className="flex gap-1.5">
        {['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'all'].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={`px-3 h-8 rounded-full text-xs font-bold border ${status === s ? 'bg-[#10AFA5] text-white border-[#10AFA5]' : 'bg-white text-gray-600 border-gray-200'}`}>{s.replace('_', ' ').toLowerCase()}</button>
        ))}
      </div>
      <Card>
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.length ? <Empty>No offerings in this state.</Empty> : (
          <Table rows={list.data} columns={[
            { key: 'title', label: 'Offering', render: (r) => <div className="font-semibold">{r.title}<div className="text-[11px] text-gray-400">{r.executionModel}</div></div> },
            { key: 'vendor', label: 'Vendor', render: (r) => r.vendorId?.businessName || r.vendorId?.name },
            { key: 'status', label: 'Status', render: (r) => <div><Badge tone={statusTone(r.approvalStatus)}>{r.approvalStatus}</Badge> <Badge>{r.status}</Badge></div> },
            { key: 'updatedAt', label: 'Updated', render: (r) => when(r.updatedAt) },
            { key: 'act', label: '', render: (r) => r.approvalStatus === 'PENDING' && (
              <div className="flex gap-1.5">
                <Button onClick={() => decide(r._id, 'approve')}>Approve</Button>
                <Button variant="ghost" onClick={() => decide(r._id, 'request-changes')}>Changes</Button>
                <Button variant="danger" onClick={() => decide(r._id, 'reject')}>Reject</Button>
              </div>) }
          ]} />
        )}
      </Card>
    </Page>
  );
};

export default VendorOfferings;
