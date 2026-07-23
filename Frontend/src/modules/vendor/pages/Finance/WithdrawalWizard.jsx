import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  formatINR,
  fetchWithdrawEligibility,
  quoteWithdrawal,
  sendWithdrawOtp,
  upsertBankAccount,
  verifyBankAccount,
  requestWithdrawal,
  fetchWithdrawals,
  cancelWithdrawal,
  downloadWithdrawalReceipt
} from '../../services/financeService';

const STEPS = ['Eligibility', 'Bank / UPI', 'Amount & Fees', 'OTP Confirm', 'Status'];

export default function WithdrawalWizard({ open, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [method, setMethod] = useState('bank');
  const [bankId, setBankId] = useState('');
  const [showAddBank, setShowAddBank] = useState(false);
  const [bankForm, setBankForm] = useState({
    accountHolderName: '',
    accountNumber: '',
    ifsc: '',
    bankName: '',
    upiId: '',
    method: 'bank',
    isPrimary: true
  });
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [fees, setFees] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpMeta, setOtpMeta] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [el, hist] = await Promise.all([
        fetchWithdrawEligibility(),
        fetchWithdrawals({ limit: 5 })
      ]);
      setEligibility(el.data?.data || null);
      setHistory(hist.data?.data || []);
      const banks = el.data?.data?.banks || [];
      const primary = banks.find((b) => b.isPrimary && b.verificationStatus === 'verified')
        || banks.find((b) => b.verificationStatus === 'verified')
        || banks[0];
      if (primary) setBankId(String(primary._id));
      if (el.data?.data?.config?.allowBankTransfer === false && el.data?.data?.config?.allowUpi) {
        setMethod('upi');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load withdrawal setup');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setStep(0);
      setResult(null);
      setOtp('');
      setFees(null);
      setAmount('');
      load();
    }
  }, [open]);

  if (!open) return null;

  const config = eligibility?.config || {};
  const balances = eligibility?.balances || {};
  const banks = (eligibility?.banks || []).filter((b) =>
    method === 'upi' ? b.method === 'upi' || b.upiId : b.method !== 'upi'
  );

  const refreshQuote = async (value = amount) => {
    const amt = Number(value);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFees(null);
      return;
    }
    try {
      const res = await quoteWithdrawal({ amount: amt });
      setFees(res.data?.data?.fees || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Fee quote failed');
    }
  };

  const saveBank = async () => {
    try {
      setLoading(true);
      const payload = { ...bankForm, method: bankForm.method || method };
      const res = await upsertBankAccount(payload);
      const created = res.data?.data;
      toast.success('Bank account saved');
      setShowAddBank(false);
      await load();
      if (created?._id) setBankId(String(created._id));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save bank');
    } finally {
      setLoading(false);
    }
  };

  const verifyBank = async (id) => {
    try {
      setLoading(true);
      await verifyBankAccount(id);
      toast.success('Penny drop verification completed');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    try {
      setLoading(true);
      const res = await sendWithdrawOtp();
      setOtpMeta(res.data?.data || null);
      toast.success(`OTP sent to ${res.data?.data?.phoneMasked || 'registered phone'}`);
      setStep(3);
    } catch (error) {
      toast.error(error.response?.data?.message || 'OTP send failed');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    const amt = Number(amount);
    if (!bankId) {
      toast.error('Select a linked account');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (config.requireOtp && !otp) {
      toast.error('Enter OTP');
      return;
    }
    try {
      setLoading(true);
      const idempotencyKey = `wd_${bankId}_${amt}_${Date.now()}`;
      const res = await requestWithdrawal({
        amount: amt,
        bankAccountId: bankId,
        method,
        otp: config.requireOtp ? otp : undefined,
        notes,
        idempotencyKey
      });
      setResult(res.data?.data || null);
      toast.success(
        res.data?.data?.autoApproved
          ? 'Withdrawal auto-approved and payout initiated'
          : 'Withdrawal submitted for approval'
      );
      setStep(4);
      onComplete?.();
      const hist = await fetchWithdrawals({ limit: 5 });
      setHistory(hist.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async (id) => {
    try {
      await cancelWithdrawal(id);
      toast.success('Withdrawal cancelled');
      await load();
      onComplete?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Cancel failed');
    }
  };

  const downloadReceipt = async (id) => {
    try {
      const res = await downloadWithdrawalReceipt(id);
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `withdrawal-${id}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Receipt download failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Withdraw Funds</h3>
            <p className="text-xs text-gray-500">Settled wallet only · Escrow excluded</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 text-sm">Close</button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {STEPS.map((label, idx) => (
            <div key={label} className={`flex-1 h-1.5 rounded-full ${idx <= step ? 'bg-blue-600' : 'bg-gray-200'}`} title={label} />
          ))}
        </div>
        <p className="px-5 pt-2 text-xs font-medium text-gray-600">{STEPS[step]}</p>

        <div className="p-5 space-y-4">
          {loading && !eligibility && <div className="h-32 bg-gray-100 animate-pulse rounded-xl" />}

          {step === 0 && eligibility && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-[11px] text-emerald-700">Available (withdrawable)</p>
                  <p className="text-xl font-bold text-emerald-900">{formatINR(balances.availableBalance)}</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-[11px] text-amber-700">In escrow (locked)</p>
                  <p className="text-xl font-bold text-amber-900">{formatINR(balances.escrowBalance)}</p>
                </div>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>Min {formatINR(config.minWithdrawalAmount)} · Max {formatINR(config.maxWithdrawalAmount)}</li>
                <li>Schedule: {config.settlementSchedule} · Provider: {config.payoutProvider}</li>
                <li>OTP: {config.requireOtp ? 'Required' : 'Off'} · Verified bank: {config.requireVerifiedBank ? 'Required' : 'Optional'}</li>
                <li>Withdrawals {config.withdrawalEnabled ? 'enabled' : 'disabled'}</li>
              </ul>
              {!eligibility.canWithdraw && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                  Not eligible yet. Ensure settled balance ≥ minimum, link & verify a bank/UPI account, and keep a phone on file for OTP.
                </p>
              )}
              <button
                type="button"
                disabled={!config.withdrawalEnabled}
                onClick={() => setStep(1)}
                className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {config.allowBankTransfer !== false && (
                  <button type="button" onClick={() => setMethod('bank')} className={`px-3 py-1.5 text-sm rounded-lg border ${method === 'bank' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Bank transfer</button>
                )}
                {config.allowUpi !== false && (
                  <button type="button" onClick={() => setMethod('upi')} className={`px-3 py-1.5 text-sm rounded-lg border ${method === 'upi' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>UPI</button>
                )}
              </div>
              <div className="space-y-2">
                {banks.map((b) => (
                  <label key={b._id} className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer ${bankId === String(b._id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <input type="radio" name="bank" checked={bankId === String(b._id)} onChange={() => setBankId(String(b._id))} className="mt-1" />
                    <div className="flex-1 text-sm">
                      <p className="font-semibold text-gray-900">{b.accountHolderName}</p>
                      <p className="text-gray-600">{b.method === 'upi' || b.upiId ? b.upiId : `${b.accountNumberMasked} · ${b.ifsc}`}</p>
                      <p className={`text-xs mt-1 ${b.verificationStatus === 'verified' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {b.verificationStatus}{b.isPrimary ? ' · Primary' : ''}
                      </p>
                    </div>
                    {b.verificationStatus !== 'verified' && (
                      <button type="button" onClick={() => verifyBank(b._id)} className="text-xs px-2 py-1 border rounded-lg">Verify</button>
                    )}
                  </label>
                ))}
                {!banks.length && <p className="text-sm text-gray-500">No {method === 'upi' ? 'UPI' : 'bank'} accounts yet.</p>}
              </div>
              {!showAddBank ? (
                <button type="button" onClick={() => { setShowAddBank(true); setBankForm((f) => ({ ...f, method })); }} className="text-sm text-blue-600 font-medium">+ Add account</button>
              ) : (
                <div className="grid grid-cols-1 gap-2 p-3 border rounded-xl bg-gray-50">
                  <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Account holder name" value={bankForm.accountHolderName} onChange={(e) => setBankForm({ ...bankForm, accountHolderName: e.target.value })} />
                  {method === 'upi' ? (
                    <input className="px-3 py-2 border rounded-lg text-sm" placeholder="UPI ID (name@bank)" value={bankForm.upiId} onChange={(e) => setBankForm({ ...bankForm, upiId: e.target.value, method: 'upi' })} />
                  ) : (
                    <>
                      <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Account number" value={bankForm.accountNumber} onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value, method: 'bank' })} />
                      <input className="px-3 py-2 border rounded-lg text-sm uppercase" placeholder="IFSC" value={bankForm.ifsc} onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value.toUpperCase() })} />
                      <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Bank name" value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} />
                    </>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={saveBank} className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg">Save</button>
                    <button type="button" onClick={() => setShowAddBank(false)} className="px-3 py-2 text-sm border rounded-lg">Cancel</button>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setStep(0)} className="px-4 py-2 text-sm border rounded-lg">Back</button>
                <button
                  type="button"
                  disabled={!bankId}
                  onClick={() => setStep(2)}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <input
                type="number"
                min={config.minWithdrawalAmount || 1}
                max={Math.min(config.maxWithdrawalAmount || 999999, balances.availableBalance || 0)}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); refreshQuote(e.target.value); }}
                placeholder="Amount (₹)"
                className="w-full px-3 py-2 border rounded-lg"
              />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="w-full px-3 py-2 border rounded-lg text-sm" />
              {fees && (
                <div className="text-sm border rounded-xl p-3 space-y-1 bg-slate-50">
                  <div className="flex justify-between"><span>Gross</span><span>{formatINR(fees.grossAmount)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>TDS ({fees.tdsRate}%)</span><span>-{formatINR(fees.tdsAmount)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Platform fee</span><span>-{formatINR(fees.platformFeeAmount)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>GST on fee</span><span>-{formatINR(fees.gstOnFee)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1"><span>Net payout</span><span>{formatINR(fees.netAmount)}</span></div>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2 text-sm border rounded-lg">Back</button>
                <button
                  type="button"
                  disabled={!Number(amount)}
                  onClick={() => {
                    if (config.requireOtp) sendOtp();
                    else submit();
                  }}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50"
                >
                  {config.requireOtp ? 'Send OTP & continue' : 'Submit withdrawal'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && config.requireOtp && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Enter the 6-digit OTP sent to {otpMeta?.phoneMasked || 'your phone'}.</p>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="w-full px-3 py-3 text-center text-xl tracking-widest border rounded-lg"
              />
              <button type="button" onClick={sendOtp} className="text-xs text-blue-600">Resend OTP</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2 text-sm border rounded-lg">Back</button>
                <button type="button" disabled={otp.length < 6 || loading} onClick={submit} className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50">
                  {loading ? 'Submitting…' : 'Confirm withdrawal'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="font-semibold text-emerald-900">Request recorded</p>
                <p className="text-sm text-emerald-800 mt-1">
                  Status: {result?.withdrawal?.status || 'pending'}
                  {result?.autoApproved ? ' (auto-approved)' : ''}
                </p>
                {result?.fees && (
                  <p className="text-sm mt-1">Net: {formatINR(result.fees.netAmount)}</p>
                )}
              </div>
              {(result?.withdrawal?.timeline || []).map((ev, i) => (
                <div key={i} className="text-xs text-gray-600 border-l-2 border-blue-200 pl-3">
                  <span className="font-medium">{ev.status}</span> — {ev.message}
                  <div className="text-gray-400">{ev.at ? new Date(ev.at).toLocaleString('en-IN') : ''}</div>
                </div>
              ))}
              <button type="button" onClick={onClose} className="w-full py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg">Done</button>
            </div>
          )}

          {history.length > 0 && step < 4 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-gray-500 mb-2">Recent withdrawals</p>
              <div className="space-y-2">
                {history.map((w) => (
                  <div key={w._id} className="flex items-center justify-between text-xs p-2 border rounded-lg">
                    <div>
                      <p className="font-medium text-gray-800">{formatINR(w.amount)} · {w.status}</p>
                      <p className="text-gray-500">{w.transactionReference || w.gatewayPayoutId || w._id.slice(-8)}</p>
                    </div>
                    <div className="flex gap-2">
                      {['pending', 'otp_pending', 'awaiting_manual_transfer'].includes(w.status) && (
                        <button type="button" onClick={() => cancel(w._id)} className="text-red-600">Cancel</button>
                      )}
                      {w.status === 'paid' && (
                        <button type="button" onClick={() => downloadReceipt(w._id)} className="text-blue-600">Receipt</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
