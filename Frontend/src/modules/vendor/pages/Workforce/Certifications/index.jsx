import React, { useState, useEffect, useCallback } from 'react';
import { FileBadge, AlertTriangle } from 'lucide-react';
import { fetchCertifications, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 12;

const Certifications = () => {
  const { search, filters, refreshKey } = useWorkforceOps();
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
      const res = await fetchCertifications(params);
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data.length) {
    return <EmptyState icon={FileBadge} title="No certifications" description="Mandatory certificates are created from service compliance templates." />;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map((c) => {
          const sc = statusColors[c.verificationStatus] || statusColors.pending;
          const soon = c.expiryDate && new Date(c.expiryDate) - Date.now() < 30 * 86400000;
          return (
            <div key={c._id} className="border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-bold text-gray-900">{c.name}</h3>
                  <p className="text-xs text-gray-500">{c.engineerName} · {c.employeeId}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>
                  {c.verificationStatus?.replace('_', ' ')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
                <span className="px-2 py-0.5 bg-gray-100 rounded-full capitalize">{c.category?.replace('_', ' ')}</span>
                {c.mandatory && <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full">Mandatory</span>}
                <span className="font-mono">{c.certificateNumber}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Issuer: {c.issuingAuthority || '—'}</p>
              <p className="text-xs text-gray-600 flex items-center gap-1">
                Expires: {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('en-IN') : '—'}
                {soon && <AlertTriangle className="h-3 w-3 text-amber-500" />}
              </p>
            </div>
          );
        })}
      </div>
      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} loading={loading} />
    </>
  );
};

export default Certifications;
