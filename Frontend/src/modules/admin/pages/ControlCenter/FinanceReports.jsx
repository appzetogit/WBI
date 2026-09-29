import React, { useState } from 'react';
import { Page, Card, Table, Loading, ErrorBox, Field } from './ui';
import { inr, useApi, inputCls } from './helpers';

const Section = ({ title, url, range, columns, pick }) => {
  const r = useApi(url, range);
  return (
    <Card title={title}>
      {r.loading ? <Loading /> : r.error ? <ErrorBox error={r.error} /> : <Table rows={pick(r.data)} rowKey={(x) => JSON.stringify(x).slice(0, 80)} columns={columns} />}
    </Card>
  );
};

/** Reports that were missing: refunds, withdrawals, commission, platform-wide B2B. */
const FinanceReports = () => {
  const [range, setRange] = useState({});
  const set = (k) => (e) => setRange((x) => ({ ...x, [k]: e.target.value || undefined }));
  return (
    <Page title="Finance & B2B Reports" subtitle="Refunds, withdrawals, commission and all-company B2B figures">
      <Card>
        <div className="flex gap-3">
          <Field label="From"><input type="date" onChange={set('startDate')} className={inputCls} /></Field>
          <Field label="To"><input type="date" onChange={set('endDate')} className={inputCls} /></Field>
        </div>
      </Card>
      <Section title="Commission — B2C bookings" url="/admin/reports/commission" range={range} pick={(d) => d?.b2c || []}
        columns={[{ key: 'month', label: 'Month' }, { key: 'bookings', label: 'Bookings' }, { key: 'gross', label: 'Gross', render: (r) => inr(r.gross) }, { key: 'commission', label: 'Platform earning', render: (r) => inr(r.commission) }, { key: 'payouts', label: 'Payouts', render: (r) => inr(r.payouts) }, { key: 'gst', label: 'GST', render: (r) => inr(r.gst) }]} />
      <Section title="Commission — B2B escrow releases" url="/admin/reports/commission" range={range} pick={(d) => d?.b2b || []}
        columns={[{ key: 'month', label: 'Month' }, { key: 'jobs', label: 'Jobs' }, { key: 'gross', label: 'Gross', render: (r) => inr(r.gross) }, { key: 'payouts', label: 'Paid out', render: (r) => inr(r.payouts) }, { key: 'platformFee', label: 'Platform fee', render: (r) => inr(r.platformFee) }, { key: 'gst', label: 'GST', render: (r) => inr(r.gst) }, { key: 'retained', label: 'Retained', render: (r) => inr(r.retained) }]} />
      <Section title="Refunds" url="/admin/reports/refunds" range={range} pick={(d) => [...(d?.b2c || []).map((x) => ({ ...x, source: 'B2C' })), ...(d?.b2b || []).map((x) => ({ ...x, source: 'B2B' }))]}
        columns={[{ key: 'month', label: 'Month' }, { key: 'source', label: 'Type' }, { key: 'count', label: 'Refunds' }, { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) }]} />
      <Section title="Withdrawals" url="/admin/reports/withdrawals" range={range} pick={(d) => d || []}
        columns={[{ key: 'month', label: 'Month' }, { key: 'source', label: 'Who' }, { key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount', render: (r) => inr(r.amount) }]} />
      <Section title="B2B — all companies" url="/admin/reports/b2b-platform" range={range} pick={(d) => d?.rows || []}
        columns={[{ key: 'company', label: 'Company' }, { key: 'verificationStatus', label: 'Status' }, { key: 'jobs', label: 'Jobs' }, { key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' }, { key: 'escalated', label: 'Escalated' }, { key: 'billed', label: 'Billed', render: (r) => inr(r.billed) }, { key: 'walletBalance', label: 'Wallet', render: (r) => inr(r.walletBalance) }, { key: 'escrow', label: 'Escrow', render: (r) => inr(r.escrow) }]} />
    </Page>
  );
};

export default FinanceReports;
