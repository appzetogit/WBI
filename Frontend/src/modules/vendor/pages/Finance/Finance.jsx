import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import {
  Wallet,
  RefreshCw,
  Search,
  Download,
  ArrowDownToLine,
  Landmark,
  ShieldCheck,
  FileText,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Percent,
  ReceiptIndianRupee,
  Layers,
  Send,
  Bell,
  PlayCircle
} from 'lucide-react';
import { useVendorConfig } from '../../context/VendorConfigContext';
import useFinanceCounts from '../../hooks/useFinanceCounts';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import {
  fetchWallet,
  fetchClientReceivables,
  fetchB2BReceivables,
  updateReceivable,
  fetchQuotations,
  fetchInvoices,
  updateFinanceDocument,
  fetchPaymentMilestones,
  updatePaymentMilestone,
  fetchEarningsByService,
  formatINR,
  statusColors,
  syncFinanceData,
  downloadFinanceDocument,
  createInvoicePayOrder,
  verifyInvoicePayment
} from '../../services/financeService';
import { toast } from 'react-hot-toast';
import Pagination from '../BusinessIntake/components/Pagination';
import EmptyState from '../BusinessIntake/components/EmptyState';
import EarningsTab from './components/EarningsTab';
import WalletTab from './components/WalletTab';
import EngineerPaymentsTab from './components/EngineerPaymentsTab';
import SettlementsTab from './components/SettlementsTab';

const FinanceContext = createContext(null);
const PAGE_SIZE = 8;

export const useFinanceWorkspace = () => useContext(FinanceContext);

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
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients, projects, invoice or reference..." className="w-full py-2 pl-9 pr-3 text-xs border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500" />
      </div>
      <select value={filters.category} onChange={(event) => setFilter('category', event.target.value)} className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl">
        <option value="">All Services</option>
        {approvedServices.map((service) => (
          <option key={service.categoryCode || service.code} value={service.categoryCode || service.code}>{service.categoryName || service.name}</option>
        ))}
      </select>
      <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)} className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl">
        <option value="">All Status</option>
        {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
      </select>
      <button className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors">Apply</button>
    </form>
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
            {data.map((item) => <div key={item._id} className="p-5 border border-gray-200 rounded-xl shadow-sm bg-white">
              <div className="flex justify-between gap-2"><div><p className="font-mono text-[11px] text-gray-400">{item.receivableCode}</p><h3 className="font-bold">{item.clientName}</h3><p className="text-xs text-gray-500">{item.projectName} · {item.serviceCategoryName}</p></div><Status value={item.status} /></div>
              <div className="grid grid-cols-3 gap-2 my-3 text-xs"><span>Amount<br /><b>{formatINR(item.amount)}</b></span><span>Paid<br /><b>{formatINR(item.paidAmount)}</b></span><span>Remaining<br /><b>{formatINR(item.remainingAmount ?? item.amount - item.paidAmount)}</b></span></div>
              <p className="mb-3 text-xs text-gray-500">Due {new Date(item.dueDate).toLocaleDateString('en-IN')} {b2b && `· PO ${item.poNumber}`}</p>
              <div className="flex gap-2"><button onClick={() => act(item._id, 'remind')} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg"><Bell className="w-3 h-3" /> Reminder</button>{item.status !== 'paid' && item.status !== 'cancelled' && <button onClick={() => act(item._id, 'record_payment')} className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg">Record Payment</button>}</div>
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
  return (
    <div className="space-y-4">
      <FinanceFilter statuses={statuses} />
      {loading ? <ListLoading /> : data.length === 0 ? <EmptyState icon={FileText} title={`No ${invoices ? 'invoices' : 'quotations'}`} description="Sync pulls live proposals/contracts. Approved quotations convert into payment milestones." /> : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.map((doc) => <div key={doc._id} className="p-5 border border-gray-200 rounded-xl shadow-sm bg-white">
              <div className="flex justify-between gap-2"><div><p className="font-mono text-[11px] text-gray-400">{doc.documentCode}</p><h3 className="font-bold">{doc.clientName}</h3><p className="text-xs text-gray-500">{doc.projectName} · {doc.serviceCategoryName}</p></div><Status value={doc.status} /></div>
              <p className="mt-3 text-sm text-gray-600">{doc.scope}</p>
              <div className="flex justify-between py-3 mt-3 border-t border-gray-100"><span className="text-xs text-gray-500">{invoices ? doc.invoiceType?.replace(/_/g, ' ') : `${doc.items?.length || 0} line items`} · Tax {doc.taxRate}%</span><b>{formatINR(doc.total)}</b></div>
              <div className="flex flex-wrap gap-2">
                {!invoices && doc.status === 'draft' && <button onClick={() => act(doc._id, 'send')} className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-teal-600 rounded-lg"><Send className="w-3 h-3" /> Send</button>}
                {!invoices && ['sent', 'negotiation'].includes(doc.status) && <><button onClick={() => act(doc._id, 'approve')} className="px-3 py-1.5 text-xs text-white bg-emerald-600 rounded-lg">Approve</button><button onClick={() => act(doc._id, 'reject')} className="px-3 py-1.5 text-xs text-red-700 border border-red-200 rounded-lg">Reject</button></>}
                {!invoices && doc.status === 'approved' && !doc.convertedToProject && <button onClick={() => act(doc._id, 'convert')} className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg">Convert to Project</button>}
                {invoices && doc.status === 'draft' && <button onClick={() => act(doc._id, 'issue')} className="px-3 py-1.5 text-xs text-white bg-teal-600 rounded-lg">Issue Invoice</button>}
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
              return <div key={item._id} className="p-5 border border-gray-200 rounded-xl shadow-sm bg-white">
                <div className="flex justify-between gap-2"><div><p className="font-mono text-[11px] text-gray-400">{item.milestoneCode}</p><h3 className="font-bold">{item.name}</h3><p className="text-xs text-gray-500">{item.projectName} · {item.serviceCategoryName}</p></div><Status value={item.status} /></div>
                <div className="flex items-end justify-between my-3"><div><p className="text-xl font-bold">{formatINR(item.amount)}</p><p className="text-xs text-gray-500">{item.percentage}% of project</p></div><p className="text-xs text-gray-500">Due {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-IN') : '—'}</p></div>
                <div className="flex gap-1 mb-3">{['Work', 'QA', 'Client', 'Invoice'].map((label, index) => <span key={label} className={`flex-1 py-1 text-[10px] text-center rounded ${gates[index] ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{label} {gates[index] ? '✓' : '—'}</span>)}</div>
                {action && <button onClick={() => act(item._id, action[0])} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg"><PlayCircle className="w-3 h-3" /> {action[1]}</button>}
              </div>;
            })}
          </div>
          <Pagination {...pageInfo} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

const InvoicesAndReceivablesPage = () => {
  const [subTab, setSubTab] = useState('invoices'); // 'invoices' | 'client_recv' | 'b2b_recv' | 'quotations' | 'milestones'
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-100">
        {[
          { key: 'invoices', label: 'Invoices' },
          { key: 'client_recv', label: 'Client Receivables' },
          { key: 'b2b_recv', label: 'B2B Receivables' },
          { key: 'quotations', label: 'Quotations' },
          { key: 'milestones', label: 'Milestones' }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              subTab === t.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'invoices' && <DocumentsPage invoices />}
      {subTab === 'client_recv' && <ReceivablesPage />}
      {subTab === 'b2b_recv' && <ReceivablesPage b2b />}
      {subTab === 'quotations' && <DocumentsPage />}
      {subTab === 'milestones' && <MilestonesPage />}
    </div>
  );
};

const FinanceLayout = () => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const { refresh: refreshCounts } = useFinanceCounts();
  const { basePath } = useVendorBasePath();
  const location = useLocation();

  const setFilter = useCallback((key, value) => setFilters((current) => ({ ...current, [key]: value })), []);
  const refresh = useCallback(() => { setRefreshKey((key) => key + 1); refreshCounts(); }, [refreshCounts]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncFinanceData();
      refresh();
      toast.success('Finance ledger synced with live completions');
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const value = useMemo(() => ({ search, setSearch, filters, setFilter, refreshKey, refresh }), [search, filters, setFilter, refreshKey, refresh]);

  const base = `${basePath}/finance`;
  const tabs = [
    { label: 'Earnings', path: `${base}/earnings` },
    { label: 'Wallet / Ledger', path: `${base}/wallet` },
    { label: 'Engineer Payments', path: `${base}/engineer-payments` },
    { label: 'Settlements', path: `${base}/settlements` }
  ];

  return (
    <FinanceContext.Provider value={value}>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-200">
        {/* Header Banner Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-lg border border-teal-200 uppercase tracking-wider flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" /> Financial Operations
              </span>
              <span className="text-xs text-gray-400 font-medium">Earnings, Wallet, Engineer Payouts & Admin Settlements</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
              Vendor Finance
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              Track itemized job earnings, inspect your double-entry ledger, manage engineer payouts, and monitor Admin settlements.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold flex items-center gap-2 border border-teal-200 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Finance Data'}</span>
            </button>

            <button
              onClick={refresh}
              className="p-2.5 text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors shadow-sm"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top-Level Navigation Tabs */}
        <div className="bg-white p-2 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `px-5 py-2.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>

        {/* Tab Content */}
        <div>
          <Outlet />
        </div>
      </div>
    </FinanceContext.Provider>
  );
};

const Finance = () => (
  <Routes>
    <Route element={<FinanceLayout />}>
      <Route path="/" element={<Navigate to="earnings" replace />} />
      <Route path="earnings" element={<EarningsTab />} />
      <Route path="wallet" element={<WalletTab />} />
      <Route path="engineer-payments" element={<EngineerPaymentsTab />} />
      <Route path="settlements" element={<SettlementsTab />} />
      <Route path="payouts" element={<Navigate to="settlements" replace />} />
      <Route path="invoices" element={<Navigate to="earnings" replace />} />
      <Route path="client-receivables" element={<Navigate to="earnings" replace />} />
      <Route path="b2b-receivables" element={<Navigate to="earnings" replace />} />
      <Route path="quotations" element={<Navigate to="earnings" replace />} />
      <Route path="milestones" element={<Navigate to="earnings" replace />} />
    </Route>
  </Routes>
);

export default Finance;
