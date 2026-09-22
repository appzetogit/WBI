import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FiCreditCard, FiArrowUpRight, FiArrowDownRight, FiShield, FiClock, FiDownload,
  FiPlus, FiInfo, FiSearch
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';
import useB2BSession from '../../hooks/useB2BSession';
import { downloadFile } from '../../utils/download';
import {
  PageHeader, StatCard, Card, Pagination, EmptyState, ErrorState, TableSkeleton, Badge,
  inr, fmtDateTime, inputCls, btnPrimary, btnSecondary
} from '../../components/ui';

// Load the Razorpay checkout script once per page life.
let razorpayPromise = null;
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (!razorpayPromise) {
    razorpayPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => { razorpayPromise = null; resolve(false); };
      document.body.appendChild(script);
    });
  }
  return razorpayPromise;
};

const LEDGER_LABEL = {
  TOP_UP: 'Top-up',
  JOB_RESERVATION: 'Reserved for job',
  JOB_CHARGE: 'Job charge',
  RELEASE: 'Reservation released',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment',
  PAYOUT: 'Payout',
  REVERSAL: 'Reversal'
};
const LEGACY_LABEL = {
  topup: 'Top-up', job_deduction: 'Job charge', escrow_hold: 'Reserved for job',
  escrow_release: 'Reservation released', refund: 'Refund', adjustment: 'Adjustment'
};
const typeLabel = (t) => LEDGER_LABEL[t.ledgerType] || LEGACY_LABEL[t.type] || t.type || '—';
const STATUS_TONE = { success: 'green', pending: 'amber', failed: 'red', refunded: 'blue', reversed: 'violet' };

const useWalletSummary = () =>
  useQuery({
    queryKey: ['b2bWalletSummary'],
    queryFn: async () => (await api.get('/b2b/wallet/summary')).data.data
  });

/** Ledger table shared by the overview (recent rows) and Transactions. */
const LedgerTable = ({ rows, isLoading, error, refetch, compact }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm whitespace-nowrap">
      <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
        <tr>
          <th className="py-3 px-4">Date</th>
          <th className="py-3 px-4">Transaction</th>
          <th className="py-3 px-4">Type</th>
          <th className="py-3 px-4 text-right">Amount</th>
          <th className="py-3 px-4">Status</th>
          {!compact && <th className="py-3 px-4 text-right">Available after</th>}
          {!compact && <th className="py-3 px-4 text-right">Reserved after</th>}
          <th className="py-3 px-4">Details</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {isLoading ? <TableSkeleton cols={compact ? 6 : 8} rows={compact ? 4 : 8} /> : error ? (
          <tr><td colSpan={8}><ErrorState error={error} onRetry={refetch} /></td></tr>
        ) : !rows.length ? (
          <tr><td colSpan={8}><EmptyState title="No transactions" message="Top-ups, reservations, job charges and refunds appear here as they happen." /></td></tr>
        ) : rows.map((t) => {
          const amt = typeof t.signedAmount === 'number' ? t.signedAmount : Number(t.amount || 0);
          return (
            <tr key={t._id} className="hover:bg-gray-50/50">
              <td className="py-3 px-4 text-xs text-gray-600">{fmtDateTime(t.createdAt || t.date)}</td>
              <td className="py-3 px-4 font-mono text-xs text-gray-700">{t.transactionId}</td>
              <td className="py-3 px-4">
                <span className="text-gray-800">{typeLabel(t)}</span>
                {t.paymentMode === 'DEMO' && <Badge tone="amber">Demo</Badge>}
              </td>
              <td className={`py-3 px-4 text-right font-semibold tabular-nums ${amt > 0 ? 'text-green-600' : amt < 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                {amt > 0 ? '+' : amt < 0 ? '−' : ''}{inr(Math.abs(amt), 2)}
              </td>
              <td className="py-3 px-4"><Badge tone={STATUS_TONE[t.status] || 'gray'}>{t.status || '—'}</Badge></td>
              {!compact && <td className="py-3 px-4 text-right text-xs tabular-nums text-gray-600">{t.balanceAfter ? inr(t.balanceAfter.available, 2) : '—'}</td>}
              {!compact && <td className="py-3 px-4 text-right text-xs tabular-nums text-gray-600">{t.balanceAfter ? inr(t.balanceAfter.reserved, 2) : '—'}</td>}
              <td className="py-3 px-4 text-xs text-gray-600 max-w-[280px] truncate" title={t.remark}>{t.remark || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const BalanceCards = ({ summary, loading }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <StatCard
      label="Available"
      value={inr(summary?.availableBalance ?? summary?.balance, 2)}
      tone="brand"
      icon={FiCreditCard}
      loading={loading}
      hint={summary?.creditLimit ? `+ ${inr(summary.creditLimit)} credit · ${inr(summary.spendable)} spendable` : 'Ready to fund new jobs'}
    />
    <StatCard label="Reserved" value={inr(summary?.reservedBalance ?? summary?.escrowBalance, 2)} tone="warn" icon={FiShield} loading={loading} hint="Held against uploads and open jobs" />
    <StatCard label="Total top-ups" value={inr(summary?.totalTopup, 2)} icon={FiArrowUpRight} loading={loading} hint="Since the wallet opened" />
    <StatCard label="Total spent" value={inr(summary?.totalSpent, 2)} icon={FiArrowDownRight} loading={loading} hint="Charged for completed jobs" />
  </div>
);

/* ─────────────────────────── Overview ─────────────────────────── */
const WalletOverview = () => {
  const { can } = useB2BSession();
  const queryClient = useQueryClient();
  const { data: summary, isLoading, error, refetch } = useWalletSummary();
  const { data: gate } = useQuery({
    queryKey: ['b2bWalletGate'],
    queryFn: async () => (await api.get('/b2b/wallet/activation-gate')).data.data
  });
  const recent = useQuery({
    queryKey: ['b2bWalletTransactions', 'recent'],
    queryFn: async () => (await api.get('/b2b/wallet/transactions', { params: { limit: 8 } })).data
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const rule = summary?.deductionRule;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Wallet"
        subtitle="Balances, reservations and recent movements."
        actions={can('wallet.topup') && <Link to="/b2b/billing/add-funds" className={btnPrimary}><FiPlus /> Add funds</Link>}
      />

      {summary?.billingMode === 'DEMO' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Demo account: this wallet holds simulated money. None of it is a real payment or is settled.
        </div>
      )}

      {gate?.pendingJobCount > 0 && (
        <div className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${gate.activationBlocked ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {gate.activationBlocked ? 'Jobs are waiting on a top-up' : 'Pending jobs can be activated'}
            </p>
            <p className="text-xs text-gray-600 mt-1">{gate.message}</p>
          </div>
          {gate.activationBlocked ? (
            can('wallet.topup') && <Link to="/b2b/billing/add-funds" className={btnPrimary}>Add funds</Link>
          ) : can('wallet.topup') && (
            <button
              type="button"
              className={btnPrimary}
              onClick={async () => {
                try {
                  const res = await api.post('/b2b/wallet/activate-pending');
                  toast.success(res.data.message || 'Jobs activated');
                  queryClient.invalidateQueries({ queryKey: ['b2bWalletGate'] });
                  queryClient.invalidateQueries({ queryKey: ['b2bWalletSummary'] });
                  queryClient.invalidateQueries({ queryKey: ['b2bJobsStats'] });
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Activation failed');
                }
              }}
            >
              Activate pending jobs
            </button>
          )}
        </div>
      )}

      <BalanceCards summary={summary} loading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          className="lg:col-span-2"
          title="Recent transactions"
          actions={<Link to="/b2b/billing/transactions" className="text-xs font-semibold text-brand hover:underline">View all</Link>}
        >
          <div className="-m-5">
            <LedgerTable rows={recent.data?.data || []} isLoading={recent.isLoading} error={recent.error} refetch={recent.refetch} compact />
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="How money moves">
            <ol className="space-y-3 text-sm text-gray-600 list-decimal pl-4">
              <li>Top up the wallet.</li>
              <li>When you confirm an upload, the priced total is <strong>reserved</strong> from your available balance.</li>
              <li>When a job is closed, its price is <strong>charged</strong> from the reservation.</li>
              <li>A job cancelled before it is charged <strong>releases</strong> its reservation back to available.</li>
            </ol>
          </Card>
          {rule && (
            <Card title="Platform fee per job" subtitle="Your account's active deduction rule">
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-gray-500">Per-job charge</dt><dd className="tabular-nums">{inr(rule.perJobCharge, 2)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">GST ({rule.gstPercent}%)</dt><dd className="tabular-nums">{inr((rule.perJobCharge * rule.gstPercent) / 100, 2)}</dd></div>
                <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold"><dt>Total per job</dt><dd className="tabular-nums text-brand">{inr(rule.totalPerJob, 2)}</dd></div>
              </dl>
            </Card>
          )}
          <Card title="Billing">
            <div className="flex flex-col gap-2 text-sm">
              {can('invoices.read') && <Link to="/b2b/billing/invoices" className="text-brand hover:underline">Invoices</Link>}
              <Link to="/b2b/billing/reconciliation" className="text-brand hover:underline">Reconciliation</Link>
              <Link to="/b2b/reports/financial" className="text-brand hover:underline">Financial report</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── Add funds ─────────────────────────── */
const AddFunds = () => {
  const { can } = useB2BSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: summary, isLoading, error, refetch } = useWalletSummary();
  const [amount, setAmount] = useState('');
  const [methodKey, setMethodKey] = useState('');
  const [processing, setProcessing] = useState(false);

  const methods = summary?.topUpMethods || [];
  const method = methods.find((m) => m.key === methodKey) || null;
  useEffect(() => {
    if (!methodKey && methods.length) setMethodKey((methods.find((m) => !m.requiresApproval) || methods[0]).key);
  }, [methods, methodKey]);

  const amountNum = Number(amount);
  const amountError = useMemo(() => {
    if (!amount) return null;
    if (!Number.isFinite(amountNum) || amountNum <= 0) return 'Enter an amount above zero';
    if (method?.minAmount && amountNum < method.minAmount) return `Minimum for ${method.label} is ${inr(method.minAmount)}`;
    if (method?.maxAmount && amountNum > method.maxAmount) return `Maximum for ${method.label} is ${inr(method.maxAmount)}`;
    return null;
  }, [amount, amountNum, method]);

  // Presets are derived from the method's limits, not fixed amounts.
  const presets = useMemo(() => {
    const base = [5000, 10000, 25000, 50000, 100000];
    return base.filter((v) => (!method?.minAmount || v >= method.minAmount) && (!method?.maxAmount || v <= method.maxAmount));
  }, [method]);

  if (!can('wallet.topup')) {
    return <EmptyState title="You cannot add funds" message="Your role can view the wallet but not top it up. Ask a finance user or your company admin." />;
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const onlineMethod = method && !method.requiresApproval && method.key !== 'DEMO';

  const pay = async (e) => {
    e.preventDefault();
    if (!method || amountError || !amountNum) return;
    setProcessing(true);
    try {
      if (!(await loadRazorpay())) {
        toast.error('Could not load the payment gateway. Check your connection and retry.');
        setProcessing(false);
        return;
      }
      const { data: order } = await api.post('/b2b/wallet/create-topup-order', { amount: amountNum, paymentMethod: method.key });
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: 'WBI',
        description: 'B2B wallet top-up',
        order_id: order.razorpayOrderId,
        prefill: { name: order.company?.name, email: order.company?.email, contact: order.company?.phone },
        theme: { color: '#10AFA5' },
        modal: { ondismiss: () => setProcessing(false) },
        handler: async (response) => {
          try {
            const { data } = await api.post('/b2b/wallet/verify-topup-payment', {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              transactionId: order.transactionId
            });
            toast.success(data.message || `${inr(amountNum)} credited`);
            ['b2bWalletSummary', 'b2bWalletTransactions', 'b2bWalletGate', 'execMetrics', 'b2bJobsStats'].forEach((k) =>
              queryClient.invalidateQueries({ queryKey: [k] })
            );
            navigate('/b2b/billing/wallet');
          } catch (err) {
            toast.error(err.response?.data?.message || 'Payment verification failed. If money was debited, contact support with the payment ID.');
          } finally {
            setProcessing(false);
          }
        }
      });
      rzp.on('payment.failed', (resp) => {
        toast.error(resp?.error?.description || 'Payment failed');
        setProcessing(false);
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start the payment');
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 pb-10 max-w-4xl">
      <PageHeader title="Add funds" subtitle="Top up your wallet to confirm uploads and fund jobs." />
      <BalanceCards summary={summary} loading={isLoading} />

      {summary?.billingMode === 'DEMO' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Demo account: top-ups here are simulated and never settled.
        </div>
      )}

      <Card title="Top-up method" subtitle="Methods are set by WBI for your account">
        {isLoading ? <div className="h-20 bg-gray-50 rounded animate-pulse" /> : methods.length === 0 ? (
          <EmptyState title="No top-up method is enabled" message="Ask your WBI account manager to enable one for your account." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="radiogroup">
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={methodKey === m.key}
                onClick={() => setMethodKey(m.key)}
                className={`text-left border rounded-xl p-4 transition-colors ${methodKey === m.key ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {m.requiresApproval ? 'Credited once WBI finance confirms receipt' : 'Credited instantly'}
                  {m.minAmount ? ` · min ${inr(m.minAmount)}` : ''}
                  {m.maxAmount ? ` · max ${inr(m.maxAmount)}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </Card>

      {method && !onlineMethod && (
        <Card title={`How to pay by ${method.label}`}>
          <div className="flex gap-3 text-sm text-gray-700">
            <FiInfo className="w-5 h-5 text-brand shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="whitespace-pre-line">{method.instructions || 'Contact WBI finance for payment details.'}</p>
              <p className="text-xs text-gray-500">
                After paying, raise a <Link to="/b2b/support" className="text-brand hover:underline">support ticket</Link> in the Wallet category with the reference number so finance can credit your wallet.
              </p>
            </div>
          </div>
        </Card>
      )}

      {onlineMethod && (
        <Card title="Amount">
          <form onSubmit={pay} className="space-y-4">
            <div className="max-w-sm">
              <label htmlFor="topup-amount" className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹)</label>
              <input
                id="topup-amount"
                type="number"
                inputMode="decimal"
                min={method.minAmount || 1}
                max={method.maxAmount || undefined}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${inputCls} w-full`}
                placeholder={method.minAmount ? `At least ${method.minAmount}` : 'Enter amount'}
                aria-invalid={Boolean(amountError)}
              />
              {amountError && <p className="text-xs text-red-600 mt-1">{amountError}</p>}
            </div>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {presets.map((v) => (
                  <button key={v} type="button" onClick={() => setAmount(String(v))}
                    className={`h-9 px-3 rounded-lg border text-xs font-semibold ${Number(amount) === v ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {inr(v)}
                  </button>
                ))}
              </div>
            )}
            <button type="submit" disabled={processing || !amountNum || Boolean(amountError)} className={btnPrimary}>
              {processing ? 'Processing…' : `Pay ${amountNum > 0 ? inr(amountNum) : ''}`}
            </button>
            <p className="text-xs text-gray-500">Payments are processed by Razorpay. A tax invoice is generated for every successful top-up.</p>
          </form>
        </Card>
      )}
    </div>
  );
};

/* ─────────────────────────── Transactions ─────────────────────────── */
const Transactions = () => {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ ledgerType: '', status: '', paymentMode: '', startDate: '', endDate: '' });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [filters, debounced]);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['b2bWalletTransactions'] });
    socket.on('b2b:walletUpdated', refresh);
    return () => socket.off('b2b:walletUpdated', refresh);
  }, [socket, queryClient]);

  const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), search: debounced || undefined };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bWalletTransactions', 'list', params, page],
    queryFn: async () => (await api.get('/b2b/wallet/transactions', { params: { ...params, page, limit: 25 } })).data,
    placeholderData: (prev) => prev
  });
  const p = data?.pagination;
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Transactions"
        subtitle="The wallet ledger: every movement with the balances it left behind."
        actions={
          <button type="button" className={btnSecondary}
            onClick={() => downloadFile('/b2b/wallet/transactions/export', { params, fallbackName: 'wallet-statement.csv', label: 'Preparing statement…' })}>
            <FiDownload /> Download statement
          </button>
        }
      />
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-50">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Transaction ID, payment ID or remark" className={`${inputCls} w-full pl-9`} />
          </div>
          <select value={filters.ledgerType} onChange={set('ledgerType')} className={inputCls} aria-label="Type">
            <option value="">All types</option>
            {Object.entries(LEDGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.status} onChange={set('status')} className={inputCls} aria-label="Status">
            <option value="">All statuses</option>
            {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={filters.paymentMode} onChange={set('paymentMode')} className={inputCls} aria-label="Mode">
            <option value="">Real and demo</option>
            <option value="REAL">Real money</option>
            <option value="DEMO">Demo</option>
          </select>
          <input type="date" value={filters.startDate} onChange={set('startDate')} className={inputCls} aria-label="From" />
          <input type="date" value={filters.endDate} onChange={set('endDate')} className={inputCls} aria-label="To" />
        </div>
        <LedgerTable rows={data?.data || []} isLoading={isLoading} error={error} refetch={refetch} />
        {p && <Pagination page={p.page} totalPages={p.totalPages} total={p.total} limit={p.limit} onPage={setPage} />}
      </div>
    </div>
  );
};

const Wallet = ({ section = 'wallet' }) => {
  if (section === 'add-funds') return <AddFunds />;
  if (section === 'transactions') return <Transactions />;
  return <WalletOverview />;
};

export default Wallet;
