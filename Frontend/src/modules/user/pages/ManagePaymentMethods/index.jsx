import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  FiArrowLeft, FiCreditCard, FiChevronRight, FiSmartphone, FiBriefcase,
  FiGlobe, FiDollarSign, FiTrash2, FiStar, FiRefreshCw, FiDownload, FiCheck
} from 'react-icons/fi';
import BottomNav from '../../components/layout/BottomNav';
import userPaymentMethodService from '../../../../services/userPaymentMethodService';
import { loadRazorpay } from '../../../../utils/loadRazorpay';

const METHOD_META = {
  upi: { icon: FiSmartphone, color: 'bg-emerald-50 text-emerald-600', title: 'Add new UPI ID', sub: 'Google Pay, PhonePe, Paytm, BHIM' },
  wallet: { icon: FiBriefcase, color: 'bg-sky-50 text-sky-600', title: 'Link Wallet', sub: 'Amazon Pay, Paytm, MobiKwik' },
  card: { icon: FiCreditCard, color: 'bg-violet-50 text-violet-600', title: 'Add a card', sub: 'Tokenized via Razorpay — card details never stored on WBI' },
  netbanking: { icon: FiGlobe, color: 'bg-indigo-50 text-indigo-600', title: 'Select Bank', sub: 'Net Banking via Razorpay' },
  cod: { icon: FiDollarSign, color: 'bg-orange-50 text-orange-600', title: 'Cash / UPI on Delivery', sub: 'Pay directly to the professional' }
};

const ManagePaymentMethods = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState([]);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [otpModal, setOtpModal] = useState(null); // { action, id }
  const [otp, setOtp] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userPaymentMethodService.list();
      if (res.success) {
        setMethods(res.data?.methods || []);
        setConfig(res.data?.config || null);
      }
    } catch {
      toast.error('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openRazorpayVault = async (methodType) => {
    setBusy(true);
    try {
      await loadRazorpay();
      const start = await userPaymentMethodService.startInstrument(methodType);
      if (!start.success) throw new Error(start.message || 'Failed to start');
      const d = start.data;

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: d.keyId,
          amount: Math.round(d.amount * 100),
          currency: d.currency || 'INR',
          name: 'WBI',
          description: `Verify ${methodType} (refundable)`,
          order_id: d.orderId,
          customer_id: d.customerId,
          prefill: d.prefill || {},
          notes: d.notes || {},
          theme: { color: '#0D9488' },
          method: methodType === 'card' ? { card: true } : undefined,
          handler: async (response) => {
            try {
              const conf = await userPaymentMethodService.confirmInstrument({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                methodType
              });
              if (conf.success) {
                toast.success('Payment method saved. Verification amount will be refunded.');
                await load();
                resolve();
              } else {
                toast.error(conf.message || 'Failed to save method');
                reject(new Error(conf.message));
              }
            } catch (e) {
              toast.error(e?.response?.data?.message || e.message || 'Confirm failed');
              reject(e);
            }
          },
          modal: {
            ondismiss: () => reject(new Error('cancelled'))
          }
        });
        rzp.on('payment.failed', (resp) => {
          toast.error(resp?.error?.description || 'Payment failed');
          reject(new Error('payment_failed'));
        });
        rzp.open();
      });
    } catch (e) {
      if (e?.message !== 'cancelled') {
        toast.error(e?.response?.data?.message || e.message || 'Unable to open checkout');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (key) => {
    if (key === 'cod') {
      const preferred = methods.find((m) => m.type === 'cod_preference' && m.status === 'active');
      try {
        setBusy(true);
        await userPaymentMethodService.setCodPreference(!preferred);
        toast.success(preferred ? 'COD preference removed' : 'COD set as preferred for eligible bookings');
        await load();
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Failed');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (key === 'upi') {
      setShowUpiModal(true);
      return;
    }
    openRazorpayVault(key);
  };

  const submitUpi = async () => {
    if (!upiId.trim()) return toast.error('Enter UPI ID');
    setBusy(true);
    try {
      // Prefer gateway verify (₹1) for tokenisation; fall back to VPA save
      try {
        await openRazorpayVault('upi');
        setShowUpiModal(false);
        setUpiId('');
        return;
      } catch (_) { /* fall through */ }
      const res = await userPaymentMethodService.verifyUpi(upiId.trim());
      if (res.success) {
        toast.success('UPI ID saved');
        setShowUpiModal(false);
        setUpiId('');
        await load();
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Invalid UPI ID');
    } finally {
      setBusy(false);
    }
  };

  const requestOtpThen = async (action, id) => {
    try {
      await userPaymentMethodService.sendSensitiveOtp();
      toast.success('OTP sent to your phone');
      setOtp('');
      setOtpModal({ action, id });
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to send OTP');
    }
  };

  const confirmOtpAction = async () => {
    if (!otpModal) return;
    setBusy(true);
    try {
      if (otpModal.action === 'default') {
        await userPaymentMethodService.setDefault(otpModal.id, otp);
        toast.success('Default payment method updated');
      } else {
        await userPaymentMethodService.deleteMethod(otpModal.id, otp);
        toast.success('Payment method removed');
      }
      setOtpModal(null);
      setOtp('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async () => {
    setShowHistory(true);
    try {
      const res = await userPaymentMethodService.getHistory({ limit: 30 });
      setHistory(res.data || []);
    } catch {
      toast.error('Failed to load history');
    }
  };

  const downloadReceipt = async (id) => {
    try {
      const html = await userPaymentMethodService.downloadReceiptHtml(id);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }
    } catch {
      toast.error('Receipt unavailable');
    }
  };

  const retryPay = async (id) => {
    try {
      await loadRazorpay();
      const res = await userPaymentMethodService.retryPayment(id);
      if (!res.success) throw new Error(res.message);
      const d = res.data;
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: d.keyId,
          amount: Math.round(d.amount * 100),
          currency: d.currency || 'INR',
          name: 'WBI',
          description: 'Retry payment',
          order_id: d.orderId,
          customer_id: d.customerId || undefined,
          handler: async (response) => {
            try {
              const { default: paymentService } = await import('../../../../services/paymentService');
              await paymentService.verifyPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                bookingId: d.bookingId
              });
              toast.success('Payment successful');
              loadHistory();
              resolve();
            } catch (e) {
              toast.error('Verification failed');
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error('cancelled')) }
        });
        rzp.open();
      });
    } catch (e) {
      if (e?.message !== 'cancelled') toast.error(e?.response?.data?.message || e.message || 'Retry failed');
    }
  };

  const enabledKeys = (config?.methods || []).map((m) => m.key);
  const codEnabled = config?.cod?.enabled;
  const codPreferred = methods.some((m) => m.type === 'cod_preference' && m.status === 'active');
  const savedInstruments = methods.filter((m) => m.type !== 'cod_preference');

  return (
    <div className="min-h-screen bg-[#F7F7F8] pb-24 font-[DM_Sans,system-ui,sans-serif]">
      <div className="max-w-[480px] mx-auto bg-white min-h-screen shadow-[0_0_40px_rgba(0,0,0,0.08)]">
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg hover:bg-gray-50">
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Manage payment methods</h1>
          <button type="button" onClick={load} className="p-2 rounded-lg hover:bg-gray-50" disabled={loading}>
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <p className="px-4 pt-3 text-xs text-gray-500 leading-relaxed">
          {config?.gateway?.verificationNote ||
            'We will debit ₹1 to verify a new payment method. This will be refunded after verification.'}
        </p>

        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Saved methods</h2>
            <button type="button" onClick={loadHistory} className="text-xs font-semibold text-teal-700">
              Payment history
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : savedInstruments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              No saved payment methods yet
            </div>
          ) : (
            savedInstruments.map((m) => (
              <div key={m.id} className="rounded-xl bg-white border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${METHOD_META[m.type]?.color || 'bg-gray-50'}`}>
                  {React.createElement(METHOD_META[m.type]?.icon || FiCreditCard, { className: 'w-5 h-5' })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{m.maskedDisplay}</p>
                  <p className="text-[11px] text-gray-500 capitalize">
                    {m.type}{m.isDefault ? ' · Default' : ''}{m.isVerified ? ' · Verified' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  title="Set default"
                  disabled={m.isDefault || busy}
                  onClick={() => requestOtpThen('default', m.id)}
                  className="p-2 text-amber-500 disabled:opacity-30"
                >
                  <FiStar className={m.isDefault ? 'fill-current' : ''} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  disabled={busy}
                  onClick={() => requestOtpThen('delete', m.id)}
                  className="p-2 text-red-500"
                >
                  <FiTrash2 />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-4 pb-6 space-y-4">
          <h2 className="text-sm font-bold text-gray-800">Add payment method</h2>
          {['upi', 'wallet', 'card', 'netbanking'].map((key) => {
            const meta = METHOD_META[key];
            const enabled = enabledKeys.includes(key);
            if (!enabled) return null;
            const Icon = meta.icon;
            return (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => handleAdd(key)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:bg-gray-50 text-left disabled:opacity-60"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${meta.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{meta.title}</p>
                  <p className="text-xs text-gray-500">{meta.sub}</p>
                </div>
                <FiChevronRight className="text-gray-400" />
              </button>
            );
          })}

          {codEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleAdd('cod')}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm hover:bg-gray-50 text-left"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${METHOD_META.cod.color}`}>
                <FiDollarSign className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{METHOD_META.cod.title}</p>
                <p className="text-xs text-gray-500">{METHOD_META.cod.sub}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${codPreferred ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                {codPreferred ? 'PREFERRED' : 'AVAILABLE'}
              </span>
            </button>
          )}
        </div>
      </div>

      {showUpiModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white w-full max-w-[480px] rounded-t-2xl p-5 space-y-3">
            <h3 className="font-bold text-gray-900">Add UPI ID</h3>
            <p className="text-xs text-gray-500">You can verify via Razorpay Checkout (recommended) or save a VPA.</p>
            <input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="name@upi"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowUpiModal(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-semibold">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={submitUpi} className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold">
                Continue
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setShowUpiModal(false); openRazorpayVault('upi'); }}
              className="w-full py-2 text-xs font-semibold text-teal-700"
            >
              Verify with ₹1 Razorpay payment instead
            </button>
          </div>
        </div>
      )}

      {otpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-gray-900">Confirm with OTP</h3>
            <p className="text-xs text-gray-500">Enter the OTP sent to your registered phone.</p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit OTP"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm tracking-widest text-center"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setOtpModal(null)} className="flex-1 py-2.5 rounded-xl border text-sm font-semibold">
                Cancel
              </button>
              <button type="button" disabled={busy || otp.length < 4} onClick={confirmOtpAction} className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold flex items-center justify-center gap-1">
                <FiCheck /> Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white w-full max-w-[480px] rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">Payment history</h3>
              <button type="button" onClick={() => setShowHistory(false)} className="text-sm text-gray-500">Close</button>
            </div>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No transactions</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{h.title}</p>
                        <p className="text-[11px] text-gray-500">
                          {h.paymentMethod || '—'} · {h.paymentStatus || '—'}
                        </p>
                      </div>
                      <p className="text-sm font-bold">₹{Number(h.amount || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {h.canReceipt && (
                        <button type="button" onClick={() => downloadReceipt(h.id)} className="text-[11px] font-semibold text-teal-700 flex items-center gap-1">
                          <FiDownload /> Receipt
                        </button>
                      )}
                      {h.canRetry && (
                        <button type="button" onClick={() => retryPay(h.id)} className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                          <FiRefreshCw /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default ManagePaymentMethods;
