import React, { useCallback, useEffect, useState } from 'react';
import { FiFileText, FiLoader, FiDownload, FiPlus, FiCheck, FiSearch } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

/**
 * B2B invoices across companies: filter, download, record a payment, and
 * generate a monthly invoice from a company's closed jobs. Every change goes
 * through the admin invoice API, which validates it and writes an audit entry.
 */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const errMsg = (e, f) => e?.response?.data?.message || f;
const STATUS_STYLE = {
  paid: 'bg-green-100 text-green-700', Settled: 'bg-green-100 text-green-700',
  generated: 'bg-blue-100 text-blue-700', pending: 'bg-orange-100 text-orange-700',
  overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-200 text-gray-600', draft: 'bg-gray-100 text-gray-600'
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const B2BInvoices = () => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState([]);
  const [busy, setBusy] = useState(null);
  const now = new Date();
  const [gen, setGen] = useState({ open: false, companyId: '', month: now.getMonth() === 0 ? 11 : now.getMonth() - 1, year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() });

  useEffect(() => {
    api.get('/admin/b2b-companies', { params: { limit: 200 } })
      .then((res) => setCompanies(res.data?.data || []))
      .catch((e) => toast.error(errMsg(e, 'Failed to load companies')));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/b2b/invoices', {
        params: { page, limit: 20, status: status || undefined, companyId: companyId || undefined, search: query || undefined }
      });
      setInvoices(res.data?.data?.invoices || res.data?.data || []);
      setPagination(res.data?.pagination || { pages: 1, total: 0 });
    } catch (e) {
      toast.error(errMsg(e, 'Failed to load B2B invoices'));
    } finally {
      setLoading(false);
    }
  }, [page, status, companyId, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, companyId, query]);

  const download = async (inv) => {
    const id = toast.loading('Preparing PDF…');
    try {
      const res = await api.get(`/admin/b2b/invoices/${inv._id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoiceNumber || inv._id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Downloaded', { id });
    } catch (e) {
      let msg = 'Download failed';
      if (e?.response?.data instanceof Blob) {
        try { msg = JSON.parse(await e.response.data.text()).message || msg; } catch { /* keep default */ }
      }
      toast.error(msg, { id });
    }
  };

  const markPaid = async (inv) => {
    const ref = window.prompt(`Record payment of ${money(inv.totalAmount || inv.amount)} for ${inv.invoiceNumber}. Enter the bank reference / UTR:`);
    if (ref === null) return;
    if (!ref.trim()) {
      toast.error('A payment reference is required');
      return;
    }
    setBusy(inv._id);
    try {
      const res = await api.patch(`/admin/b2b/invoices/${inv._id}/status`, {
        paymentStatus: 'paid', transactionId: ref.trim(), paymentMethod: 'bank_transfer', reason: `Payment recorded: ${ref.trim()}`
      });
      if (res.data?.pdfWarning) toast(res.data.pdfWarning, { icon: '⚠️' });
      else toast.success('Payment recorded');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not record payment'));
    } finally {
      setBusy(null);
    }
  };

  const generate = async (e) => {
    e.preventDefault();
    if (!gen.companyId) {
      toast.error('Choose a company');
      return;
    }
    setBusy('generate');
    try {
      const res = await api.post('/admin/b2b/invoices/generate-monthly', { companyId: gen.companyId, month: Number(gen.month), year: Number(gen.year) });
      toast.success(res.data?.message || 'Invoice generated');
      setGen((g) => ({ ...g, open: false }));
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Could not generate the invoice'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <CardShell icon={FiFileText} title="B2B invoices">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white" aria-label="Company">
          <option value="">All companies</option>
          {companies.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white" aria-label="Status">
          <option value="">All statuses</option>
          <option value="pending">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }} className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice number" className="h-9 bg-gray-50 border border-gray-200 text-xs rounded-xl pl-9 pr-3 w-48" />
        </form>
        <button type="button" onClick={() => setGen((g) => ({ ...g, open: !g.open, companyId: g.companyId || companyId }))}
          className="ml-auto h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
          <FiPlus /> Generate monthly invoice
        </button>
      </div>

      {gen.open && (
        <form onSubmit={generate} className="mb-4 p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Company</label>
            <select value={gen.companyId} onChange={(e) => setGen({ ...gen, companyId: e.target.value })} className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white min-w-[200px]">
              <option value="">Choose…</option>
              {companies.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Month</label>
            <select value={gen.month} onChange={(e) => setGen({ ...gen, month: e.target.value })} className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Year</label>
            <input type="number" value={gen.year} onChange={(e) => setGen({ ...gen, year: e.target.value })} className="h-9 w-24 border border-gray-200 rounded-xl px-3 text-xs" />
          </div>
          <button type="submit" disabled={busy === 'generate'} className="h-9 px-4 bg-blue-600 text-white text-xs font-bold rounded-xl disabled:bg-gray-300">
            {busy === 'generate' ? 'Generating…' : 'Generate'}
          </button>
          <p className="text-[11px] text-gray-500 w-full">Bills every closed job of that month not yet on an invoice.</p>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><FiLoader className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No invoices found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3 pr-4">Invoice</th>
                <th className="py-3 pr-4">Company</th>
                <th className="py-3 pr-4">Type</th>
                <th className="py-3 pr-4">Period</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const paid = ['paid', 'Settled'].includes(inv.status) || inv.paymentStatus === 'paid';
                return (
                  <tr key={inv._id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 font-medium">{inv.invoiceNumber || inv._id}</td>
                    <td className="py-3 pr-4">{inv.companyId?.companyName || inv.companyName || '—'}</td>
                    <td className="py-3 pr-4 capitalize">{inv.invoiceType || '—'}</td>
                    <td className="py-3 pr-4 text-xs text-gray-600">{inv.billingPeriod || (inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : '—')}</td>
                    <td className="py-3 pr-4">{money(inv.totalAmount || inv.amount)}</td>
                    <td className="py-3 pr-4"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${STATUS_STYLE[inv.status] || 'bg-gray-100 text-gray-600'}`}>{inv.status || '—'}</span></td>
                    <td className="py-3 pr-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => download(inv)} className="text-xs font-bold text-blue-600 flex items-center gap-1"><FiDownload /> PDF</button>
                        {!paid && inv.status !== 'cancelled' && (
                          <button type="button" disabled={busy === inv._id} onClick={() => markPaid(inv)} className="text-xs font-bold text-green-700 flex items-center gap-1 disabled:opacity-40"><FiCheck /> Mark paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="flex justify-between items-center pt-3 text-xs font-bold">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-blue-600 disabled:text-gray-300">Previous</button>
              <span className="text-gray-500">Page {page} of {pagination.pages} · {pagination.total} invoices</span>
              <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} className="text-blue-600 disabled:text-gray-300">Next</button>
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
};

export default B2BInvoices;
