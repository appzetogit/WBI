import React, { useEffect, useState } from 'react';
import { FiRefreshCw, FiSearch, FiShield, FiMapPin } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';

/**
 * Admin — UPI + Location verification logs for CGPE suite.
 */
export default function CgpeSuiteAdmin() {
  const [tab, setTab] = useState('upi');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'upi') {
        const res = await api.get('/verification/admin/upi-verifications', {
          params: { page, limit: 20, status: status || undefined, q: q || undefined }
        });
        setItems(res.data?.data?.items || []);
        setTotal(res.data?.data?.total || 0);
      } else {
        const res = await api.get('/verification/admin/location-verifications', {
          params: { page, limit: 20, status: status || undefined, city: q || undefined }
        });
        setItems(res.data?.data?.items || []);
        setTotal(res.data?.data?.total || 0);
      }
      setSelected(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, tab]);

  const openDetail = async (id) => {
    try {
      const path =
        tab === 'upi'
          ? `/verification/admin/upi-verifications/${id}`
          : `/verification/admin/location-verifications/${id}`;
      const res = await api.get(path);
      setSelected(res.data?.data || null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load detail');
    }
  };

  const reverify = async (id) => {
    if (tab !== 'upi') return;
    try {
      await api.post(`/verification/admin/upi-verifications/${id}/reverify`);
      toast.success('Re-verified');
      load();
      openDetail(id);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Re-verify failed');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiShield className="text-violet-600" /> CGPE Suite
          </h1>
          <p className="text-sm text-slate-500 mt-1">UPI · Mobile-UPI · Location detector logs</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center gap-2"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setTab('upi');
            setPage(1);
          }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === 'upi' ? 'bg-violet-600 text-white' : 'bg-white border'}`}
        >
          UPI / Mobile-UPI
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('location');
            setPage(1);
          }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 ${tab === 'location' ? 'bg-violet-600 text-white' : 'bg-white border'}`}
        >
          <FiMapPin /> Locations
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end bg-white border rounded-2xl p-4">
        <div>
          <label className="text-xs font-semibold text-slate-500">Status</label>
          <select
            className="block mt-1 border rounded-lg px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
            <option value="not_found">Not found</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-slate-500">
            {tab === 'upi' ? 'Search VPA / Mobile / Name' : 'City'}
          </label>
          <div className="flex gap-2 mt-1">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" onClick={() => { setPage(1); load(); }} className="px-3 py-2 rounded-lg bg-violet-600 text-white">
              <FiSearch />
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500 ml-auto">{total} records</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                {tab === 'upi' ? (
                  <>
                    <th className="px-4 py-3">Kind</th>
                    <th className="px-4 py-3">VPA / Mobile</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3">Place</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Purpose</th>
                    <th className="px-4 py-3">Status</th>
                  </>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row._id}
                  className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => openDetail(row._id)}
                >
                  {tab === 'upi' ? (
                    <>
                      <td className="px-4 py-3 text-xs capitalize">{row.kind}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.vpa || row.mobile || '—'}</td>
                      <td className="px-4 py-3 text-xs truncate max-w-[120px]">
                        {row.accountHolderName || row.mobileLinkedName || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100">
                          {row.verificationStatus}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-xs truncate max-w-[140px]">{row.displayName || '—'}</td>
                      <td className="px-4 py-3 text-xs">{row.city || '—'}</td>
                      <td className="px-4 py-3 text-xs">{row.purpose || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100">
                          {row.verificationStatus}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-violet-600 text-xs font-semibold">View</td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No records
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-between items-center px-4 py-3 border-t text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">
              Prev
            </button>
            <span>Page {page}</span>
            <button type="button" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">
              Next
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border rounded-2xl p-4 min-h-[280px]">
          {!selected ? (
            <p className="text-sm text-slate-400 text-center mt-16">Select a record</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="font-mono font-bold text-xs break-all">
                {selected.vpa || selected.mobile || selected.displayName || selected._id}
              </p>
              <p className="text-xs text-slate-500">
                {selected.verificationStatus} · attempts {selected.attemptCount}
              </p>
              {selected.accountHolderName && <p>Holder: {selected.accountHolderName}</p>}
              {selected.errorMessage && (
                <div className="p-2 rounded-lg bg-red-50 text-red-700 text-xs">{selected.errorMessage}</div>
              )}
              {tab === 'upi' && (
                <button
                  type="button"
                  onClick={() => reverify(selected._id)}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Reverify
                </button>
              )}
              {selected.providerResponse && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-500">Raw response</summary>
                  <pre className="mt-2 p-2 bg-slate-50 rounded-lg overflow-auto max-h-40 text-[10px]">
                    {JSON.stringify(selected.providerResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
