import React, { useState, useEffect } from 'react';
import {
  X,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  CreditCard,
  Building,
  Smartphone
} from 'lucide-react';
import { fetchBankAccounts, upsertBankAccount, verifyBankAccount } from '../../../services/financeService';
import { toast } from 'react-hot-toast';

const BankManagementModal = ({ open, onClose, onUpdated }) => {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeMode, setActiveMode] = useState('bank'); // 'bank' | 'upi'
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [error, setError] = useState('');

  const loadBanks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchBankAccounts();
      if (res.data?.success) {
        setBanks(res.data.data || []);
        if ((res.data.data || []).length === 0) {
          setShowAddForm(true);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadBanks();
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (activeMode === 'bank') {
      if (!accountHolderName.trim()) {
        setError('Account holder name is required');
        return;
      }
      if (!accountNumber || accountNumber !== confirmAccountNumber) {
        setError('Account numbers do not match');
        return;
      }
      if (!ifsc.trim() || ifsc.trim().length !== 11) {
        setError('Valid 11-digit IFSC code is required');
        return;
      }
    } else {
      if (!upiId.trim() || !upiId.includes('@')) {
        setError('Valid UPI ID is required (e.g. name@okhdfcbank)');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        method: activeMode,
        accountHolderName: accountHolderName.trim() || 'Account Holder',
        isPrimary,
        ...(activeMode === 'bank'
          ? {
              accountNumber: accountNumber.trim(),
              ifsc: ifsc.trim().toUpperCase(),
              bankName: bankName.trim() || 'Bank Account'
            }
          : {
              upiId: upiId.trim()
            })
      };

      const res = await upsertBankAccount(payload);
      if (res.data?.success) {
        toast.success('Payout destination saved successfully');
        setShowAddForm(false);
        setAccountNumber('');
        setConfirmAccountNumber('');
        setIfsc('');
        setBankName('');
        setUpiId('');
        await loadBanks();
        if (onUpdated) onUpdated();
      } else {
        setError(res.data?.message || 'Failed to save account');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (bankId) => {
    try {
      const res = await verifyBankAccount(bankId);
      if (res.data?.success) {
        toast.success(res.data?.message || 'Account verified successfully');
        await loadBanks();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400">
                <Landmark className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-white">Bank & Payout Destinations</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Link your verified bank account or UPI ID for seamless withdrawal payouts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Existing Bank Accounts */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mb-2" />
              <p className="text-xs font-medium">Fetching accounts...</p>
            </div>
          ) : banks.length > 0 && !showAddForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Linked Accounts</h4>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add New Destination
                </button>
              </div>

              <div className="space-y-3">
                {banks.map((bank) => (
                  <div
                    key={bank._id}
                    className="p-4 rounded-xl border border-gray-200 bg-slate-50/50 hover:bg-white hover:border-gray-300 transition-all flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 shadow-sm">
                        {bank.method === 'upi' ? (
                          <Smartphone className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Building className="w-5 h-5 text-teal-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-bold text-gray-900">
                            {bank.method === 'upi' ? bank.upiId : bank.bankName || 'Bank Account'}
                          </h5>
                          {bank.isPrimary && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.2 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                              Primary
                            </span>
                          )}
                        </div>
                        {bank.method === 'bank' ? (
                          <p className="text-xs text-gray-500 font-mono mt-0.5">
                            {bank.accountNumberMasked} · IFSC: {bank.ifsc}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-0.5">UPI Virtual Payment Address</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Holder: {bank.accountHolderName}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                        bank.verificationStatus === 'verified'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        <ShieldCheck className="w-3 h-3" />
                        {bank.verificationStatus || 'Pending'}
                      </span>
                      {bank.verificationStatus !== 'verified' && (
                        <button
                          type="button"
                          onClick={() => handleVerify(bank._id)}
                          className="text-xs text-teal-600 hover:text-teal-700 font-semibold"
                        >
                          Verify Account
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Add New Destination Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Add Payout Destination</h4>
                {banks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-xs text-gray-500 hover:text-gray-900"
                  >
                    Back to List
                  </button>
                )}
              </div>

              {/* Destination Mode Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveMode('bank')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    activeMode === 'bank'
                      ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Building className="w-4 h-4" /> Bank Account (NEFT/RTGS/IMPS)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('upi')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    activeMode === 'upi'
                      ? 'border-teal-600 bg-teal-50 text-teal-800 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Smartphone className="w-4 h-4" /> Instant UPI ID
                </button>
              </div>

              {activeMode === 'bank' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rohit Sharma / Enterprise Services"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC Bank / State Bank of India"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">Account Number *</label>
                      <input
                        type="password"
                        placeholder="Enter account number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">Confirm Account Number *</label>
                      <input
                        type="text"
                        placeholder="Re-enter account number"
                        value={confirmAccountNumber}
                        onChange={(e) => setConfirmAccountNumber(e.target.value)}
                        className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">IFSC Code *</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC0001234"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                      maxLength={11}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-mono uppercase focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rohit Sharma"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">UPI ID (VPA) *</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210@paytm or vendor@okhdfcbank"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isPrimary"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="isPrimary" className="text-xs text-gray-600 font-medium cursor-pointer">
                  Set as Primary Payout Destination
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-all shadow-md shadow-teal-700/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save Payout Destination</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> AES-256 Encrypted & RBI Compliant
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-semibold text-gray-700 hover:bg-gray-200/70 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankManagementModal;
