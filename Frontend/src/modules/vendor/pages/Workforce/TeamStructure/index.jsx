import React, { useState, useEffect, useCallback } from 'react';
import { Network } from 'lucide-react';
import { fetchStructure, statusColors } from '../../../services/workforceOpsService';
import { useWorkforceOps } from '../context/WorkforceContext';
import EmptyState from '../../BusinessIntake/components/EmptyState';

const Node = ({ node, depth = 0 }) => {
  if (!node) return null;
  const avail = node.availability ? (statusColors[node.availability] || '') : '';
  return (
    <div className={depth ? 'ml-4 mt-2 border-l border-gray-200 pl-4' : ''}>
      <div className="flex items-center gap-2 py-2">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${depth === 0 ? 'bg-blue-600' : depth === 1 ? 'bg-indigo-500' : 'bg-slate-500'}`}>
          {(node.name || node.role || '?').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{node.name || node.role}</p>
          <p className="text-[11px] text-gray-500">
            {node.name ? node.role : 'Department'}
            {node.employeeId ? ` · ${node.employeeId}` : ''}
          </p>
        </div>
        {node.availability && (
          <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${avail}`}>
            {node.availability.replace('_', ' ')}
          </span>
        )}
      </div>
      {(node.children || []).map((c, i) => (
        <Node key={`${c.name || c.role}-${i}`} node={c} depth={depth + 1} />
      ))}
    </div>
  );
};

const TeamStructure = () => {
  const { refreshKey } = useWorkforceOps();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStructure();
      setData(res.data.data || null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!data?.tree) return <EmptyState icon={Network} title="No org structure" description="Hire engineers to build the hierarchy automatically." />;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 text-xs text-gray-500">
        <span className="font-semibold text-gray-800">{data.total} people</span>
        {(data.departments || []).map((d) => (
          <span key={d} className="px-2 py-0.5 bg-gray-100 rounded-full">{d}</span>
        ))}
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <Node node={data.tree} />
      </div>
    </div>
  );
};

export default TeamStructure;
