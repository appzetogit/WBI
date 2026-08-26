import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft, FiCheckCircle, FiCreditCard } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import api from '../../../../services/api';
import DynamicForm from '../../../../components/common/DynamicForm';
import { loadRazorpay } from '../../../../utils/loadRazorpay';

const DynamicServiceRequest = () => {
  const { subCatCode } = useParams();
  const navigate = useNavigate();
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [paying, setPaying] = useState(false);

  const [signingMilestoneId, setSigningMilestoneId] = useState(null);

  const approveCustomerMilestone = async (milestoneId) => {
    if (!confirmation?.requestCode) return;
    setSigningMilestoneId(milestoneId);
    try {
      const res = await api.post(
        `/public/service-requests/${confirmation.requestCode}/milestones/${milestoneId}/customer-signoff`,
        { approved: true }
      );
      if (res.data?.success) {
        toast.success(res.data?.pending ? 'Signed off — release pending other gates' : 'Thank you — milestone approved');
        const assignRes = await api.get(`/public/service-requests/${confirmation.requestCode}/assignment`);
        if (assignRes.data?.success) setAssignment(assignRes.data.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit approval');
    } finally {
      setSigningMilestoneId(null);
    }
  };

  const assignmentPollEnabled =
    confirmation?.requestCode &&
    (!confirmation.paymentRequired || confirmation.paymentStatus === 'paid' || confirmation.paymentStatus === 'skipped' || confirmation.paymentStatus === 'not_required');

  useEffect(() => {
    if (!confirmation?.requestCode || !assignmentPollEnabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get(`/public/service-requests/${confirmation.requestCode}/assignment`);
        if (!cancelled && res.data?.success) setAssignment(res.data.data);
      } catch {
        /* retry on poll */
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [confirmation?.requestCode, assignmentPollEnabled]);

  const startRazorpayPayment = useCallback(async () => {
    if (!confirmation?.requestCode) return;
    setPaying(true);
    try {
      const orderRes = await api.post(`/public/service-requests/${confirmation.requestCode}/payment/order`);
      if (!orderRes.data?.success) {
        toast.error(orderRes.data?.message || 'Could not start payment');
        return;
      }
      if (!orderRes.data.paymentRequired || orderRes.data.alreadyPaid) {
        setConfirmation((c) => ({ ...c, paymentRequired: false, paymentStatus: 'paid' }));
        toast.success('Payment already completed');
        return;
      }
      const { orderId, amount, key } = orderRes.data.data;
      const razorpayKey = key || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        toast.error('Razorpay key missing — set VITE_RAZORPAY_KEY_ID in Frontend .env');
        return;
      }
      await loadRazorpay();
      const options = {
        key: razorpayKey,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: import.meta.env.VITE_APP_NAME || 'WBI',
        description: schema?.subCategoryName || 'Service request',
        order_id: orderId,
        handler: async (response) => {
          try {
            const verifyRes = await api.post(
              `/public/service-requests/${confirmation.requestCode}/payment/verify`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }
            );
            if (verifyRes.data?.success) {
              toast.success('Payment successful — finding vendors…');
              setConfirmation((c) => ({
                ...c,
                paymentRequired: false,
                paymentStatus: 'paid'
              }));
            } else {
              toast.error(verifyRes.data?.message || 'Payment verification failed');
            }
          } catch (err) {
            toast.error(err.response?.data?.message || 'Payment verification failed');
          }
        },
        theme: { color: '#00a6a6' }
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        toast.error(resp.error?.description || 'Payment failed');
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment could not be started');
    } finally {
      setPaying(false);
    }
  }, [confirmation?.requestCode, schema?.subCategoryName]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/public/form-schemas/${subCatCode}`);
        if (!cancelled && res.data?.success) {
          setSchema(res.data.data);
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Form not available');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [subCatCode]);

  const handleFormSubmit = (formData) => {
    setReviewData(formData);
  };

  const handleConfirm = async () => {
    if (!reviewData || !schema) return;
    setSubmitting(true);
    try {
      const res = await api.post('/public/service-requests', {
        subCatCode: schema.subCatCode,
        formData: reviewData
      });
      if (res.data?.success) {
        setConfirmation(res.data.data);
        toast.success('Request submitted successfully');
      } else {
        toast.error(res.data?.message || 'Submit failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
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

  if (!schema) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-bold text-gray-800 mb-2">Form not found</p>
        <button onClick={() => navigate(-1)} className="text-[#00a6a6] font-semibold">Go back</button>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <FiCheckCircle className="text-3xl text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted</h1>
        <p className="text-gray-600 mb-1">{schema.subCategoryName}</p>
        <p className="text-sm text-gray-500 mb-2">Request ID: <span className="font-bold text-gray-800">{confirmation.requestCode}</span></p>
        {confirmation.paymentRequired && confirmation.paymentStatus === 'pending' ? (
          <>
            <p className="text-sm text-amber-700 font-medium mb-2">
              Pay ₹{Number(confirmation.amount || 0).toLocaleString('en-IN')} to notify vendors
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
        ) : (
          <p className="text-sm text-amber-700 font-medium mb-4">Status: Waiting for vendor acceptance</p>
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
    );
  }

  if (reviewData) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] pb-24">
        <header className="px-4 py-4 flex items-center gap-3">
          <button onClick={() => setReviewData(null)} className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center">
            <FiChevronLeft className="text-xl" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Review & Confirm</h1>
        </header>
        <div className="px-4">
          <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-[#00a6a6]">{schema.subCategoryName}</p>
            {schema.basePrice > 0 && (
              <p className="text-sm text-gray-700">
                Estimated fee: <span className="font-bold">₹{Number(schema.basePrice).toLocaleString('en-IN')}</span>
                <span className="text-xs text-gray-500 block">Pay online after submit (Razorpay)</span>
              </p>
            )}
            {schema.fields.map((f) => {
              const key = f.key || f.fieldName;
              const val = reviewData[key];
              if (val === undefined || val === null || val === '') return null;
              return (
                <div key={key} className="border-b border-gray-50 pb-2">
                  <p className="text-xs text-gray-500">{f.label}</p>
                  <p className="text-sm font-medium text-gray-800">
                    {Array.isArray(val) ? val.join(', ') : String(val).startsWith('data:') ? 'File attached' : String(val)}
                  </p>
                </div>
              );
            })}
          </div>
          <button
            disabled={submitting}
            onClick={handleConfirm}
            className="mt-6 w-full py-3.5 rounded-xl text-white font-bold disabled:opacity-60"
            style={{ backgroundColor: '#00a6a6' }}
          >
            {submitting ? 'Submitting…' : 'Confirm & Submit'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FCFC] pb-24">
      <header className="px-4 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center">
          <FiChevronLeft className="text-xl" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{schema.subCategoryName}</h1>
          <p className="text-xs text-gray-500">{schema.categoryName} · {schema.subCatCode}</p>
        </div>
      </header>
      <div className="px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#10AFA5] to-[#0A8D84] rounded-3xl p-6 text-white mb-6 shadow-lg"
        >
          <h2 className="text-2xl font-bold mb-2">Book Your {schema.subCategoryName} Request</h2>
          <p className="text-sm text-teal-50 opacity-90 leading-relaxed">
            Fill out this form to give us the details of your service request. Our expert team will review your requirements and assign the best professional for the job.
          </p>
        </motion.div>
        {schema.description && (
          <p className="text-sm text-gray-600 mb-4">{schema.description}</p>
        )}
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm mb-8">
          <DynamicForm
            key={schema.subCatCode}
            config={schema}
            onSubmit={handleFormSubmit}
            onCancel={() => navigate(-1)}
            submitLabel="Review"
          />
        </div>
      </div>
    </div>
  );
};

export default DynamicServiceRequest;
