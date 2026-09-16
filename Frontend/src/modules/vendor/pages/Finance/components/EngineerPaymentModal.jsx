import React, { useState } from 'react';
import {
  X,
  IndianRupee,
  ShieldCheck,
  CreditCard,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Receipt
} from 'lucide-react';
import { recordEngineerPayment, formatINR } from '../../../services/financeService';
import { toast } from 'react-hot-toast';

const EngineerPaymentModal = ({ isOpen, onClose, engineer, onPaymentSuccess }) => {
  const [amount, setAmount] = useState(engineer?.totalPending || 0);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [transactionReference, setTransactionReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !engineer) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payVal = Number(amount);
    if (!payVal || payVal <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    setLoading(true);
    try {
      const res = await recordEngineerPayment({
        engineerId: engineer.engineerId,
        amount: payVal,
        paymentMethod,
        transactionReference: transactionReference.trim() || undefined,
        notes: notes.trim() || undefined
      });

      if (res.data?.success) {
        toast.success(res.data?.message || 'Payment recorded successfully');
        if (onPaymentSuccess) onPaymentSuccess();
        onClose();
      } else {
        toast.error(res.data?.message || 'Failed to record payment');
      }
    } catch (err) {
      console.error('Error recording engineer payment:', err);
      toast.error(err.response?.data?.message || 'Failed to process engineer payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-300 backdrop-blur-md">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-indigo-300 font-bold">
                Vendor to Engineer Payout
              </div>
              <h2 className="text-lg font-black text-white">{engineer.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Quick Stats Banner */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100 text-center">
            <div>
              <span className="text-[10px] font-bold uppercase text-gray-400">Total Payable</span>
              <div className="text-xs font-black text-gray-800">{formatINR(engineer.totalPayable)}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-gray-400">Paid So Far</span>
              <div className="text-xs font-black text-emerald-600">{formatINR(engineer.totalPaid)}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-gray-400">Pending</span>
              <div className="text-xs font-black text-amber-600">{formatINR(engineer.totalPending)}</div>
            </div>
          </div>

          {/* Amount Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">Payment Amount (₹)</label>
            <div className="relative">
              <IndianRupee className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm font-black text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter amount to pay"
              />
            </div>
            {engineer.totalPending > 0 && (
              <button
                type="button"
                onClick={() => setAmount(engineer.totalPending)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
              >
                Pay Full Pending Amount ({formatINR(engineer.totalPending)})
              </button>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">Payment Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'upi', label: 'UPI / Instant' },
                { id: 'bank_transfer', label: 'Bank (NEFT)' },
                { id: 'cash', label: 'Cash Settlement' }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                    paymentMethod === m.id
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* UTR / Transaction Reference */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">Transaction Reference / UTR (Optional)</label>
            <input
              type="text"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              placeholder="e.g. UTR309482019482"
              className="w-full px-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700">Remarks / Note</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Weekly job incentives payout"
              className="w-full px-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Notice Banner */}
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-800">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Recording this payment will automatically credit the Engineer's internal wallet and log a double-entry debit in your Vendor Finance ledger.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !amount || Number(amount) <= 0}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Record Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EngineerPaymentModal;
