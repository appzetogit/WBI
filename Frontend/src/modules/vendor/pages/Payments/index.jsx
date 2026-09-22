import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination, StatCard } from '../../components/ops/OpsUi';
import { formatINR, formatDateTime } from '../../components/ops/opsFormat';
import { listPayments, errorMessage } from '../../services/vendorJobsService';
import useVendorBasePath from '../../hooks/useVendorBasePath';

const STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED', 'ADJUSTED'];
const STATUS_CLS = {
  PENDING: 'bg-gray-100 text-gray-700',
  PROCESSING: 'bg-blue-50 text-blue-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  REFUNDED: 'bg-amber-50 text-amber-800',
  ADJUSTED: 'bg-purple-50 text-purple-700'
};

const Payments = () => {
  const { basePath } = useVendorBasePath();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', rows: [], summary: {}, pagination: {} });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const res = await listPayments({ page, limit: 25, ...(status ? { status } : {}) });
      setState({ loading: false, error: '', rows: res.data || [], summary: res.summary || {}, pagination: res.pagination || {} });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err), rows: [], summary: {}, pagination: {} });
    }
  }, [page, status]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const s = state.summary;
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Payments"
        title="Job Payments"
        subtitle="Per-job amount, platform commission and your earnings, from the escrow and finance ledgers."
        actions={(
          <>
            <Link to={`${basePath}/finance/wallet`} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Wallet & withdrawals</Link>
            <RefreshButton onClick={load} spinning={state.loading && state.rows.length > 0} />
          </>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {STATUSES.map((st) => (
          <StatCard
            key={st}
            label={st.toLowerCase()}
            value={s[st] ? formatINR(s[st].earnings) : '—'}
            hint={s[st] ? `${s[st].count} job${s[st].count === 1 ? '' : 's'}` : ''}
            tone={st === 'PAID' ? 'green' : st === 'FAILED' ? 'red' : st === 'REFUNDED' ? 'amber' : 'gray'}
            onClick={() => { setStatus(status === st ? '' : st); setPage(1); }}
          />
        ))}
      </div>

      {state.loading && !state.rows.length ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.rows.length ? (
        <EmptyState title="No payments yet" message={status ? `No ${status.toLowerCase()} payments.` : 'Payments appear once your team completes funded jobs.'} />
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                <tr><th className="px-4 py-3">Job</th><th className="px-3 py-3">Service</th><th className="px-3 py-3">Engineer</th><th className="px-3 py-3 text-right">Job amount</th><th className="px-3 py-3 text-right">Commission</th><th className="px-3 py-3 text-right">GST</th><th className="px-3 py-3 text-right">Your earnings</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Paid at</th><th className="px-3 py-3">Reference</th></tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.jobId} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 font-mono font-bold">{r.jobCode}</td>
                    <td className="px-3 py-2.5">{r.service}<span className="text-gray-400"> · {r.city}</span></td>
                    <td className="px-3 py-2.5">{r.engineerName || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.jobAmount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.commission)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.gst)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold">{formatINR(r.vendorEarnings)}</td>
                    <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_CLS[r.status]}`}>{r.status}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(r.paidAt)}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">{r.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {state.rows.map((r) => (
              <div key={r.jobId} className="bg-white rounded-xl border border-gray-200 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="font-mono font-bold">{r.jobCode}</span><span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_CLS[r.status]}`}>{r.status}</span></div>
                <p className="text-gray-600">{r.service} · {r.city}</p>
                <div className="flex justify-between"><span>Job {formatINR(r.jobAmount)} · Commission {formatINR(r.commission + r.gst)}</span><b>{formatINR(r.vendorEarnings)}</b></div>
              </div>
            ))}
          </div>
          <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
        </>
      )}
    </div>
  );
};

export default Payments;
