import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiSearch, FiUpload, FiDownload, FiMapPin, FiFilter, FiEye } from 'react-icons/fi';
import { siteApi } from '../../services/projectOS.api';
import { StatusBadge } from '../../components/WidgetRenderer';
import toast from 'react-hot-toast';

const STATUS_OPTS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

export default function SitesPage({ projectId }) {
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', state: '' });
  const [stateList, setStateList] = useState([]);
  const [importing, setImporting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await siteApi.getAll(projectId, { page, limit: 30, search, ...filters });
      setSites(res.data.data);
      setTotal(res.data.total);
      if (res.data.filters?.states) setStateList(res.data.filters.states);
    } catch (e) { toast.error('Failed to load sites'); }
    finally { setLoading(false); }
  }, [projectId, page, search, filters]);

  useEffect(() => { load(); }, [load]);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await siteApi.bulkImport(projectId, file);
      toast.success(res.data.message);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Import failed'); }
    finally { setImporting(false); e.target.value = ''; }
  };

  const downloadTemplate = async () => {
    try {
      const res = await siteApi.getImportTemplate(projectId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'wbi_site_import_template.xlsx'; a.click();
    } catch { toast.error('Failed to download template'); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Sites</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total} sites across all regions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors">
            <FiDownload size={14} /> Template
          </button>
          <label className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors ${importing ? 'opacity-60' : ''}`}>
            <FiUpload size={14} className={importing ? 'animate-spin' : ''} />
            {importing ? 'Importing...' : 'Bulk Import'}
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
            <FiPlus size={14} /> Add Site
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-48">
          <FiSearch size={14} className="text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search sites..." className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder-slate-400" />
        </div>
        <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
          className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-600">
          <option value="">All Status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <select value={filters.state} onChange={e => { setFilters(f => ({ ...f, state: e.target.value })); setPage(1); }}
          className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-600">
          <option value="">All States</option>
          {stateList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Sites Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Site Code', 'Name', 'Location', 'Status', 'Progress', 'Tasks', 'SLA', 'Actions'].map(h => (
                  <th key={h} className="text-left text-xs font-bold text-slate-500 uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : sites.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-slate-400 text-sm">No sites found. Start by importing or adding a site.</td></tr>
              ) : sites.map(site => (
                <tr key={site._id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3"><span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{site.siteCode}</span></td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{site.name}</p>{site.externalSiteCode && <p className="text-xs text-slate-400">{site.externalSiteCode}</p>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-slate-600">
                      <FiMapPin size={12} className="text-slate-400" />
                      <span>{site.hierarchy?.city || '—'}{site.hierarchy?.state ? `, ${site.hierarchy.state}` : ''}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={site.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${site.progress || 0}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{site.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">{site.taskSummary?.completed || 0}/{site.taskSummary?.total || 0}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={site.slaStatus || 'ON_TRACK'} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`site/${site._id}`)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                      <FiEye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
            <p className="text-xs text-slate-500">Showing {Math.min((page - 1) * 30 + 1, total)}–{Math.min(page * 30, total)} of {total}</p>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border border-slate-200 rounded-md disabled:opacity-40 hover:bg-white">Prev</button>
              <button disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border border-slate-200 rounded-md disabled:opacity-40 hover:bg-white">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
