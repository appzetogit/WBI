import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiDownload } from 'react-icons/fi';
import api from '../../../../services/api';
import { downloadFile } from '../../utils/download';
import {
  PageHeader, Card, StatCard, ErrorState, EmptyState, inr, fmtDateTime, inputCls, btnSecondary
} from '../../components/ui';

const TYPE_LABEL = {
  TOP_UP: 'Top-ups',
  JOB_RESERVATION: 'Reserved for jobs',
  JOB_CHARGE: 'Job charges',
  RELEASE: 'Reservations released',
  REFUND: 'Refunds',
  ADJUSTMENT: 'Adjustments',
  PAYOUT: 'Payouts',
  REVERSAL: 'Reversals'
};

const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${inr(Math.abs(n), 2)}`;

/**
 * Reconciliation — the wallet's balances recomputed from its ledger, compared
 * with what the wallet holds, plus the period's movements by type.
 */
const Reconciliation = () => {
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const params = Object.fromEntries(Object.entries(range).filter(([, v]) => v));

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['b2bWalletReconciliation', params],
    queryFn: async () => (await api.get('/b2b/wallet/reconciliation', { params })).data.data
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const movements = data?.movements || [];
  const net = movements.reduce(
    (acc, m) => ({ available: acc.available + m.availableDelta, reserved: acc.reserved + m.reservedDelta }),
    { available: 0, reserved: 0 }
  );

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Reconciliation"
        subtitle="Your balances rebuilt from the ledger and checked against the wallet."
        actions={
          <>
            <button type="button" className={btnSecondary} onClick={() => refetch()} disabled={isFetching}>
              <FiRefreshCw className={isFetching ? 'animate-spin' : ''} /> Re-check
            </button>
            <button type="button" className={btnSecondary}
              onClick={() => downloadFile('/b2b/wallet/transactions/export', { params, fallbackName: 'wallet-statement.csv', label: 'Preparing statement…' })}>
              <FiDownload /> Statement
            </button>
          </>
        }
      />

      {isLoading ? (
        <div className="h-24 bg-white rounded-2xl border border-gray-100 animate-pulse" />
      ) : (
        <div className={`rounded-2xl border p-5 flex items-start gap-3 ${data.balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          {data.balanced
            ? <FiCheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
            : <FiAlertTriangle className="w-6 h-6 text-red-600 shrink-0" />}
          <div>
            <p className={`font-semibold ${data.balanced ? 'text-emerald-900' : 'text-red-900'}`}>
              {data.balanced ? 'Balanced: the ledger explains every rupee in your wallet.' : 'Mismatch between the ledger and the wallet'}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Checked {fmtDateTime(data.checkedAt)} across {data.rows.toLocaleString('en-IN')} ledger rows.
              {!data.balanced && ' WBI finance has the same view; raise a support ticket in the Wallet category and quote this check time.'}
            </p>
            {!data.balanced && (
              <Link to="/b2b/support" className="inline-block mt-2 text-sm font-semibold text-red-700 hover:underline">Raise a ticket</Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Available balance">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-gray-500">Opening balance</dt><dd className="tabular-nums">{isLoading ? '…' : inr(data.opening.available, 2)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Per the ledger</dt><dd className="tabular-nums">{isLoading ? '…' : inr(data.expected.available, 2)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">In the wallet</dt><dd className="tabular-nums font-semibold">{isLoading ? '…' : inr(data.actual.available, 2)}</dd></div>
            <div className="flex justify-between border-t border-gray-100 pt-2">
              <dt className="font-semibold">Difference</dt>
              <dd className={`tabular-nums font-semibold ${!isLoading && data.drift.available !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>{isLoading ? '…' : signed(data.drift.available)}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Reserved balance">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-gray-500">Opening reserved</dt><dd className="tabular-nums">{isLoading ? '…' : inr(data.opening.reserved, 2)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Per the ledger</dt><dd className="tabular-nums">{isLoading ? '…' : inr(data.expected.reserved, 2)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">In the wallet</dt><dd className="tabular-nums font-semibold">{isLoading ? '…' : inr(data.actual.reserved, 2)}</dd></div>
            <div className="flex justify-between border-t border-gray-100 pt-2">
              <dt className="font-semibold">Difference</dt>
              <dd className={`tabular-nums font-semibold ${!isLoading && data.drift.reserved !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>{isLoading ? '…' : signed(data.drift.reserved)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Jobs holding a reservation" value={data?.jobs?.reserved?.count ?? 0} hint={inr(data?.jobs?.reserved?.amount, 2)} loading={isLoading} />
        <StatCard label="Jobs charged" value={data?.jobs?.charged?.count ?? 0} hint={inr(data?.jobs?.charged?.amount, 2)} loading={isLoading} />
        <StatCard label="Ledger rows" value={(data?.rows ?? 0).toLocaleString('en-IN')} loading={isLoading} />
        <StatCard
          label="Rows before the ledger"
          value={(data?.legacyRows ?? 0).toLocaleString('en-IN')}
          hint="Counted in the opening balance"
          loading={isLoading}
        />
      </div>

      <Card
        title="Movements by type"
        subtitle="Filter by date to reconcile a period"
        actions={
          <div className="flex flex-wrap gap-2">
            <input type="date" value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} className={inputCls} aria-label="From" />
            <input type="date" value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} className={inputCls} aria-label="To" />
          </div>
        }
      >
        {!isLoading && movements.length === 0 ? (
          <EmptyState title="No movements in this period" />
        ) : (
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="py-3 px-5 text-left">Type</th>
                  <th className="py-3 px-5 text-right">Rows</th>
                  <th className="py-3 px-5 text-right">Gross</th>
                  <th className="py-3 px-5 text-right">Available change</th>
                  <th className="py-3 px-5 text-right">Reserved change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map((m) => (
                  <tr key={m.type}>
                    <td className="py-3 px-5">{TYPE_LABEL[m.type] || m.type}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{m.count.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{inr(m.gross, 2)}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{signed(m.availableDelta)}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{signed(m.reservedDelta)}</td>
                  </tr>
                ))}
              </tbody>
              {movements.length > 0 && (
                <tfoot className="border-t border-gray-200 font-semibold">
                  <tr>
                    <td className="py-3 px-5">Net</td>
                    <td className="py-3 px-5" />
                    <td className="py-3 px-5" />
                    <td className="py-3 px-5 text-right tabular-nums">{signed(Math.round(net.available * 100) / 100)}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{signed(Math.round(net.reserved * 100) / 100)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Reconciliation;
