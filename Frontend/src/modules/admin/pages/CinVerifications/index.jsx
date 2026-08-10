import React, { useEffect, useState } from 'react';
import { FiRefreshCw, FiCheck, FiX, FiSearch, FiShield, FiDownload } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../../services/api';

/**
 * Admin — CIN/MCA verification logs, reverify, approve/reject, export.
 */
export default function CinVerificationsAdmin() {
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
      const res = await api.get('/verification/admin/cin-verifications', {
        params: { page, limit: 20, status: status || undefined, q: q || undefined }
      });
      setItems(res.data?.data?.items || []);
      setTotal(res.data?.data?.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load CIN verifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  const openDetail = async (id) => {
    try {
      const res = await api.get(`/verification/admin/cin-verifications/${id}`);
      setSelected(res.data?.data || null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load detail');
    }
  };

  const reverify = async (id) => {
    try {
      await api.post(`/verification/admin/cin-verifications/${id}/reverify`);
      toast.success('Re-verified');
      load();
      openDetail(id);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Re-verify failed');
    }
  };

  const override = async (id, action) => {
    const reason = window.prompt(`Reason for ${action}?`) || '';
    try {
      await api.post(`/verification/admin/cin-verifications/${id}/override`, { action, reason });
      toast.success(`CIN ${action}d`);
      load();
      openDetail(id);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Override failed');
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get('/verification/admin/cin-verifications/export', {
        params: { status: status || undefined, q: q || undefined },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cin-verifications-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Export failed');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiShield className="text-sky-600" /> CIN / MCA Verifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            CGPE MCA live verification logs, directors, failures, and admin overrides
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-xl border text-sm font-semibold flex items-center gap-2"
          >
            <FiDownload /> Export CSV
          </button>
          <button
            type="button"
            onClick={load}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold flex items-center gap-2"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
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
            <option value="inactive_company">Inactive MCA</option>
            <option value="admin_approved">Admin Approved</option>
            <option value="admin_rejected">Admin Rejected</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-slate-500">Search CIN / Company</label>
          <div className="flex gap-2 mt-1">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="CIN or company name"
            />
            <button
              type="button"
              onClick={() => {
                setPage(1);
                load();
              }}
              className="px-3 py-2 rounded-lg bg-sky-600 text-white"
            >
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
                <th className="px-4 py-3">CIN</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verified</th>
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
                  <td className="px-4 py-3 font-mono text-xs">{row.cin}</td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate">
                    {row.profile?.companyName || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100">
                      {row.verificationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.verifiedAt ? new Date(row.verifiedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-sky-600 text-xs font-semibold">View</td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No verification records
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
            <button
              type="button"
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border rounded-2xl p-4 min-h-[320px]">
          {!selected ? (
            <p className="text-sm text-slate-400 text-center mt-20">
              Select a record to view MCA details, directors & logs
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-mono font-bold text-slate-900">{selected.cin}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {selected.verificationStatus} · attempts {selected.attemptCount}
                </p>
              </div>
              <dl className="space-y-2 max-h-48 overflow-auto">
                {Object.entries(selected.profile || {}).map(([k, v]) =>
                  v && typeof v !== 'object' ? (
                    <div key={k}>
                      <dt className="text-[10px] uppercase text-slate-400 font-semibold">{k}</dt>
                      <dd className="text-slate-800 break-words">{String(v)}</dd>
                    </div>
                  ) : null
                )}
              </dl>
              {Array.isArray(selected.profile?.presentDirectors) &&
                selected.profile.presentDirectors.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2">Directors</p>
                    <ul className="space-y-1 max-h-28 overflow-auto">
                      {selected.profile.presentDirectors.map((d, i) => (
                        <li key={i} className="text-[11px] border rounded-lg px-2 py-1">
                          {d.name} · {d.dinPan} · {d.dateOfAppointment}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {selected.errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs">{selected.errorMessage}</div>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => reverify(selected._id)}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <FiRefreshCw /> Reverify
                </button>
                <button
                  type="button"
                  onClick={() => override(selected._id, 'approve')}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <FiCheck /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => override(selected._id, 'reject')}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <FiX /> Reject
                </button>
              </div>
              {Array.isArray(selected.attempts) && selected.attempts.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">Attempt log</p>
                  <ul className="space-y-1 max-h-40 overflow-auto">
                    {[...selected.attempts].reverse().map((a, i) => (
                      <li key={i} className="text-[11px] text-slate-600 border rounded-lg px-2 py-1">
                        {a.status} · {a.errorCode || 'ok'} ·{' '}
                        {a.latencyMs != null ? `${a.latencyMs}ms` : ''} ·{' '}
                        {a.at ? new Date(a.at).toLocaleString() : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.providerResponse && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-500">Raw MCA response</summary>
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
