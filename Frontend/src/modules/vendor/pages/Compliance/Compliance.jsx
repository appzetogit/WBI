import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, RefreshCw, Search, ShieldAlert, UploadCloud } from 'lucide-react';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { fetchCompliance, updateCompliance, statusColors } from '../../services/globalModulesService';
import EmptyState from '../BusinessIntake/components/EmptyState';
import Pagination from '../BusinessIntake/components/Pagination';

const PAGE = 12;

const Compliance = () => {
  const { approvedServices = [], complianceDocs = [] } = useVendorConfig() || {};
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '' });
  const [data, setData] = useState([]);
  const [stats, setStats] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCompliance({ page, limit: PAGE, search: search || undefined, category: filters.category || undefined, status: filters.status || undefined });
      setData(res.data.data || []);
      setStats(res.data.stats || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    try {
      await updateCompliance(id, { action });
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Action failed');
    }
  };

  const total = stats.reduce((sum, row) => sum + row.count, 0);
  const verified = stats.find((row) => row._id === 'verified')?.count || 0;
  const progress = total ? Math.round((verified / total) * 100) : 0;

  return (
    <div className="min-h-full p-6 bg-gray-50/80 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl"><FileText className="w-5 h-5 text-white" /></span>
            Compliance
          </h1>
          <p className="mt-1.5 ml-[46px] text-sm text-gray-500">Dynamic legal, tax, license, insurance and certification rules by service.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      <div className="p-5 mb-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Compliance Progress</p>
            <p className="text-xs text-gray-500">{verified}/{total} requirements verified</p>
          </div>
          <span className="text-2xl font-bold text-gray-900">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden bg-gray-100 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} /></div>
        {complianceDocs.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Required for your services</p>
            <div className="flex flex-wrap gap-2">
              {complianceDocs.map((doc) => (
                <span key={doc.name} className={`text-xs px-2.5 py-1 rounded-full border ${doc.required ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  {doc.name}{doc.expiryTracked ? ' · expiry tracked' : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 p-4 mb-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute w-4 h-4 text-gray-400 left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search document, license, service..." className="w-full py-2.5 pl-9 pr-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All Services</option>
          {approvedServices.map((s) => <option key={s.categoryCode || s.code} value={s.categoryCode || s.code}>{s.categoryName || s.name}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg">
          <option value="">All Status</option>
          {['verified', 'pending', 'expired', 'rejected', 'renewal_required'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No compliance requirements" description="Compliance templates are generated from selected services." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.map((doc) => {
              const soon = doc.expiresAt && new Date(doc.expiresAt) - Date.now() < 30 * 86400000;
              return (
                <div key={doc._id} className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
                  <div className="flex justify-between gap-3">
                    <div className="flex gap-3">
                      <FileText className="w-5 h-5 mt-1 text-gray-400" />
                      <div>
                        <h3 className="font-bold text-gray-900">{doc.name}</h3>
                        <p className="text-xs text-gray-500">{doc.serviceCategoryName || 'Platform'} · {doc.category}</p>
                      </div>
                    </div>
                    <span className={`h-fit text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${statusColors[doc.status] || statusColors.pending}`}>{doc.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs text-gray-500">
                    <span>{doc.documentNumber || 'No document number'}</span>
                    {doc.expiresAt && <span className={soon ? 'text-red-600 font-semibold' : ''}>Expires {new Date(doc.expiresAt).toLocaleDateString('en-IN')}</span>}
                    {doc.mandatory && <span className="px-2 py-0.5 text-red-700 bg-red-50 rounded-full">Mandatory</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {doc.status !== 'verified' && <button onClick={() => act(doc._id, 'verify')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><CheckCircle2 className="w-3 h-3" /> Verify</button>}
                    {(doc.status === 'expired' || doc.status === 'renewal_required' || soon) && <button onClick={() => act(doc._id, 'renew')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg"><UploadCloud className="w-3 h-3" /> Renew</button>}
                    {doc.status === 'pending' && <button onClick={() => act(doc._id, 'remind')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><AlertCircle className="w-3 h-3" /> Reminder</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
        </>
      )}
    </div>
  );
};

export default Compliance;
