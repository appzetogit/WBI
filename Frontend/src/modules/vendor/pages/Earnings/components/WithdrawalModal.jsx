import React, { useState } from 'react';
import { FiX, FiDollarSign, FiInfo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import vendorWalletService from '../../../../../services/vendorWalletService';

export default function WithdrawalModal({ isOpen, onClose, availableBalance, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const withdrawAmount = Number(amount);
    
    if (!withdrawAmount || withdrawAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (withdrawAmount > availableBalance) {
      toast.error(`Amount cannot exceed your available balance of ₹${availableBalance.toLocaleString()}`);
      return;
    }

    try {
      setIsSubmitting(true);
      
      await vendorWalletService.requestWithdrawal({
        amount: withdrawAmount,
        notes
      });
      
      toast.success('Withdrawal request submitted successfully');
      setAmount('');
      setNotes('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast.error(error.response?.data?.message || 'Failed to submit withdrawal request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-bold text-[#0f172a] text-[17px]">Request Withdrawal</h3>
            <p className="text-[12px] font-medium text-slate-500 mt-0.5">Transfer earnings to your bank account</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl mb-6 flex items-start space-x-3 border border-emerald-100">
            <FiInfo className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-bold">Available Balance: ₹{availableBalance?.toLocaleString() || 0}</p>
              <p className="text-[12px] mt-1 opacity-90">This is the maximum amount you can request for withdrawal right now.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-bold text-[#0f172a] mb-1.5">Withdrawal Amount (₹) <span className="text-red-500">*</span></label>
              <div className="relative">
                <FiDollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount (e.g. 5000)"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[14px] text-[#0f172a] focus:bg-white focus:outline-none focus:border-[#00a78e] focus:ring-1 focus:ring-[#00a78e] transition-all"
                  required
                  min="1"
                  max={availableBalance}
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-[#0f172a] mb-1.5">Notes (Optional)</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[14px] text-[#0f172a] focus:bg-white focus:outline-none focus:border-[#00a78e] focus:ring-1 focus:ring-[#00a78e] transition-all min-h-[80px]"
              ></textarea>
            </div>
          </div>

          <div className="mt-8 flex justify-end space-x-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-[14px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || !amount || Number(amount) > availableBalance}
              className="px-6 py-2.5 rounded-xl text-[14px] font-bold text-white bg-[#00a78e] hover:bg-[#008f79] shadow-[0_4px_12px_rgba(0,167,142,0.25)] transition-all disabled:opacity-50 disabled:shadow-none flex items-center"
            >
              {isSubmitting ? 'Processing...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
