import React, { useEffect, useState } from 'react';
import { FiDollarSign, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import api from '../../../../services/api';
import CardShell from '../UserCategories/components/CardShell';

const B2BWallets = () => {
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get('/admin/b2b-wallets');
        if (res.data?.success) setWallets(res.data.data || []);
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load B2B wallets');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <CardShell icon={FiDollarSign} title="B2B corporate wallets">
      {loading ? (
        <div className="flex justify-center py-16">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : wallets.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No B2B wallets yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3 pr-4">Company</th>
                <th className="py-3 pr-4">Available</th>
                <th className="py-3 pr-4">Reserved</th>
                <th className="py-3 pr-4">Credit limit</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w._id} className="border-b border-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-800">
                    {w.companyId?.companyName || w.companyId?.email || '—'}
                  </td>
                  <td className="py-3 pr-4">₹{Number(w.balance || 0).toLocaleString('en-IN')}</td>
                  <td className="py-3 pr-4 text-amber-700">₹{Number(w.escrowBalance || 0).toLocaleString('en-IN')}</td>
                  <td className="py-3 pr-4">{w.creditLimit ? `₹${Number(w.creditLimit).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="py-3 pr-4 capitalize">{w.companyId?.accountStatus?.toLowerCase() || w.companyId?.verificationStatus || '—'}</td>
                  <td className="py-3 pr-4 text-right">{w.companyId?._id && <Link to={`/admin/b2b/transactions?companyId=${w.companyId._id}`} className="text-xs font-bold text-blue-600">Ledger →</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
};

export default B2BWallets;
