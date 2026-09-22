import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, PackagePlus } from 'lucide-react';
import { PageHeader, RefreshButton, Skeleton, EmptyState, ErrorState, Pagination } from '../../components/ops/OpsUi';
import { formatINR } from '../../components/ops/opsFormat';
import { getPartsCatalog, errorMessage } from '../../services/vendorJobsService';
import useVendorBasePath from '../../hooks/useVendorBasePath';
import { AddItemModal } from './Inventory';

/** WBI parts catalog: approved parts with price, GST and HSN, and your stock of each. */
const PartsCatalog = () => {
  const { basePath } = useVendorBasePath();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: '', rows: [], categories: [], pagination: {} });
  const [stocking, setStocking] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const res = await getPartsCatalog({ page, limit: 30, ...(debounced ? { search: debounced } : {}), ...(categoryId ? { categoryId } : {}) });
      setState({ loading: false, error: '', rows: res.data || [], categories: res.categories || [], pagination: res.pagination || {} });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err, 'Could not load the parts catalog') }));
    }
  }, [page, debounced, categoryId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1500px] mx-auto">
      <PageHeader
        eyebrow="Parts"
        title="Parts"
        subtitle="The WBI parts catalog — approved parts with list price, GST and HSN. Stock a part to keep it in your inventory and reserve it for jobs."
        actions={<RefreshButton onClick={load} spinning={false} />}
      />
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part name, HSN…" aria-label="Search parts" className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm" />
        </div>
        {state.categories.length > 0 && (
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} aria-label="Category" className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold">
            <option value="">All categories</option>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
          </select>
        )}
      </div>

      {state.loading ? <Skeleton rows={6} /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !state.rows.length ? (
        <EmptyState title={debounced || categoryId ? 'No parts match' : 'The catalog is empty'} message={debounced || categoryId ? 'Try another search.' : 'WBI has not published catalog parts yet. You can still add your own items under Inventory.'} action={<Link to={`${basePath}/parts/inventory`} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold">Go to inventory</Link>} />
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 text-left">
                <tr><th className="px-4 py-3">Part</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">HSN</th><th className="px-3 py-3 text-right">List price</th><th className="px-3 py-3 text-right">GST</th><th className="px-3 py-3 text-right">Your stock</th><th className="px-3 py-3" /></tr>
              </thead>
              <tbody>
                {state.rows.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-2.5"><p className="font-bold text-gray-900">{p.name}</p>{p.description && <p className="text-gray-500">{p.description}</p>}</td>
                    <td className="px-3 py-2.5">{p.category?.name || '—'}</td>
                    <td className="px-3 py-2.5 font-mono">{p.hsnCode || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(p.price)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.gstApplicable ? `${p.gstPercentage}%` : 'Exempt'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.inStock === null ? <span className="text-gray-400">Not stocked</span> : <><b>{p.inStock}</b> free{p.reserved ? ` · ${p.reserved} reserved` : ''}</>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {p.inStock === null
                        ? <button type="button" onClick={() => setStocking(p)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white inline-flex items-center gap-1"><PackagePlus className="w-3.5 h-3.5" /> Stock it</button>
                        : <Link to={`${basePath}/parts/inventory`} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-700">Manage</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={state.pagination.page} totalPages={state.pagination.totalPages} total={state.pagination.total} onPage={setPage} />
        </>
      )}

      {stocking && <AddItemModal preset={stocking} onClose={() => setStocking(null)} onSaved={load} />}
    </div>
  );
};

export default PartsCatalog;
