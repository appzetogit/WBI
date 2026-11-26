import React, { useState } from 'react';
import api from '../../../../services/api';
import { Modal, Table, Badge, Loading, Empty, ErrorBox, Button, Field } from '../ControlCenter/ui';
import { useApi, act, inr, when, statusTone, inputCls } from '../ControlCenter/helpers';

const TABS = ['Profile', 'Bookings', 'Wallet', 'Addresses', 'Refunds', 'Activity'];

const ProfileTab = ({ id, onChanged }) => {
  const d = useApi(`/admin/users/${id}`);
  const [form, setForm] = useState(null);
  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} />;
  const u = d.data?.user || d.data;
  const f = form || { name: u.name || '', email: u.email || '' };
  return (
    <div className="space-y-3 text-sm">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name"><input value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => setForm({ ...f, email: e.target.value })} className={inputCls} /></Field>
      </div>
      <p className="text-gray-500 flex items-center gap-1.5 flex-wrap">
        <span>Phone {u.phone} · Joined {when(u.createdAt)} ·</span>
        <Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'active' : 'blocked'}</Badge>
        {u.googleId && <Badge tone="blue">Google</Badge>}
        {u.appleId && <Badge tone="gray">Apple</Badge>}
      </p>
      {d.data?.stats && <p className="text-gray-500">Bookings {d.data.stats.totalBookings ?? '—'} · Spent {inr(d.data.stats.totalSpent)}</p>}
      <Button disabled={!form} onClick={async () => { if (await act(() => api.put(`/admin/users/${id}`, form), 'Saved')) { setForm(null); d.reload(); onChanged(); } }}>Save changes</Button>
    </div>
  );
};

const ListTab = ({ url, columns, pick = (d) => d, empty }) => {
  const d = useApi(url);
  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} />;
  const rows = pick(d.data) || [];
  return rows.length ? <Table rows={rows} rowKey={(r) => r._id || r.at || JSON.stringify(r).slice(0, 60)} columns={columns} /> : <Empty>{empty}</Empty>;
};

/** Everything about one customer: profile, bookings, wallet, addresses, refunds, activity. */
const UserDetailModal = ({ userId, onClose, onChanged }) => {
  const [tab, setTab] = useState('Profile');
  return (
    <Modal title="User details" onClose={onClose} wide>
      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 h-8 rounded-lg text-xs font-bold ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t}</button>)}
      </div>
      {tab === 'Profile' && <ProfileTab id={userId} onChanged={onChanged} />}
      {tab === 'Bookings' && <ListTab url={`/admin/users/${userId}/bookings`} pick={(d) => d?.bookings || d} empty="No bookings" columns={[
        { key: 'bookingNumber', label: 'Booking' }, { key: 'serviceName', label: 'Service' },
        { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
        { key: 'finalAmount', label: 'Amount', render: (r) => inr(r.finalAmount) }, { key: 'paymentStatus', label: 'Payment' },
        { key: 'createdAt', label: 'Date', render: (r) => when(r.createdAt) }]} />}
      {tab === 'Wallet' && <ListTab url={`/admin/users/${userId}/wallet`} pick={(d) => d?.transactions || d} empty="No wallet activity" columns={[
        { key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) },
        { key: 'status', label: 'Status' }, { key: 'description', label: 'Note' }, { key: 'createdAt', label: 'Date', render: (r) => when(r.createdAt) }]} />}
      {tab === 'Addresses' && <ListTab url={`/admin/users/${userId}/addresses`} empty="No saved addresses" columns={[
        { key: 'label', label: 'Label', render: (r) => <span>{r.label || r.type}{r.isDefault && <> <Badge tone="teal">default</Badge></>}</span> },
        { key: 'fullAddress', label: 'Address', render: (r) => r.fullAddress || r.addressLine1 },
        { key: 'city', label: 'City' }, { key: 'pincode', label: 'Pincode' }]} />}
      {tab === 'Refunds' && <ListTab url={`/admin/users/${userId}/refunds`} empty="No refunds" columns={[
        { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) }, { key: 'paymentMethod', label: 'Method' },
        { key: 'status', label: 'Status' }, { key: 'description', label: 'Reason' }, { key: 'createdAt', label: 'Date', render: (r) => when(r.createdAt) }]} />}
      {tab === 'Activity' && <ListTab url={`/admin/users/${userId}/activity`} empty="No activity" columns={[
        { key: 'at', label: 'When', render: (r) => when(r.at) }, { key: 'kind', label: 'Type', render: (r) => <Badge>{r.kind}</Badge> },
        { key: 'text', label: 'Event' }]} />}
    </Modal>
  );
};

export default UserDetailModal;
