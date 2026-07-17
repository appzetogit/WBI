import React, { useState, useEffect, useCallback } from 'react';
import { Brain, AlertTriangle } from 'lucide-react';
import { fetchSkillMatrix } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const SkillMatrix = () => {
  const { search, filters, refreshKey } = useWorkforceOps();
  const [data, setData] = useState({ engineers: [], skillSummary: [], gaps: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      const res = await fetchSkillMatrix(params);
      setData(res.data.data || { engineers: [], skillSummary: [], gaps: [] });
    } catch { setData({ engineers: [], skillSummary: [], gaps: [] }); }
    finally { setLoading(false); }
  }, [search, filters]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data.engineers?.length) {
    return <EmptyState icon={Brain} title="No skills mapped" description="Skills are auto-mapped from service templates when engineers join." />;
  }

  return (
    <div className="space-y-6">
      {data.gaps?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" /> Skill gap analysis
          </p>
          <div className="flex flex-wrap gap-2">
            {data.gaps.slice(0, 8).map((g) => (
              <span key={g.name} className="text-xs px-2 py-1 bg-white border border-amber-200 rounded-lg text-amber-800">
                {g.name} · {g.count} eng · avg {g.avgProficiency}%
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Skill coverage</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.skillSummary.map((s) => (
            <div key={s.name} className="border border-gray-200 rounded-xl p-3">
              <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
              <p className="text-xs text-gray-500 mt-1">{s.count} engineers</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${s.avgProficiency}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Avg {s.avgProficiency}%</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Engineer matrix</h3>
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Engineer</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Primary</th>
                <th className="px-4 py-3">Skills</th>
                <th className="px-4 py-3">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.engineers.map((e) => (
                <tr key={e._id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{e.name}</p>
                    <p className="text-[11px] text-gray-400">{e.employeeId}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.role}</td>
                  <td className="px-4 py-3">{e.primarySkill}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {(e.skills || []).slice(0, 4).map((s) => (
                        <span key={s.name} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                          {s.name} {s.proficiency}%
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{e.performanceScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SkillMatrix;
