import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import {
  Wallet, RefreshCw, Search, Download, ArrowDownToLine, Landmark, ShieldCheck,
  ReceiptIndianRupee, FileText, Check, X, Send, Bell, IndianRupee, PlayCircle
} from 'lucide-react';
import { useVendorConfig } from '../../context/VendorConfigContext';
import useFinanceCounts from '../../hooks/useFinanceCounts';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import {
  fetchWallet, fetchClientReceivables, fetchB2BReceivables,
  updateReceivable, fetchQuotations, fetchInvoices, updateFinanceDocument,
  fetchPaymentMilestones, updatePaymentMilestone, fetchEarningsByService, formatINR, statusColors,
  exportFinanceLedger, syncFinanceData, downloadFinanceDocument, createInvoicePayOrder, verifyInvoicePayment
} from '../../services/financeService';
import { toast } from 'react-hot-toast';
import Pagination from '../BusinessIntake/components/Pagination';
import EmptyState from '../BusinessIntake/components/EmptyState';
import WithdrawalWizard from './WithdrawalWizard';

const FinanceContext = createContext(null);
const PAGE_SIZE = 8;

const useFinanceWorkspace = () => useContext(FinanceContext);

const Status = ({ value }) => (
  <span className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[value] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
    {String(value || 'unknown').replace(/_/g, ' ')}
  </span>
);

const FinanceFilter = ({ statuses = [] }) => {
  const { search, setSearch, filters, setFilter, refresh } = useFinanceWorkspace();
  const { approvedServices = [] } = useVendorConfig() || {};
  return (
    <form onSubmit={(event) => { event.preventDefault(); refresh(); }} className="flex flex-wrap gap-3 p-4 mb-4 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute h-4 w-4 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients, projects, invoice or reference..." className="w-full py-2.5 pl-9 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <select value={filters.category} onChange={(event) => setFilter('category', event.target.value)} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
        <option value="">All Services</option>
        {approvedServices.map((service) => (
          <option key={service.categoryCode || service.code} value={service.categoryCode || service.code}>{service.categoryName || service.name}</option>
        ))}
      </select>
      <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
        <option value="">All Status</option>
        {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
      </select>
      <button className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg">Apply</button>
    </form>
  );
};

const FinanceStats = () => {
  const { counts, loading } = useFinanceCounts();
  const cards = [
    ['Available Wallet', formatINR(counts.availableBalance), 'bg-emerald-600'],
    ['Escrow Balance', formatINR(counts.escrowBalance), 'bg-violet-600'],
    ['Client Pending', counts.clientPending, 'bg-amber-500'],
    ['B2B Pending', counts.b2bPending, 'bg-blue-600'],
    ['Invoices Due', counts.invoicesDue, 'bg-red-500'],
    ['Milestones Due', counts.milestonesDue, 'bg-indigo-600']
  ];
  return (
    <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map(([label, value, color]) => (
        <div key={label} className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className={`h-2 w-8 rounded-full ${color} mb-3`} />
          {loading ? <div className="w-20 h-6 bg-gray-100 rounded animate-pulse" /> : <p className="text-xl font-bold text-gray-900">{value}</p>}
          <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
        </div>
      ))}
    </div>
  );
};

const FinanceTabs = () => {
  const { counts } = useFinanceCounts();
  const { basePath } = useVendorBasePath();
  const base = `${basePath}/finance`;
  const tabs = useMemo(() => [
    { label: 'Master Wallet', path: `${base}/wallet`, count: null },
    { label: 'Client Receivables', path: `${base}/client-receivables`, count: 'clientPending' },
    { label: 'B2B Receivables', path: `${base}/b2b-receivables`, count: 'b2bPending' },
    { label: 'Quotations', path: `${base}/quotations`, count: 'quotations' },
    { label: 'Invoices', path: `${base}/invoices`, count: 'invoicesDue' },
    { label: 'Payment Milestones', path: `${base}/milestones`, count: 'milestonesDue' }
  ], [base]);

  return (
    <div className="overflow-x-auto border-b border-gray-200">
      <nav className="flex min-w-max">
        {tabs.map((tab) => (
          <NavLink key={tab.path} to={tab.path} className={({ isActive }) => `relative px-4 py-3 text-sm font-medium whitespace-nowrap ${isActive ? 'text-blue-600 after:absolute after:h-0.5 after:bg-blue-600 after:bottom-0 after:left-0 after:right-0' : 'text-gray-500 hover:text-gray-800'}`}>
            {tab.label}
            {tab.count && counts[tab.count] > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 bg-gray-100 rounded-full">{counts[tab.count]}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

const FinanceLayout = () => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const { refresh: refreshCounts } = useFinanceCounts();
  const setFilter = useCallback((key, value) => setFilters((current) => ({ ...current, [key]: value })), []);
  const refresh = useCallback(() => { setRefreshKey((key) => key + 1); refreshCounts(); }, [refreshCounts]);

  useEffect(() => {
    const onLive = () => refresh();
    window.addEventListener('vendor-finance-updated', onLive);
    return () => window.removeEventListener('vendor-finance-updated', onLive);
  }, [refresh]);

  useEffect(() => {
    (async () => {
      try {
        setSyncing(true);
        await syncFinanceData();
        refresh();
      } catch {
        /* sync is best-effort on open */
      } finally {
        setSyncing(false);
      }
    })();
  }, []);

  const value = useMemo(() => ({ search, setSearch, filters, setFilter, refreshKey, refresh }), [search, filters, setFilter, refreshKey, refresh]);

  return (
    <FinanceContext.Provider value={value}>
      <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
              <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><Wallet className="w-5 h-5 text-white" /></span>
              Finance
            </h1>
            <p className="mt-1.5 ml-[46px] text-sm text-gray-500">Quotation → contract → milestone → QA approval → invoice → wallet → settlement.</p>
          </div>
          <button onClick={refresh} disabled={syncing} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
        <FinanceStats />
        <div className="bg-white border border-b-0 border-gray-200 rounded-t-xl"><FinanceTabs /></div>
        <div className="p-5 bg-white border border-t-0 border-gray-200 rounded-b-xl lg:p-6"><Outlet /></div>
      </div>
    </FinanceContext.Provider>
  );
};

const useList = (fetcher) => {
  const { search, filters, refreshKey } = useFinanceWorkspace();
  const [data, setData] = useState([]);
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetcher({ page, limit: PAGE_SIZE, search: search || undefined, category: filters.category || undefined, status: filters.status || undefined });
      setData(response.data.data || []);
      setExtra(response.data.summary || response.data.stats || {});
      setPageInfo(response.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [fetcher, page, search, filters]);
  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);
  return { data, extra, loading, pageInfo, setPage, load };
};

const ListLoading = () => <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>;

const WalletPage = () => {
  const { search, filters, refreshKey, refresh, setFilter } = useFinanceWorkspace();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [byService, setByService] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [walletRes, earningsRes] = await Promise.all([
        fetchWallet({
          search: search || undefined,
          status: filters.status || undefined,
          category: filters.category || undefined,
          limit: 30
        }),
        fetchEarningsByService()
      ]);
      setWallet(walletRes.data.data?.wallet || null);
      setTransactions(walletRes.data.data?.transactions || []);
      setByService(earningsRes.data?.data?.byService || []);
    } catch {
      setWallet(null);
      setTransactions([]);
      setByService([]);
    } finally {
      setLoading(false);
    }
  }, [search, filters.status, filters.category]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const exportLedger = async () => {
    try {
      setExporting(true);
      const res = await exportFinanceLedger({
        search: search || undefined,
        status: filters.status || undefined,
        category: filters.category || undefined
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vendor-finance-ledger-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Ledger exported');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FinanceFilter statuses={['pending', 'processing', 'completed', 'failed']} />
      {loading ? <ListLoading /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="p-6 text-white bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl lg:col-span-2">
              <p className="text-sm text-gray-300">Available Balance</p>
              <p className="mt-2 text-4xl font-bold">{formatINR(wallet?.availableBalance)}</p>
              <div className="flex flex-wrap gap-3 mt-6">
                <button onClick={() => setWithdrawOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 rounded-lg"><ArrowDownToLine className="w-4 h-4" /> Withdraw Funds</button>
                <button onClick={exportLedger} disabled={exporting} className="flex items-center gap-2 px-4 py-2 text-sm bg-white/10 rounded-lg disabled:opacity-60"><Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export Ledger'}</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Escrow (locked)', wallet?.escrowBalance],
                ['Pending Settlement', wallet?.pendingSettlement],
                ['Total Earnings', wallet?.totalEarnings],
                ['Withdrawn', wallet?.totalWithdrawn],
                ['Commission', wallet?.commissionDeducted],
                ['Processing', wallet?.processingWithdrawal]
              ].map(([label, amount]) => <div key={label} className="p-3 bg-gray-50 rounded-xl"><p className="text-sm font-bold">{formatINR(amount)}</p><p className="text-[11px] text-gray-500">{label}</p></div>)}
            </div>
          </div>

          <WithdrawalWizard
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            onComplete={() => { load(); refresh(); }}
          />

          {/* Per registered service — earnings / pending / escrow */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Payments by Service</h3>
              <p className="text-xs text-gray-500">Based on your registered services</p>
            </div>
            {byService.length === 0 ? (
              <EmptyState
                icon={IndianRupee}
                title="No services linked yet"
                description="After you register and admin approves a service, earnings for that service appear here."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {byService.map((svc) => (
                  <button
                    key={svc.categoryCode}
                    type="button"
                    onClick={() => {
                      setFilter('category', filters.category === svc.categoryCode ? '' : svc.categoryCode);
                    }}
                    className={`text-left p-4 border rounded-xl shadow-sm transition ${
                      filters.category === svc.categoryCode
                        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                        : 'border-gray-200 bg-white hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">{svc.categoryCode}</p>
                        <h4 className="text-sm font-bold text-gray-900 mt-0.5">{svc.categoryName}</h4>
                      </div>
                      <Status value={svc.status === 'active' ? 'paid' : svc.status === 'pending' ? 'pending' : 'draft'} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                      <div>
                        <p className="text-gray-400">Earned</p>
                        <p className="font-bold text-emerald-700">{formatINR(svc.totalEarnings)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Pending</p>
                        <p className="font-bold text-amber-700">{formatINR(svc.pendingReceivables)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">In escrow</p>
                        <p className="font-bold text-violet-700">{formatINR(svc.escrowHeld)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400">
                      {svc.creditCount || 0} payouts
                      {svc.lastPaidAt ? ` · last ${new Date(svc.lastPaidAt).toLocaleDateString('en-IN')}` : ''}
                      {svc.heldJobs ? ` · ${svc.heldJobs} held` : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-left text-gray-500 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No transactions yet</td>
                  </tr>
                ) : transactions.map((transaction) => (
                  <tr key={transaction._id}>
                    <td className="px-4 py-3 font-mono text-xs">{transaction.transactionCode}</td>
                    <td className="px-4 py-3">
                      {transaction.serviceCategoryCode ? (
                        <>
                          <span className="text-[10px] font-bold text-blue-600">{transaction.serviceCategoryCode}</span>
                          <p className="text-[11px] text-gray-500">{transaction.serviceCategoryName || transaction.subCategoryName}</p>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {transaction.description}
                      <p className="text-[11px] text-gray-400">{transaction.projectCode}</p>
                    </td>
                    <td className="px-4 py-3 capitalize">{transaction.type.replace(/_/g, ' ')}</td>
                    <td className={`px-4 py-3 font-bold ${['credit', 'escrow_release', 'refund'].includes(transaction.type) ? 'text-emerald-600' : 'text-gray-900'}`}>
                      {formatINR(transaction.amount)}
                    </td>
                    <td className="px-4 py-3"><Status value={transaction.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const ReceivablesPage = ({ b2b = false }) => {
  const fetcher = useCallback((params) => (b2b ? fetchB2BReceivables(params) : fetchClientReceivables(params)), [b2b]);
  const { data, extra, loading, pageInfo, setPage, load } = useList(fetcher);
  const act = async (id, action) => {
    try {
      const amount = action === 'record_payment' ? Number(window.prompt('Payment amount (blank = full remaining)') || 0) : undefined;
      await updateReceivable(id, { action, amount });
      load();
    } catch (error) { alert(error.response?.data?.message || 'Action failed'); }
  };
  return (
    <div className="space-y-4">
      <FinanceFilter statuses={['pending', 'partial', 'paid', 'overdue', 'cancelled']} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Total', extra.amount], ['Paid', extra.paid], ['Remaining', extra.remaining], [b2b ? 'Collection Rate' : 'Overdue', b2b ? `${extra.collectionRate || 0}%` : formatINR(extra.overdue)]].map(([label, value]) => <div key={label} className="p-3 bg-gray-50 rounded-xl"><p className="text-lg font-bold">{typeof value === 'number' ? formatINR(value) : value}</p><p className="text-xs text-gray-500">{label}</p></div>)}
      </div>
      {loading ? <ListLoading /> : data.length === 0 ? <EmptyState icon={Landmark} title="No receivables" description="Receivables are created from approved contracts and invoices." /> : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.map((item) => <div key={item._id} className="p-5 border border-gray-200 rounded-xl shadow-sm">
              <div className="flex justify-between gap-2"><div><p className="font-mono text-[11px] text-gray-400">{item.receivableCode}</p><h3 className="font-bold">{item.clientName}</h3><p className="text-xs text-gray-500">{item.projectName} · {item.serviceCategoryName}</p></div><Status value={item.status} /></div>
              <div className="grid grid-cols-3 gap-2 my-3 text-xs"><span>Amount<br /><b>{formatINR(item.amount)}</b></span><span>Paid<br /><b>{formatINR(item.paidAmount)}</b></span><span>Remaining<br /><b>{formatINR(item.remainingAmount ?? item.amount - item.paidAmount)}</b></span></div>
              <p className="mb-3 text-xs text-gray-500">Due {new Date(item.dueDate).toLocaleDateString('en-IN')} {b2b && `· PO ${item.poNumber}`}</p>
              <div className="flex gap-2"><button onClick={() => act(item._id, 'remind')} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg"><Bell className="w-3 h-3" /> Reminder</button>{item.status !== 'paid' && item.status !== 'cancelled' && <button onClick={() => act(item._id, 'record_payment')} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg">Record Payment</button>}</div>
            </div>)}
          </div>
          <Pagination {...pageInfo} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

const DocumentsPage = ({ invoices = false }) => {
  const fetcher = useCallback((params) => (invoices ? fetchInvoices(params) : fetchQuotations(params)), [invoices]);
  const { data, loading, pageInfo, setPage, load } = useList(fetcher);
  const statuses = invoices ? ['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled'] : ['draft', 'sent', 'negotiation', 'approved', 'rejected', 'expired'];
  const act = async (id, action) => {
    try {
      await updateFinanceDocument(id, { action });
      toast.success('Updated');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };
  const openPdf = async (id) => {
    try {
      const res = await downloadFinanceDocument(id);
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error.response?.data?.message || 'PDF failed');
    }
  };
  const collectPayment = async (doc) => {
    try {
      const orderRes = await createInvoicePayOrder(doc._id, {
        idempotencyKey: `pay-${doc._id}-${Date.now()}`
      });
      const order = orderRes.data?.data;
      if (!order?.orderId || !order?.keyId) {
        toast.error(orderRes.data?.message || 'Payment order failed');
        return;
      }
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: Math.round(Number(order.amount) * 100),
        currency: order.currency || 'INR',
        name: 'WBI Vendor Finance',
        description: `Invoice ${order.invoiceCode}`,
        order_id: order.orderId,
        handler: async (response) => {
          try {
            await verifyInvoicePayment(doc._id, response);
            toast.success('Payment received into escrow');
            load();
          } catch (error) {
            toast.error(error.response?.data?.message || 'Payment verify failed');
          }
        }
      });
      rzp.open();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to start payment');
    }
  };
  return (
    <div className="space-y-4">
      <FinanceFilter statuses={statuses} />
      {loading ? <ListLoading /> : data.length === 0 ? <EmptyState icon={FileText} title={`No ${invoices ? 'invoices' : 'quotations'}`} description="Sync pulls live proposals/contracts. Approved quotations convert into payment milestones." /> : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.map((doc) => <div key={doc._id} className="p-5 border border-gray-200 rounded-xl shadow-sm">
              <div className="flex justify-between gap-2"><div><p className="font-mono text-[11px] text-gray-400">{doc.documentCode}</p><h3 className="font-bold">{doc.clientName}</h3><p className="text-xs text-gray-500">{doc.projectName} · {doc.serviceCategoryName}</p></div><Status value={doc.status} /></div>
              <p className="mt-3 text-sm text-gray-600">{doc.scope}</p>
              <div className="flex justify-between py-3 mt-3 border-t border-gray-100"><span className="text-xs text-gray-500">{invoices ? doc.invoiceType?.replace(/_/g, ' ') : `${doc.items?.length || 0} line items`} · Tax {doc.taxRate}%</span><b>{formatINR(doc.total)}</b></div>
              <div className="flex flex-wrap gap-2">
                {!invoices && doc.status === 'draft' && <button onClick={() => act(doc._id, 'send')} className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg"><Send className="w-3 h-3" /> Send</button>}
                {!invoices && ['sent', 'negotiation'].includes(doc.status) && <><button onClick={() => act(doc._id, 'approve')} className="px-3 py-1.5 text-xs text-white bg-emerald-600 rounded-lg">Approve</button><button onClick={() => act(doc._id, 'reject')} className="px-3 py-1.5 text-xs text-red-700 border border-red-200 rounded-lg">Reject</button></>}
                {!invoices && doc.status === 'approved' && !doc.convertedToProject && <button onClick={() => act(doc._id, 'convert')} className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 rounded-lg">Convert to Project</button>}
                {invoices && doc.status === 'draft' && <button onClick={() => act(doc._id, 'issue')} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg">Issue Invoice</button>}
                {invoices && ['issued', 'partial', 'overdue'].includes(doc.status) && (
                  <button onClick={() => collectPayment(doc)} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Collect via Razorpay</button>
                )}
                {invoices && doc.status === 'paid' && !doc.escrowReleased && (
                  <button onClick={() => act(doc._id, 'release_escrow')} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg">Release to Wallet</button>
                )}
                <button onClick={() => openPdf(doc._id)} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg"><Download className="w-3 h-3" /> PDF</button>
              </div>
            </div>)}
          </div>
          <Pagination {...pageInfo} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

const MilestonesPage = () => {
  const fetcher = useCallback((params) => fetchPaymentMilestones(params), []);
  const { data, loading, pageInfo, setPage, load } = useList(fetcher);
  const act = async (id, action) => {
    try {
      await updatePaymentMilestone(id, { action });
      toast.success(action === 'invoice' ? 'Invoice generated' : 'Milestone updated');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };
  const nextAction = {
    upcoming: ['complete', 'Complete Milestone'],
    due: ['complete', 'Complete Milestone'],
    qa_pending: ['qa_approve', 'QA Approve'],
    approval_pending: ['client_approve', 'Client Approve'],
    invoice_ready: ['invoice', 'Generate Invoice'],
    invoiced: ['pay', 'Record Payment']
  };
  return (
    <div className="space-y-4">
      <FinanceFilter statuses={['upcoming', 'due', 'qa_pending', 'approval_pending', 'invoice_ready', 'invoiced', 'paid', 'blocked']} />
      {loading ? <ListLoading /> : data.length === 0 ? <EmptyState icon={ShieldCheck} title="No payment milestones" description="Payment plans adapt automatically: sprint-based for software, installation-based for solar." /> : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.map((item) => {
              const action = nextAction[item.status];
              const gates = [item.projectCompleted, item.qaApproved, item.clientApproved, Boolean(item.invoiceNumber)];
              return <div key={item._id} className="p-5 border border-gray-200 rounded-xl shadow-sm">
                <div className="flex justify-between gap-2"><div><p className="font-mono text-[11px] text-gray-400">{item.milestoneCode}</p><h3 className="font-bold">{item.name}</h3><p className="text-xs text-gray-500">{item.projectName} · {item.serviceCategoryName}</p></div><Status value={item.status} /></div>
                <div className="flex items-end justify-between my-3"><div><p className="text-xl font-bold">{formatINR(item.amount)}</p><p className="text-xs text-gray-500">{item.percentage}% of project</p></div><p className="text-xs text-gray-500">Due {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-IN') : '—'}</p></div>
                <div className="flex gap-1 mb-3">{['Work', 'QA', 'Client', 'Invoice'].map((label, index) => <span key={label} className={`flex-1 py-1 text-[10px] text-center rounded ${gates[index] ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{label} {gates[index] ? '✓' : '—'}</span>)}</div>
                {action && <button onClick={() => act(item._id, action[0])} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"><PlayCircle className="w-3 h-3" /> {action[1]}</button>}
              </div>;
            })}
          </div>
          <Pagination {...pageInfo} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

const Finance = () => (
  <Routes>
    <Route element={<FinanceLayout />}>
      <Route path="/" element={<Navigate to="wallet" replace />} />
      <Route path="wallet" element={<WalletPage />} />
      <Route path="client-receivables" element={<ReceivablesPage />} />
      <Route path="b2b-receivables" element={<ReceivablesPage b2b />} />
      <Route path="quotations" element={<DocumentsPage />} />
      <Route path="invoices" element={<DocumentsPage invoices />} />
      <Route path="milestones" element={<MilestonesPage />} />
    </Route>
  </Routes>
);

export default Finance;
