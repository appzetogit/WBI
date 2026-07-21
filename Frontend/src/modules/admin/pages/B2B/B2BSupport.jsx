import React, { useEffect, useState } from 'react';
import { FiHeadphones, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

const B2BSupport = () => {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/b2b/support/tickets', { params: { limit: 50 } });
        if (res.data?.success) setTickets(res.data.data?.tickets || res.data.data || []);
      } catch (e) {
        toast.error('Failed to load support tickets');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <CardShell icon={FiHeadphones} title="B2B support tickets">
      {loading ? (
        <div className="flex justify-center py-16">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No open tickets.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3 pr-4">Subject</th>
                <th className="py-3 pr-4">Company</th>
                <th className="py-3 pr-4">Priority</th>
                <th className="py-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t._id} className="border-b border-gray-50">
                  <td className="py-3 pr-4 font-medium">{t.subject || t.title || '—'}</td>
                  <td className="py-3 pr-4">{t.companyName || '—'}</td>
                  <td className="py-3 pr-4 capitalize">{t.priority || '—'}</td>
                  <td className="py-3 pr-4 capitalize">{t.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
};

export default B2BSupport;
