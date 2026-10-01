import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import api from '../../../../services/api';
import DynamicForm from '../../../../components/common/DynamicForm';

const DynamicServiceRequest = () => {
  const { subCatCode } = useParams();
  const navigate = useNavigate();
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewData, setReviewData] = useState(null);

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
        toast.success('Request submitted successfully');
        // Payment, live timeline and milestone approvals live on the tracking page,
        // which also works after a refresh or from My Bookings.
        navigate(`/user/service-request/track/${res.data.data.requestCode}`, { replace: true });
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
