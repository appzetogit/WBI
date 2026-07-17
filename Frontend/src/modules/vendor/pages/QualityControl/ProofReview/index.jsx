import React, { useState, useEffect, useCallback } from 'react';
import { FileCheck, MapPin, ShieldCheck, PenLine, Check, X, RotateCcw, Eye } from 'lucide-react';
import { fetchProofs, updateProof, statusColors } from '../../../services/qualityControlService';
import { useQuality } from '../context/QualityContext';
import FilterBar from '../components/FilterBar';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;
const STATUS = [
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'resubmit_required', label: 'Resubmit Required' }
];

const ProofReview = () => {
  const { search, filters, refreshKey, triggerRefresh } = useQuality();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.status) params.status = filters.status;
      const res = await fetchProofs(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateProof(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      <FilterBar onApply={triggerRefresh} statusOptions={STATUS} />
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-56 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={FileCheck} title="No proof submissions" description="Proof requirements are auto-generated per service (before/after photos, reports, signatures)." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((p) => {
              const sc = statusColors[p.status] || statusColors.pending_review;
              return (
                <div key={p._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{p.proofCode}</p>
                      <h3 className="font-bold text-gray-900">{p.projectName}</h3>
                      <p className="text-xs text-gray-500 mt-1">{p.clientName} · {p.serviceCategoryName} · {p.engineerName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{p.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mb-3">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> GPS {p.gpsVerified ? '✓' : '—'}</span>
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> OTP {p.otpVerified ? '✓' : '—'}</span>
                    <span className="flex items-center gap-1"><PenLine className="h-3 w-3" /> Sign {p.signatureCaptured ? '✓' : '—'}</span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Proof completeness</span>
                      <span className="font-semibold">{p.completeness}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${p.completeness >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${p.completeness}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(p.requirements || []).slice(0, 6).map((r) => (
                      <span key={r.label} className={`text-[10px] px-2 py-0.5 rounded-full ${r.submitted ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {p.status !== 'under_review' && p.status !== 'approved' && (
                      <button onClick={() => act(p._id, 'review')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Eye className="h-3 w-3" /> Review</button>
                    )}
                    <button onClick={() => act(p._id, 'approve')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg"><Check className="h-3 w-3" /> Approve</button>
                    <button onClick={() => act(p._id, 'resubmit')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-orange-200 text-orange-700 rounded-lg"><RotateCcw className="h-3 w-3" /> Resubmit</button>
                    <button onClick={() => act(p._id, 'reject')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg"><X className="h-3 w-3" /> Reject</button>
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

export default ProofReview;
