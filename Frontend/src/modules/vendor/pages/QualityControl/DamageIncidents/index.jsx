import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, IndianRupee, Search, CheckCircle, Archive } from 'lucide-react';
import { fetchDamages, updateDamage, formatINR, statusColors } from '../../../services/qualityControlService';
import { useQuality } from '../context/QualityContext';
import FilterBar from '../components/FilterBar';
import EmptyState from '../../BusinessIntake/components/EmptyState';
import Pagination from '../../BusinessIntake/components/Pagination';

const PAGE = 8;
const STATUS = [
  { value: 'reported', label: 'Reported' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'approval', label: 'Approval' },
  { value: 'settlement', label: 'Settlement' },
  { value: 'closed', label: 'Closed' }
];

const DamageIncidents = () => {
  const { search, filters, refreshKey, triggerRefresh } = useQuality();
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ openClaims: 0, totalCost: 0, insuranceCases: 0, investigating: 0 });
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
      const res = await fetchDamages(params);
      setData(res.data.data || []);
      setStats(res.data.stats || stats);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE });
    } catch { setData([]); }
    finally { setLoading(false); }
  }, [search, filters, page]);

  useEffect(() => { setPage(1); }, [search, filters, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (id, action) => {
    try { await updateDamage(id, { action }); load(); }
    catch (e) { alert(e.response?.data?.message || 'Failed'); }
  };

  const summary = [
    { label: 'Open Claims', value: stats.openClaims, color: 'text-amber-700 bg-amber-50' },
    { label: 'Damage Cost', value: formatINR(stats.totalCost), color: 'text-red-700 bg-red-50' },
    { label: 'Insurance Cases', value: stats.insuranceCases, color: 'text-blue-700 bg-blue-50' },
    { label: 'Investigating', value: stats.investigating, color: 'text-violet-700 bg-violet-50' }
  ];

  return (
    <div className="space-y-4">
      <FilterBar onApply={triggerRefresh} statusOptions={STATUS} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.map((s) => (
          <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No damage incidents" description="Track site damage, liability & settlement from report to closure." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((d) => {
              const sc = statusColors[d.status] || statusColors.reported;
              return (
                <div key={d._id} className="border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col">
                  <div className="flex justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[11px] font-mono text-gray-400">{d.incidentCode}</p>
                      <h3 className="font-bold text-gray-900">{d.projectName}</h3>
                      <p className="text-xs text-gray-500 mt-1">{d.clientName} · {d.engineerName} · {d.serviceCategoryName}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border h-fit ${sc}`}>{d.status}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{d.description}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-3">
                    <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {formatINR(d.estimatedCost)}</span>
                    <span className="capitalize">Party: {d.responsibleParty?.replace('_', ' ')}</span>
                    <span>{d.photosCount} photos</span>
                    {d.insuranceCase && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">Insurance</span>}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {d.status === 'reported' && (
                      <button onClick={() => act(d._id, 'investigate')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Search className="h-3 w-3" /> Investigate</button>
                    )}
                    {d.status === 'investigation' && (
                      <button onClick={() => act(d._id, 'approve')} className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg">Approve Claim</button>
                    )}
                    {d.status === 'approval' && (
                      <button onClick={() => act(d._id, 'settle')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"><CheckCircle className="h-3 w-3" /> Settle</button>
                    )}
                    {d.status === 'settlement' && (
                      <button onClick={() => act(d._id, 'close')} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg"><Archive className="h-3 w-3" /> Close</button>
                    )}
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

export default DamageIncidents;
