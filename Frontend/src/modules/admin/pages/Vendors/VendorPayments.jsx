import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDollarSign, FiLoader, FiArrowUpRight, FiArrowDownLeft, FiCreditCard, FiX, FiInfo } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminVendorService from '../../../../services/adminVendorService';
import adminSettlementService from '../../../../services/adminSettlementService';
import { formatCurrency, formatSignedCurrency } from '../../utils/adminHelpers';

const VendorPayments = () => {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const response = await adminVendorService.getVendorPayments();
      if (response.success) {
        setVendors(response.data);
        setMeta(response.meta || null);
      }
    } catch (error) {
      console.error('Error loading vendor payments:', error);
      toast.error('Failed to load vendor payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const openLedger = useCallback(async (vendor) => {
    setLedgerOpen(true);
    setLedgerLoading(true);
    setLedgerData(null);
    try {
      const res = await adminSettlementService.getVendorLedger(vendor._id, { page: 1, limit: 100 });
      if (res.success) {
        setLedgerData({ vendor, ...res });
      } else {
        toast.error('Could not load ledger');
        setLedgerOpen(false);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load ledger');
      setLedgerOpen(false);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const handleSettle = (vendor) => {
    const ps = vendor.paymentSummary || {};
    if (ps.dues > 0) {
      navigate('/admin/vendors/settlements/pending');
      toast('Review pending cash settlements', { icon: 'ℹ️' });
      return;
    }
    if (ps.pendingWithdrawal > 0 || ps.earnings > 0) {
      navigate('/admin/vendors/settlements/withdrawals');
      return;
    }
    toast('No dues or pending payouts for this vendor');
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500 flex items-start gap-2 px-1">
        <FiInfo className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Dues</strong> = cash vendor owes platform. <strong>Earnings</strong> = platform owes vendor.
          <strong> Net</strong> = earnings − dues.
        </span>
      </p>

      {meta && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-red-600 to-red-700 p-5 rounded-2xl text-white shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <FiArrowDownLeft className="w-5 h-5 opacity-90" />
              <span className="text-xs font-bold uppercase opacity-90">Total dues to platform</span>
            </div>
            <h3 className="text-2xl font-bold">{formatCurrency(meta.totalDuesToAdmin)}</h3>
            <p className="text-red-100 text-sm mt-1">{meta.vendorCount} vendors</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-green-600">
              <FiArrowUpRight className="w-5 h-5" />
              <span className="text-xs font-bold uppercase text-gray-500">Earnings owed to vendors</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(meta.totalEarningsOwed)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-amber-600">
              <FiDollarSign className="w-5 h-5" />
              <span className="text-xs font-bold uppercase text-gray-500">Pending withdrawals</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(meta.totalPendingWithdrawals)}</h3>
          </div>
        </div>
      )}

      <CardShell icon={FiCreditCard}>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiLoader className="w-8 h-8 text-gray-400 animate-spin mr-3" />
              <span className="text-gray-600">Loading payment data...</span>
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No vendors found</div>
          ) : (
            <table className="w-full border-collapse min-w-[960px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Dues (owes admin)</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Earnings</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Net</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Pending payout</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map((vendor) => {
                  const ps = vendor.paymentSummary || {};
                  const canSettle = ps.dues > 0 || ps.pendingWithdrawal > 0;
                  return (
                    <tr key={vendor._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">
                            {vendor.businessName || vendor.name}
                          </span>
                          <span className="text-xs text-gray-500">{vendor.phone}</span>
                          {ps.isBlocked && (
                            <span className="text-[10px] text-red-600 font-bold mt-0.5">BLOCKED</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`font-bold ${ps.dues > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          {formatCurrency(ps.dues)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-green-700">
                        {formatCurrency(ps.earnings)}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-gray-900">
                        {formatSignedCurrency(ps.netBalance)}
                      </td>
                      <td className="px-4 py-4 text-sm text-amber-700">{formatCurrency(ps.pendingWithdrawal)}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            vendor.approvalStatus === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {vendor.approvalStatus || 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openLedger(vendor)}
                            className="text-xs font-bold text-blue-600 hover:underline"
                          >
                            Ledger
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSettle(vendor)}
                            disabled={!canSettle}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                              canSettle
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Settle
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CardShell>

      {ledgerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Vendor ledger</h2>
                {ledgerData?.vendor && (
                  <p className="text-sm text-gray-500">
                    {ledgerData.vendor.businessName || ledgerData.vendor.name} · {ledgerData.vendor.phone}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setLedgerOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            {ledgerLoading ? (
              <div className="py-16 flex justify-center">
                <FiLoader className="animate-spin w-8 h-8 text-gray-400" />
              </div>
            ) : ledgerData ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 bg-gray-50 border-b text-sm">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Dues</p>
                    <p className="font-bold text-red-600">{formatCurrency(ledgerData.vendor?.dues)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Earnings</p>
                    <p className="font-bold text-green-700">{formatCurrency(ledgerData.vendor?.earnings)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Net</p>
                    <p className="font-bold">
                      {formatSignedCurrency(
                        (ledgerData.vendor?.earnings || 0) - (ledgerData.vendor?.dues || 0)
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase">Transactions</p>
                    <p className="font-bold">{ledgerData.pagination?.total ?? ledgerData.data?.length ?? 0}</p>
                  </div>
                </div>
                <div className="overflow-auto flex-1 p-6">
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
                      {(ledgerData.data || []).map((tx) => (
                        <tr key={tx._id}>
                          <td className="py-2 text-xs text-gray-600 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </td>
                          <td className="py-2 max-w-[220px] truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className="py-2 capitalize text-xs">{tx.type?.replace(/_/g, ' ')}</td>
                          <td
                            className={`py-2 text-right font-semibold ${
                              tx.amount >= 0 ? 'text-green-700' : 'text-red-600'
                            }`}
                          >
                            {formatSignedCurrency(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPayments;
