import React, { useEffect, useState } from 'react';
import { FiBarChart2, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

const B2BReports = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/b2b/reports/summary');
        if (res.data?.success) setSummary(res.data.data || res.data.summary);
      } catch (e) {
        toast.error('Failed to load B2B report summary');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const entries = summary && typeof summary === 'object'
    ? Object.entries(summary).filter(([, v]) => v !== null && v !== undefined)
    : [];

  return (
    <CardShell icon={FiBarChart2} title="B2B reports overview">
      {loading ? (
        <div className="flex justify-center py-16">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : !entries.length ? (
        <p className="text-sm text-gray-500 py-8 text-center">No report data available yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {entries.map(([key, val]) => (
            <div key={key} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wide">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </p>
              <p className="text-xl font-black text-gray-900 mt-1">
                {typeof val === 'number' ? val.toLocaleString('en-IN') : String(val)}
              </p>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
};

export default B2BReports;
