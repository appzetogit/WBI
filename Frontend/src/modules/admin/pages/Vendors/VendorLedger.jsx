import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import adminSettlementService from '../../../../services/adminSettlementService';
import { formatCurrency, formatSignedCurrency } from '../../utils/adminHelpers';

const VendorLedger = () => {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await adminSettlementService.getVendorLedger(vendorId, { page: 1, limit: 100 });
        if (res.success) setLedger(res);
        else toast.error(res.message || 'Failed to load ledger');
      } catch (e) {
        toast.error('Failed to load ledger');
      } finally {
        setLoading(false);
      }
    };
    if (vendorId) load();
  }, [vendorId]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/admin/vendors/settlements/vendors')}
        className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"
      >
        <FiArrowLeft /> Back to vendor dues
      </button>

      {loading ? (
        <div className="py-20 flex justify-center">
          <FiLoader className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : ledger ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h1 className="text-lg font-bold text-gray-900">
              {ledger.vendor?.businessName || ledger.vendor?.name}
            </h1>
            <p className="text-sm text-gray-500">{ledger.vendor?.phone}</p>
            <div className="flex flex-wrap gap-6 mt-3 text-sm">
              <span>
                Dues: <strong className="text-red-600">{formatCurrency(ledger.vendor?.dues)}</strong>
              </span>
              <span>
                Earnings: <strong className="text-green-700">{formatCurrency(ledger.vendor?.earnings)}</strong>
              </span>
            </div>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(ledger.data || []).map((tx) => (
                  <tr key={tx._id}>
                    <td className="py-2 whitespace-nowrap text-gray-600">
                      {new Date(tx.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2">{tx.description}</td>
                    <td className="py-2 capitalize">{tx.type?.replace(/_/g, ' ')}</td>
                    <td className={`py-2 text-right font-semibold ${tx.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatSignedCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VendorLedger;
