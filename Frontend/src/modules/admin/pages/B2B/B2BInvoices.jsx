import React, { useEffect, useState } from 'react';
import { FiFileText, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

const B2BInvoices = () => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/b2b/invoices', { params: { limit: 50 } });
        if (res.data?.success) setInvoices(res.data.data?.invoices || res.data.data || []);
      } catch (e) {
        toast.error('Failed to load B2B invoices');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <CardShell icon={FiFileText} title="B2B invoices">
      {loading ? (
        <div className="flex justify-center py-16">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No invoices found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3 pr-4">Invoice</th>
                <th className="py-3 pr-4">Company</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id} className="border-b border-gray-50">
                  <td className="py-3 pr-4 font-medium">{inv.invoiceNumber || inv._id}</td>
                  <td className="py-3 pr-4">{inv.companyName || inv.companyId?.companyName || '—'}</td>
                  <td className="py-3 pr-4">₹{Number(inv.totalAmount || inv.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="py-3 pr-4 capitalize">{inv.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
};

export default B2BInvoices;
