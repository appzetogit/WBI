import React, { useState, useEffect, useCallback } from 'react';
import {
  Landmark,
  ArrowDownToLine,
  Plus,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Building,
  Smartphone,
  Loader2,
  Calendar,
  XCircle,
  RotateCcw
} from 'lucide-react';
import {
  fetchWithdrawals,
  fetchWithdrawEligibility,
  cancelWithdrawal,
  downloadWithdrawalReceipt,
  formatINR,
  statusColors
} from '../../../services/financeService';
import { toast } from 'react-hot-toast';
import WithdrawalWizard from '../WithdrawalWizard';
import BankManagementModal from './BankManagementModal';

const PayoutsTab = () => {
  const [eligibility, setEligibility] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const [eligRes, listRes] = await Promise.all([
        fetchWithdrawEligibility(),
        fetchWithdrawals({ limit: 50 })
      ]);

      if (eligRes.data?.success) {
        setEligibility(eligRes.data.data || null);
      }

      if (listRes.data?.success) {
        setWithdrawals(listRes.data.data || []);
      }
    } catch (err) {
      console.error('Error loading payouts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this pending payout request?')) return;
    setCancellingId(id);
    try {
      const res = await cancelWithdrawal(id);
      if (res.data?.success) {
        toast.success('Payout request cancelled and balance restored');
        loadPayouts();
      } else {
        toast.error(res.data?.message || 'Failed to cancel payout');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancellation failed');
    } finally {
      setCancellingId(null);
    }
  };

  const handleDownloadReceipt = async (id) => {
    try {
      const res = await downloadWithdrawalReceipt(id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payout-receipt-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Receipt download failed');
    }
  };

  const availableBalance = eligibility?.balances?.availableBalance || 0;
  const primaryBank = eligibility?.banks?.find((b) => b.isPrimary) || eligibility?.banks?.[0];

  return (
    <div className="space-y-6">
      {/* 1. Top Section: Available for Payout Banner & Bank Destination */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Payout Hero */}
        <div className="p-6 bg-gradient-to-br from-teal-900 via-slate-900 to-slate-800 text-white rounded-2xl shadow-xl border border-teal-800/40 flex flex-col justify-between lg:col-span-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <Landmark className="w-4 h-4" /> Ready for Bank Payout
            </span>
            <div className="text-3xl sm:text-4xl lg:text-5xl font-black mt-3 text-white tracking-tight">
              {formatINR(availableBalance)}
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Minimum payout: {formatINR(eligibility?.config?.minWithdrawalAmount || 500)} · Settlement schedule: {eligibility?.config?.settlementSchedule || 'T+1 Working Days'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 mt-6 pt-5 border-t border-white/10">
            <button
              onClick={() => setWithdrawOpen(true)}
              disabled={availableBalance < (eligibility?.config?.minWithdrawalAmount || 1)}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2 disabled:opacity-50"
            >
              <ArrowDownToLine className="w-4 h-4" /> Request Payout Now
            </button>
            <button
              onClick={() => setBankModalOpen(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-2 border border-white/10"
            >
              <Building className="w-4 h-4" /> Manage Bank Destinations
            </button>
          </div>
        </div>

        {/* Primary Destination Card */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Payout Destination</span>
              {primaryBank?.verificationStatus === 'verified' ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Pending Verification
                </span>
              )}
            </div>

            {primaryBank ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
                    {primaryBank.method === 'upi' ? <Smartphone className="w-4 h-4" /> : <Building className="w-4 h-4" />}
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-gray-900">
                      {primaryBank.method === 'upi' ? primaryBank.upiId : primaryBank.bankName || 'Bank Account'}
                    </h5>
                    <p className="text-xs text-gray-400">{primaryBank.accountHolderName}</p>
                  </div>
                </div>

                {primaryBank.method === 'bank' && (
                  <div className="pt-2 text-xs font-mono text-gray-600 space-y-0.5">
                    <p>Acc: {primaryBank.accountNumberMasked}</p>
                    <p>IFSC: {primaryBank.ifsc}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-gray-500 space-y-2">
                <p>No primary bank account linked yet.</p>
                <button
                  type="button"
                  onClick={() => setBankModalOpen(true)}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700"
                >
                  + Add Bank Details
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setBankModalOpen(true)}
            className="mt-4 w-full py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors border border-teal-200"
          >
            Change / Add Destination
          </button>
        </div>
      </div>

      {/* 2. Payout History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Payout & Settlement History</h3>
            <p className="text-xs text-gray-500">Track the lifecycle of bank transfers and withdrawals</p>
          </div>
          <span className="text-xs font-mono text-gray-400">{withdrawals.length} records</span>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600 mb-2" />
            <p className="text-xs font-medium">Loading payout history...</p>
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-xs">
            <Landmark className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No payout requests placed yet. When you withdraw available wallet funds, tracking appears here.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-slate-50 text-gray-500 uppercase font-bold text-[10px] tracking-wider border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Payout Ref</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Request Date</th>
                  <th className="px-4 py-3 text-right">Gross Amount</th>
                  <th className="px-4 py-3 text-right">Net Payout</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withdrawals.map((w) => {
                  const isPending = ['pending', 'draft', 'otp_pending', 'approved'].includes(w.status);
                  const isPaid = w.status === 'paid';

                  return (
                    <tr key={w._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {w.payoutReference || w.reference || `PAY-${w._id.toString().slice(-6)}`}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-800">
                          {w.method === 'upi' ? `UPI: ${w.upiId || 'VPA'}` : `Bank: ${w.bankDetails?.bankName || 'Account'}`}
                        </span>
                        {w.bankDetails?.accountNumberMasked && (
                          <p className="text-[11px] text-gray-400 font-mono">{w.bankDetails.accountNumberMasked}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{w.settlementSchedule || 'T+1'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(w.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-700">
                        {formatINR(w.amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        {formatINR(w.netPayoutAmount || w.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-md border ${statusColors[w.status] || 'bg-gray-100 text-gray-600'}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => handleCancel(w._id)}
                              disabled={cancellingId === w._id}
                              className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
                              title="Cancel Payout"
                            >
                              {cancellingId === w._id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cancel'}
                            </button>
                          )}
                          {isPaid && (
                            <button
                              onClick={() => handleDownloadReceipt(w._id)}
                              className="p-1 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                              title="Download Receipt"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <WithdrawalWizard
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onComplete={() => {
          loadPayouts();
        }}
      />

      <BankManagementModal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        onUpdated={() => {
          loadPayouts();
        }}
      />
    </div>
  );
};

export default PayoutsTab;
