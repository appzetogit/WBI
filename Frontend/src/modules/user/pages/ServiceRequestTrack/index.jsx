import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft, FiCheckCircle, FiCreditCard, FiClock, FiXCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import { loadRazorpay } from '../../../../utils/loadRazorpay';

const ASSIGNMENT_POLL_MS = 12000;
const PAYMENT_CONFIRM_POLL_MS = 5000;
const PAYMENT_CONFIRM_MAX_TRIES = 12;

const statusCopy = (request) => {
  const pay = request?.payment?.status;
  if (pay === 'pending' || pay === 'failed') {
    return { tone: 'amber', icon: FiCreditCard, title: 'Payment pending', text: 'Complete payment to notify vendors' };
  }
  switch (request?.status) {
    case 'Assigned':
      return { tone: 'emerald', icon: FiCheckCircle, title: 'Vendor assigned', text: 'A vendor has accepted your project' };
    case 'In Progress':
      return { tone: 'emerald', icon: FiClock, title: 'Work in progress', text: 'Your project is being executed' };
    case 'Completed':
      return { tone: 'emerald', icon: FiCheckCircle, title: 'Completed', text: 'Your project is complete' };
    case 'Cancelled':
      return {
        tone: 'red',
        icon: FiXCircle,
        title: 'Cancelled',
        text:
          request?.payment?.escrowStatus === 'refunded'
            ? 'We could not assign a provider — your payment has been refunded'
            : 'This request was cancelled'
      };
    default:
      return { tone: 'amber', icon: FiClock, title: 'Request submitted', text: 'Waiting for vendor acceptance' };
  }
};

const toneClasses = {
  amber: 'bg-amber-100 text-amber-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  red: 'bg-red-100 text-red-600'
};

const ServiceRequestTrack = () => {
  const { requestCode } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [paying, setPaying] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [signingMilestoneId, setSigningMilestoneId] = useState(null);

  const loadRequest = useCallback(async () => {
    try {
      const res = await api.get(`/public/service-requests/${requestCode}`);
      if (res.data?.success) setRequest(res.data.data);
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true);
      else toast.error(err.response?.data?.message || 'Could not load your request');
    } finally {
      setLoading(false);
    }
  }, [requestCode]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const hasRequest = !!request;
  const paymentStatus = request?.payment?.status;
  const awaitingPayment = paymentStatus === 'pending' || paymentStatus === 'failed';

  // Live vendor-matching timeline once the request is paid (or needs no payment)
  useEffect(() => {
    if (!hasRequest || awaitingPayment) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get(`/public/service-requests/${requestCode}/assignment`);
        if (cancelled || !res.data?.success) return;
        const data = res.data.data;
        setAssignment(data);
        setRequest((r) =>
          r ? { ...r, status: data.status || r.status, payment: { ...r.payment, status: data.paymentStatus || r.payment?.status } } : r
        );
      } catch {
        /* retry on next poll */
      }
    };
    load();
    const t = setInterval(load, ASSIGNMENT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [requestCode, hasRequest, awaitingPayment]);

  // Bank confirmed late (authorised, not yet captured) — the server settles it
  // via webhook / reconciliation, so keep re-reading the request for a minute.
  useEffect(() => {
    if (!confirmingPayment) return undefined;
    if (!awaitingPayment) {
      setConfirmingPayment(false);
      return undefined;
    }
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      loadRequest();
      if (tries >= PAYMENT_CONFIRM_MAX_TRIES) {
        clearInterval(t);
        setConfirmingPayment(false);
      }
    }, PAYMENT_CONFIRM_POLL_MS);
    return () => clearInterval(t);
  }, [confirmingPayment, awaitingPayment, loadRequest]);

  const startRazorpayPayment = useCallback(async () => {
    setPaying(true);
    try {
      const orderRes = await api.post(`/public/service-requests/${requestCode}/payment/order`);
      if (!orderRes.data?.success) {
        toast.error(orderRes.data?.message || 'Could not start payment');
        return;
      }
      if (!orderRes.data.paymentRequired || orderRes.data.alreadyPaid) {
        toast.success('Payment already completed');
        await loadRequest();
        return;
      }
      const { orderId, amount, key } = orderRes.data.data;
      const razorpayKey = key || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        toast.error('Razorpay key missing — set VITE_RAZORPAY_KEY_ID in Frontend .env');
        return;
      }
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: razorpayKey,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: import.meta.env.VITE_APP_NAME || 'WBI',
        description: request?.subCategoryName || 'Service request',
        order_id: orderId,
        notes: { requestCode },
        handler: async (response) => {
          try {
            const verifyRes = await api.post(`/public/service-requests/${requestCode}/payment/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            if (verifyRes.data?.processing) {
              toast('Payment received — confirming with your bank…');
              setConfirmingPayment(true);
            } else if (verifyRes.data?.success) {
              toast.success('Payment successful — finding vendors…');
            } else {
              toast.error(verifyRes.data?.message || 'Payment verification failed');
            }
          } catch (err) {
            // The payment may still have gone through — the server reconciles it on reload.
            toast.error(err.response?.data?.message || 'Payment verification failed');
            setConfirmingPayment(true);
          } finally {
            loadRequest();
          }
        },
        theme: { color: '#00a6a6' }
      });
      rzp.on('payment.failed', (resp) => {
        toast.error(resp.error?.description || 'Payment failed');
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment could not be started');
    } finally {
      setPaying(false);
    }
  }, [requestCode, request?.subCategoryName, loadRequest]);

  const approveCustomerMilestone = async (milestoneId) => {
    setSigningMilestoneId(milestoneId);
    try {
      const res = await api.post(
        `/public/service-requests/${requestCode}/milestones/${milestoneId}/customer-signoff`,
        { approved: true }
      );
      if (res.data?.success) {
        toast.success(res.data?.pending ? 'Signed off — release pending other gates' : 'Thank you — milestone approved');
        const assignRes = await api.get(`/public/service-requests/${requestCode}/assignment`);
        if (assignRes.data?.success) setAssignment(assignRes.data.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit approval');
    } finally {
      setSigningMilestoneId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] p-4">
        <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse mb-6" />
        <div className="h-8 w-48 bg-gray-200 rounded-md animate-pulse mb-4" />
        <div className="h-64 bg-gray-200 rounded-3xl animate-pulse" />
      </div>
    );
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-bold text-gray-800 mb-2">Request not found</p>
        <button onClick={() => navigate('/user/my-bookings')} className="text-[#00a6a6] font-semibold">
          Go to My Bookings
        </button>
      </div>
    );
  }

  const copy = statusCopy(request);
  const StatusIcon = copy.icon;

  return (
    <div className="min-h-screen bg-[#F8FCFC] pb-24">
      <header className="px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/user/my-bookings')}
          className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center"
        >
          <FiChevronLeft className="text-xl" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">{request.subCategoryName}</h1>
          <p className="text-xs text-gray-500">{request.categoryName} · {request.requestCode}</p>
        </div>
      </header>

      <div className="px-4 flex flex-col items-center text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 mt-4 ${toneClasses[copy.tone]}`}>
          <StatusIcon className="text-3xl" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{copy.title}</h2>
        <p className="text-sm text-gray-500 mb-2">
          Request ID: <span className="font-bold text-gray-800">{request.requestCode}</span>
        </p>

        {awaitingPayment ? (
          confirmingPayment ? (
            <p className="text-sm text-amber-700 font-medium mb-6">Confirming your payment with the bank…</p>
          ) : (
            <>
              <p className="text-sm text-amber-700 font-medium mb-2">
                Pay ₹{Number(request.payment?.amount || 0).toLocaleString('en-IN')} to notify vendors
              </p>
              <p className="text-xs text-gray-500 mb-4 max-w-sm">
                Amount is held in escrow until work is completed. Vendors are matched only after successful payment.
              </p>
              <button
                type="button"
                disabled={paying}
                onClick={startRazorpayPayment}
                className="mb-6 px-6 py-3 rounded-xl text-white font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: '#00a6a6' }}
              >
                <FiCreditCard />
                {paying ? 'Opening Razorpay…' : 'Pay with Razorpay'}
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-gray-600 font-medium mb-6">{assignment?.message || copy.text}</p>
        )}

        {assignment?.timeline?.length > 0 && (
          <div className="w-full max-w-md text-left bg-white rounded-2xl border p-4 mb-6 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase">Live timeline</p>
            {assignment.timeline.map((step) => (
              <div key={step.key} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${step.done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                <span className={step.done ? 'text-gray-800 font-medium' : 'text-gray-400'}>{step.label}</span>
              </div>
            ))}
          </div>
        )}

        {assignment?.pendingCustomerMilestones?.length > 0 && (
          <div className="w-full max-w-md text-left bg-white rounded-2xl border border-amber-100 p-4 mb-6 space-y-3">
            <p className="text-xs font-bold text-amber-800 uppercase">Your approval needed</p>
            <p className="text-xs text-gray-500">QA is complete. Approve milestones to release escrow to the vendor.</p>
            {assignment.pendingCustomerMilestones.map((ms) => (
              <div key={ms._id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-xl p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{ms.title}</p>
                  <p className="text-[11px] text-gray-400">{ms.milestoneCode}</p>
                </div>
                <button
                  type="button"
                  disabled={signingMilestoneId === ms._id}
                  onClick={() => approveCustomerMilestone(ms._id)}
                  className="px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-60"
                  style={{ backgroundColor: '#00a6a6' }}
                >
                  {signingMilestoneId === ms._id ? '…' : 'Approve'}
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/user/home')}
          className="px-6 py-3 rounded-xl text-white font-semibold"
          style={{ backgroundColor: '#00a6a6' }}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};

export default ServiceRequestTrack;
