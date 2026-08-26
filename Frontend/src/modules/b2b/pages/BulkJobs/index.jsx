import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FiUploadCloud, FiDownload, FiCheckCircle, FiFileText, 
  FiAlertCircle, FiClock, FiPlusCircle, FiList, FiTrendingUp,
  FiTrendingDown, FiLoader, FiX, FiCheck, FiArrowRight, FiCreditCard,
  FiAlertTriangle, FiThumbsUp, FiThumbsDown
} from 'react-icons/fi';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../../../services/api';
import { useSocket } from '../../../../context/SocketContext';

const BulkJobs = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const socket = useSocket();

  // Active batch tracked locally during upload flow
  const [activeBatchId, setActiveBatchId] = useState(() => localStorage.getItem('activeB2BBatchId') || null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [creationProgress, setCreationProgress] = useState(0);
  const [liveStats, setLiveStats] = useState(null);

  // 1. Fetch Stats summary
  const { data: statsData } = useQuery({
    queryKey: ['b2bBulkJobStats'],
    queryFn: async () => {
      const res = await api.get('/b2b/bulk-jobs/stats');
      return res.data;
    },
    refetchInterval: 15000 // Refetch every 15s to keep dashboard statistics fresh
  });

  // 2. Fetch Wallet summary
  const { data: walletData } = useQuery({
    queryKey: ['b2bWalletSummary'],
    queryFn: async () => {
      const res = await api.get('/b2b/wallet/summary');
      return res.data.data;
    }
  });

  // 2b. Fetch pending quote approvals
  const { data: pendingQuotes, refetch: refetchQuotes } = useQuery({
    queryKey: ['b2bPendingQuotes'],
    queryFn: async () => {
      const res = await api.get('/b2b/jobs/quotes/pending');
      return res.data.data;
    },
    refetchInterval: 30000
  });

  const [quoteAction, setQuoteAction] = useState(null); // { quote, type: 'approve'|'reject' }
  const [quoteRemarks, setQuoteRemarks] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);

  // 3. Fetch latest uploads for the side panel
  const { data: historyData } = useQuery({
    queryKey: ['b2bHistoryRecent'],
    queryFn: async () => {
      const res = await api.get('/b2b/bulk-jobs/history?limit=5');
      return res.data.batches;
    }
  });

  // 4. Query active batch details if batchId is set — polls every 3s during processing
  const { data: activeBatch, refetch: refetchActiveBatch } = useQuery({
    queryKey: ['b2bActiveBatch', activeBatchId],
    queryFn: async () => {
      if (!activeBatchId) return null;
      try {
        const res = await api.get(`/b2b/bulk-jobs/${activeBatchId}`);
        return res.data.batch;
      } catch (err) {
        if (err.response?.status === 404) {
          localStorage.removeItem('activeB2BBatchId');
          setActiveBatchId(null);
          return null;
        }
        throw err;
      }
    },
    enabled: !!activeBatchId,
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
    // Auto-poll every 3s when batch is in an active state; stop when done/failed
    refetchInterval: (query) => {
      const status = query.state?.data?.status;
      if (!status) return 3000;
      if (['validating', 'processing'].includes(status)) return 3000;
      if (['validated', 'completed', 'failed'].includes(status)) return false;
      return 5000;
    },
    refetchIntervalInBackground: false
  });

  // Track status transitions from polling — fire toasts & refresh stats automatically
  const prevBatchStatus = React.useRef(null);
  useEffect(() => {
    if (!activeBatch) return;
    const newStatus = activeBatch.status;
    const prevStatus = prevBatchStatus.current;

    if (prevStatus !== newStatus) {
      if (newStatus === 'validating' && prevStatus === 'draft') {
        toast.success('Validation started — checking all rows...');
      }
      if (newStatus === 'validated') {
        toast.success(`Validation done! ${activeBatch.validRows} valid rows ready to confirm.`);
        queryClient.invalidateQueries(['b2bBulkJobStats']);
        setUploadProgress(100);
      }
      if (newStatus === 'processing') {
        toast.success('Jobs are being created...');
      }
      if (newStatus === 'completed') {
        toast.success('All jobs created successfully!');
        queryClient.invalidateQueries(['b2bBulkJobStats']);
        setCreationProgress(100);
      }
      if (newStatus === 'failed') {
        // Never dump raw Mongoose / driver strings into the toast.
        const reason = activeBatch.failureReason || 'Please download the error report or re-upload using the sample template.';
        const cleaned = /validation failed|Path `|B2BJob|mongoose/i.test(reason)
          ? 'Some rows had missing or invalid required fields. Download the error report for details.'
          : reason;
        toast.error(cleaned);
        queryClient.invalidateQueries(['b2bBulkJobStats']);
      }
      prevBatchStatus.current = newStatus;
    }
  }, [activeBatch, queryClient]);

  // Socket event listening for real-time progress pings
  useEffect(() => {
    if (!socket || !activeBatchId) return;

    // Join batch tracking room
    socket.emit('join_batch', activeBatchId);

    const onValidationStarted = () => {
      setUploadProgress(0);
      toast.success('Spreadsheet validation started.');
      refetchActiveBatch();
    };

    const onValidationProgress = (data) => {
      setUploadProgress(data.progress);
      setLiveStats({
        processed: data.processed,
        total: data.total,
        valid: data.valid,
        invalid: data.invalid,
        duplicates: data.duplicates
      });
    };

    const onValidationCompleted = () => {
      setUploadProgress(100);
      toast.success('Validation completed successfully!');
      queryClient.invalidateQueries(['b2bBulkJobStats']);
      refetchActiveBatch();
    };

    const onValidationFailed = (data) => {
      const msg = data.error || 'Validation failed. Please check your file and try again.';
      toast.error(msg);
      refetchActiveBatch();
    };

    const onUploadStarted = () => {
      setCreationProgress(0);
      refetchActiveBatch();
    };

    const onCreationProgress = (data) => {
      setCreationProgress(data.progress);
    };

    const onUploadCompleted = () => {
      setCreationProgress(100);
      toast.success('All jobs successfully created and scheduled!');
      localStorage.removeItem('activeB2BBatchId');
      queryClient.invalidateQueries(['b2bBulkJobStats']);
      refetchActiveBatch();
    };

    const onUploadFailed = (data) => {
      const msg = data.error || 'Job creation failed. Download the error report or retry.';
      toast.error(msg);
      refetchActiveBatch();
    };

    const onBatchAction = (data) => {
      toast(`Admin Action: ${data.message}`);
      refetchActiveBatch();
    };

    socket.on('b2b:validationStarted', onValidationStarted);
    socket.on('b2b:validationProgress', onValidationProgress);
    socket.on('b2b:validationCompleted', onValidationCompleted);
    socket.on('b2b:validationFailed', onValidationFailed);
    socket.on('b2b:uploadStarted', onUploadStarted);
    socket.on('b2b:creationProgress', onCreationProgress);
    socket.on('b2b:uploadCompleted', onUploadCompleted);
    socket.on('b2b:uploadFailed', onUploadFailed);
    socket.on('b2b:batchActionExecuted', onBatchAction);

    return () => {
      socket.off('b2b:validationStarted', onValidationStarted);
      socket.off('b2b:validationProgress', onValidationProgress);
      socket.off('b2b:validationCompleted', onValidationCompleted);
      socket.off('b2b:validationFailed', onValidationFailed);
      socket.off('b2b:uploadStarted', onUploadStarted);
      socket.off('b2b:creationProgress', onCreationProgress);
      socket.off('b2b:uploadCompleted', onUploadCompleted);
      socket.off('b2b:uploadFailed', onUploadFailed);
      socket.off('b2b:batchActionExecuted', onBatchAction);
    };
  }, [socket, activeBatchId, queryClient, navigate, refetchActiveBatch]);

  // File drop Mutation
  const fileUploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/b2b/bulk-jobs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: (data) => {
      const batchMongoId = data.batch.id;
      setActiveBatchId(batchMongoId);
      localStorage.setItem('activeB2BBatchId', batchMongoId);
      queryClient.invalidateQueries(['b2bHistoryRecent']);
      toast.success('Spreadsheet uploaded. Parsing queue running...');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to upload spreadsheet');
    }
  });

  // 5. Query active batch first 10 errors preview if activeBatchId is set and status is validated
  const { data: errorsData } = useQuery({
    queryKey: ['b2bBatchErrorsPreview', activeBatchId],
    queryFn: async () => {
      if (!activeBatchId) return null;
      const res = await api.get(`/b2b/bulk-jobs/errors/${activeBatchId}`, {
        params: { page: 1, limit: 10 }
      });
      return res.data.errors;
    },
    enabled: !!activeBatchId && activeBatch?.status === 'validated'
  });

  // Confirm Upload dispatch mutation
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/b2b/bulk-jobs/confirm/${activeBatchId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Batch dispatch queued successfully!');
      queryClient.invalidateQueries(['b2bBulkJobStats']);
      refetchActiveBatch();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Dispatch confirmation failed');
    }
  });

  // Abort and delete draft batch mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/b2b/bulk-jobs/${activeBatchId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Batch draft purged successfully');
      handleClearWizard();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Purging failed');
    }
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    multiple: false,
    onDrop: (acceptedFiles, fileRejections) => {
      if (fileRejections && fileRejections.length > 0) {
        toast.error('Only .xlsx, .xls, .csv allowed');
        return;
      }
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) {
          toast.error('Only .xlsx, .xls, .csv allowed');
          return;
        }
        fileUploadMutation.mutate(file);
      }
    }
  });

  // Calculate current wizard step
  const getWizardStep = () => {
    if (!activeBatchId) return 1; // No active batch: Upload step
    if (!activeBatch) return 2;   // Batch ID exists but data loading: show validating step
    const status = activeBatch.status;
    if (status === 'draft') return 2;       // Just uploaded, queued for validation
    if (status === 'validating') return 2;  // Actively validating
    if (status === 'validated') return 3;   // Done — show Review & Confirm
    if (status === 'processing') return 4;  // Creating jobs
    if (status === 'completed') return 5;   // All done
    if (status === 'failed') return 3;      // Failed — show review with error info
    return 1; // Fallback
  };

  const currentStep = getWizardStep();

  // Reset/Clear wizard helper
  const handleClearWizard = () => {
    localStorage.removeItem('activeB2BBatchId');
    setActiveBatchId(null);
    setUploadProgress(0);
    setCreationProgress(0);
    setLiveStats(null);
    queryClient.removeQueries(['b2bActiveBatch']);
    queryClient.invalidateQueries(['b2bHistoryRecent']);
  };

  const stats = statsData?.stats || {
    totalUploads: 0,
    jobsUploaded: 0,
    processingJobs: 0,
    failedRows: 0,
    walletBalance: 0
  };

  // Low balance: flag if wallet < ₹5000
  const LOW_BALANCE_THRESHOLD = 5000;
  const walletBalance = walletData?.balance ?? stats.walletBalance;
  const isLowBalance = walletBalance < LOW_BALANCE_THRESHOLD;

  const handleQuoteDecision = async (quoteId, type, remarks) => {
    setQuoteLoading(true);
    try {
      await api.post(`/b2b/jobs/quotes/${quoteId}/${type}`, { clientRemarks: remarks });
      toast.success(`Quote ${type === 'approve' ? 'Approved! Job is now active.' : 'Rejected. Job cancelled.'}`);
      setQuoteAction(null);
      setQuoteRemarks('');
      refetchQuotes();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${type} quote`);
    } finally {
      setQuoteLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Bulk Job Upload</h1>
          <p className="text-sm text-gray-500 font-semibold mt-1">
            Upload your jobs in bulk using Excel or CSV. Our system will validate and process them.
          </p>
        </div>
        <a 
          href={`${import.meta.env.VITE_API_BASE_URL || 'https://app.wbinfs.com'}/api/b2b/bulk-jobs/sample`}
          download
          className="bg-white border border-[#E6F4F2] hover:border-[#10AFA5] text-gray-700 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center gap-2 transition-all hover:shadow cursor-pointer"
        >
          <FiDownload className="text-[#10AFA5] w-4.5 h-4.5" />
          Download Sample Excel
        </a>
      </div>

      {/* ⚠️ Low Wallet Balance Alert Banner */}
      {isLowBalance && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <FiAlertTriangle className="text-amber-600 w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-amber-800 text-sm">Low Wallet Balance — Job Activation Restricted</p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                Your current balance is <strong>₹{walletBalance.toLocaleString('en-IN')}</strong>. A minimum of ₹{LOW_BALANCE_THRESHOLD.toLocaleString('en-IN')} is required to activate new jobs. Please top-up to continue.
              </p>
            </div>
          </div>
          <Link to="/b2b/wallet" className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors">
            Top Up Wallet
          </Link>
        </div>
      )}

      {/* 📋 Pending Quote Approvals Banner */}
      {pendingQuotes && pendingQuotes.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FiFileText className="text-blue-600" />
            <p className="font-bold text-blue-800 text-sm">{pendingQuotes.length} Modified Quote{pendingQuotes.length > 1 ? 's' : ''} Pending Your Approval</p>
          </div>
          <div className="space-y-2">
            {pendingQuotes.map(q => (
              <div key={q._id} className="bg-white border border-blue-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{q.jobId?.service || 'Service Job'} — {q.jobId?.city}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Original: <span className="line-through">₹{q.originalAmount}</span> &rarr; Revised: <strong className="text-blue-700">₹{q.proposedAmount}</strong>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5 italic">{q.reasonForChange}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuoteAction({ quote: q, type: 'approve' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    <FiThumbsUp size={12} /> Approve
                  </button>
                  <button
                    onClick={() => setQuoteAction({ quote: q, type: 'reject' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    <FiThumbsDown size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quote Decision Confirmation Modal */}
      {quoteAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className={`p-5 ${quoteAction.type === 'approve' ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-red-50 border-b border-red-100'}`}>
              <h3 className="font-black text-gray-900">{quoteAction.type === 'approve' ? '✅ Approve Revised Quote' : '❌ Reject Revised Quote'}</h3>
              <p className="text-xs text-gray-500 mt-1">
                Job: <strong>{quoteAction.quote.jobId?.service}</strong> — 
                {quoteAction.type === 'approve' 
                  ? ` Approving will deduct ₹${quoteAction.quote.proposedAmount} from your wallet and activate this job.`
                  : ` Rejecting will cancel this job permanently.`
                }
              </p>
            </div>
            <div className="p-5">
              <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Your Remarks (optional)</label>
              <textarea
                rows={3}
                value={quoteRemarks}
                onChange={e => setQuoteRemarks(e.target.value)}
                placeholder="Add any notes for your records..."
                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-[#10AFA5] resize-none"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setQuoteAction(null); setQuoteRemarks(''); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleQuoteDecision(quoteAction.quote._id, quoteAction.type, quoteRemarks)}
                  disabled={quoteLoading}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors ${quoteAction.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50`}
                >
                  {quoteLoading ? 'Processing...' : quoteAction.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Statistics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { title: 'Total Uploads', value: stats.totalUploads, trend: '↑ 20% from last month', up: true, color: 'text-gray-800' },
          { title: 'Jobs Uploaded', value: stats.jobsUploaded.toLocaleString('en-IN'), trend: '↑ 18% from last month', up: true, color: 'text-gray-800' },
          { title: 'Processing Jobs', value: stats.processingJobs, trend: 'running background queues', color: 'text-yellow-600' },
          { title: 'Failed Rows', value: stats.failedRows, trend: '↓ 5% from last month', up: false, color: 'text-red-500' },
          { title: 'Wallet Balance', value: `₹${stats.walletBalance.toLocaleString('en-IN')}`, action: true, color: 'text-teal-600' }
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#E6F4F2] p-5 shadow-sm space-y-2 relative overflow-hidden group hover:border-[#10AFA5]/40 transition-colors">
            <span className="text-xs text-gray-400 font-bold block">{c.title}</span>
            <span className={`text-xl font-extrabold block tracking-tight ${c.color}`}>{c.value}</span>
            {c.action ? (
              <Link to="/b2b/wallet" className="text-[10px] font-bold text-[#10AFA5] flex items-center gap-1 group-hover:underline">
                <FiCreditCard className="w-3.5 h-3.5" /> Top Up Wallet
              </Link>
            ) : (
              <span className={`text-[10px] font-semibold flex items-center gap-1 ${c.up === undefined ? 'text-gray-400' : c.up ? 'text-green-500' : 'text-red-500'}`}>
                {c.up !== undefined && (c.up ? <FiTrendingUp /> : <FiTrendingDown />)}
                {c.trend}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Step Horizontal Progress Tracker */}
      <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm overflow-x-auto">
        <div className="flex justify-between items-center min-w-[760px] px-8">
          {[
            { step: 1, title: 'Upload File', desc: 'Choose your Excel file' },
            { step: 2, title: 'Validate Data', desc: 'We validate all rows' },
            { step: 3, title: 'Review & Confirm', desc: 'Check errors & confirm' },
            { step: 4, title: 'Processing', desc: 'Creating jobs...' },
            { step: 5, title: 'Completed', desc: 'Jobs are ready' }
          ].map((s, idx) => {
            const isCompleted = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <React.Fragment key={s.step}>
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted ? 'bg-[#10AFA5] text-white' :
                    isCurrent ? 'bg-[#10AFA5] text-white ring-4 ring-[#10AFA5]/15' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {isCompleted ? <FiCheck className="w-4 h-4" /> : s.step}
                  </div>
                  <div>
                    <span className={`block text-xs font-extrabold ${isCurrent || isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>
                      {s.title}
                    </span>
                    <span className="block text-[10px] font-semibold text-gray-400 mt-0.5">
                      {s.desc}
                    </span>
                  </div>
                </div>
                {idx < 4 && (
                  <div className={`flex-1 h-0.5 mx-4 transition-all ${currentStep > s.step ? 'bg-[#10AFA5]' : 'bg-gray-100'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Dynamic step rendering */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <AnimatePresence mode="wait">
            
            {/* Step 1: Upload layout */}
            {currentStep === 1 && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-6"
              >
                <div className="pb-4 border-b border-gray-50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-gray-800">Upload Bulk Job File (Excel or CSV)</h3>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Drag & drop .xlsx, .xls or .csv</span>
                </div>

                <div 
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[250px] relative ${
                    isDragActive ? 'border-[#10AFA5] bg-[#F0FDFA]/45' : 'border-gray-200 hover:border-[#10AFA5] hover:bg-gray-50/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="h-14 w-14 bg-[#F0FDFA] rounded-2xl flex items-center justify-center text-[#10AFA5] mb-4 group-hover:scale-105 transition-transform">
                    {fileUploadMutation.isPending ? (
                      <FiLoader className="w-7 h-7 animate-spin" />
                    ) : (
                      <FiUploadCloud className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">Drag & drop your Excel or CSV file here</h4>
                    <p className="text-xs text-gray-400 font-semibold mt-1">or click to browse from files</p>
                    <p className="text-[10px] font-bold text-[#10AFA5] mt-4 uppercase tracking-wider bg-[#F0FDFA] px-3 py-1 rounded-full inline-block">
                      ONLY .XLSX, .XLS, .CSV ALLOWED
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Validate layout */}
            {currentStep === 2 && (
              <motion.div 
                key="validate"
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl border border-[#E6F4F2] p-8 shadow-sm space-y-6 text-center"
              >
                <div className="max-w-md mx-auto space-y-6 py-6">
                  <div className="h-16 w-16 bg-[#F0FDFA] rounded-3xl flex items-center justify-center text-[#10AFA5] mx-auto relative">
                    <FiLoader className="w-8 h-8 animate-spin" />
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-[#10AFA5]"></span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-gray-800">Validating Spreadsheet Rows</h3>
                    <p className="text-xs text-gray-400 font-semibold">
                      Our system is checking headers, database service slugs, address coordinates, and duplicate entries.
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-gray-500">Validation Progress</span>
                      <span className="text-[#10AFA5]">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-[#10AFA5] h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Live Countings - from socket OR polled DB data */}
                  {(liveStats || (activeBatch && activeBatch.totalRows > 0)) && (
                    <div className="grid grid-cols-4 gap-2 pt-4 text-xs font-semibold">
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <span className="block text-[10px] text-gray-400">Total Rows</span>
                        <span className="block text-gray-800 font-bold mt-1">
                          {liveStats ? `${liveStats.processed} / ${liveStats.total}` : activeBatch?.totalRows}
                        </span>
                      </div>
                      <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#10AFA5]/10 text-[#10AFA5]">
                        <span className="block text-[10px] text-gray-400">Valid</span>
                        <span className="block font-extrabold mt-1">
                          {liveStats ? liveStats.valid : (activeBatch?.validRows ?? '—')}
                        </span>
                      </div>
                      <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-red-500">
                        <span className="block text-[10px] text-gray-400">Errors</span>
                        <span className="block font-bold mt-1">
                          {liveStats ? liveStats.invalid : (activeBatch?.invalidRows ?? '—')}
                        </span>
                      </div>
                      <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-100 text-yellow-600">
                        <span className="block text-[10px] text-gray-400">Duplicates</span>
                        <span className="block font-bold mt-1">
                          {liveStats ? liveStats.duplicates : (activeBatch?.duplicates ?? '—')}
                        </span>
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={handleClearWizard}
                    className="text-xs text-red-500 font-bold hover:underline mt-4 flex items-center justify-center gap-1.5 mx-auto"
                  >
                    <FiX className="w-4 h-4" /> Cancel Upload Process
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Review & Confirm layout */}
            {currentStep === 3 && activeBatch && (
              <motion.div 
                key="review"
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* File Details Card */}
                <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-6">
                  <div className="flex justify-between items-start flex-wrap gap-4 pb-4 border-b border-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center text-xl font-bold border border-green-100">
                        <FiFileText className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-800">{activeBatch.fileName}</h3>
                        <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                          Uploaded: {new Date(activeBatch.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => deleteBatchMutation.mutate()}
                      disabled={deleteBatchMutation.isPending}
                      className="text-xs text-red-500 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <FiX className="w-4 h-4" /> Remove File
                    </button>
                  </div>

                  {/* Breakdown Mini Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {[
                      { label: 'Total Rows', value: activeBatch.totalRows, color: 'text-gray-800 bg-gray-50/50' },
                      { label: 'Valid Rows', value: activeBatch.validRows, color: 'text-green-600 bg-green-50/30' },
                      { label: 'Invalid Rows', value: activeBatch.invalidRows, color: activeBatch.invalidRows > 0 ? 'text-red-500 bg-red-50/30' : 'text-gray-400 bg-gray-50/30' },
                      { label: 'Duplicates', value: activeBatch.duplicates, color: activeBatch.duplicates > 0 ? 'text-yellow-600 bg-yellow-50/30' : 'text-gray-400 bg-gray-50/30' },
                      { 
                        label: 'Estimated Cost', 
                        value: `₹${activeBatch.estimatedCost.toLocaleString('en-IN')}`, 
                        sub: `(₹${activeBatch.perJobCharge} per job)`,
                        color: 'text-[#10AFA5] bg-teal-50/30' 
                      }
                    ].map((c, i) => (
                      <div key={i} className={`p-4 rounded-2xl border border-gray-50 ${c.color} space-y-1`}>
                        <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider">{c.label}</span>
                        <span className="block text-base font-black tracking-tight">{c.value}</span>
                        {c.sub && <span className="block text-[8px] text-gray-400 font-semibold">{c.sub}</span>}
                      </div>
                    ))}
                  </div>

                  {/* Alerts banner */}
                  {activeBatch.status === 'failed' ? (
                    <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 flex gap-3 text-red-500 items-start text-xs font-semibold leading-relaxed">
                      <FiAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="block font-bold">Batch could not be completed</span>
                        <p className="mt-0.5 font-medium text-red-500/80">
                          {activeBatch.failureReason || 'Please download the error report, fix the rows, and re-upload using the sample Excel template.'}
                        </p>
                        {activeBatch.invalidRows > 0 && (
                          <a
                            href={`${import.meta.env.VITE_API_BASE_URL || 'https://app.wbinfs.com'}/api/b2b/bulk-jobs/errors/${activeBatch._id}/download`}
                            download
                            className="inline-flex items-center gap-1.5 mt-2 text-red-600 font-bold hover:underline"
                          >
                            <FiDownload className="w-3.5 h-3.5" /> Download Error Report
                          </a>
                        )}
                      </div>
                    </div>
                  ) : activeBatch.invalidRows > 0 ? (
                    <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 flex gap-3 text-red-500 items-start text-xs font-semibold leading-relaxed">
                      <FiAlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-bold">Validation flagged errors!</span>
                        <p className="mt-0.5 font-medium text-red-500/80">
                          You have {activeBatch.invalidRows} invalid rows containing formatting errors. You can confirm creation of the {activeBatch.validRows} valid rows, or download the error report, fix them, and re-upload.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#F0FDFA] border border-teal-100 rounded-2xl p-4 flex gap-3 text-[#10AFA5] items-start text-xs font-semibold leading-relaxed">
                      <FiCheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="block font-bold">Validation completed successfully!</span>
                        <p className="mt-0.5 font-medium text-teal-600/80">
                          All {activeBatch.totalRows} rows are validated and ready to schedule. Verify your wallet balance to authorize.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Inline Buttons under Card */}
                  <div className="flex flex-wrap gap-3 pt-2">
                    {activeBatch.invalidRows > 0 && (
                      <a 
                        href={`${import.meta.env.VITE_API_BASE_URL || 'https://app.wbinfs.com'}/api/b2b/bulk-jobs/errors/${activeBatch._id}/download`}
                        download
                        className="bg-white border border-red-100 hover:border-red-300 text-red-600 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <FiDownload className="w-4 h-4" /> Download Error Report
                      </a>
                    )}
                    <button 
                      onClick={() => deleteBatchMutation.mutate()}
                      className="bg-white border border-[#E6F4F2] hover:border-[#10AFA5] text-gray-700 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FiUploadCloud className="w-4 h-4 text-[#10AFA5]" /> Re-upload File
                    </button>
                    <button 
                      onClick={() => confirmMutation.mutate()}
                      disabled={
                        confirmMutation.isPending ||
                        activeBatch.status === 'failed' ||
                        (walletData?.balance || 0) < activeBatch.estimatedCost ||
                        activeBatch.validRows === 0
                      }
                      className="bg-[#10AFA5] hover:bg-[#0D9488] disabled:bg-gray-200 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-md shadow-teal-500/10 flex items-center gap-2 transition-colors cursor-pointer ml-auto"
                    >
                      {confirmMutation.isPending ? 'Confirming Dispatch...' : 'Review & Confirm Upload →'}
                    </button>
                  </div>
                </div>

                {/* Errors Preview table */}
                {activeBatch.invalidRows > 0 && (
                  <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                      <h3 className="text-sm font-bold text-gray-800">Errors Preview (First 10 rows)</h3>
                      <span className="text-xs font-bold text-red-500">Total Errors: {activeBatch.invalidRows}</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-semibold">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-50 pb-2">
                            <th className="py-2.5 pl-2">Row No.</th>
                            <th>Customer Name</th>
                            <th>Phone</th>
                            <th>Address</th>
                            <th>Service</th>
                            <th>City</th>
                            <th>Pincode</th>
                            <th className="text-red-500 text-right pr-2">Error(s)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-gray-500">
                          {errorsData && errorsData.length > 0 ? (
                            errorsData.map((err) => (
                              <tr key={err._id} className="hover:bg-red-50/10 transition-colors">
                                <td className="py-3 pl-2 font-mono text-gray-400">{err.rowNumber}</td>
                                <td className="font-bold text-gray-800">{err.rowData.customerName || 'N/A'}</td>
                                <td>{err.rowData.phone || 'N/A'}</td>
                                <td className="max-w-[150px] truncate">{err.rowData.address || 'N/A'}</td>
                                <td>{err.rowData.service || 'N/A'}</td>
                                <td>{err.rowData.city || 'N/A'}</td>
                                <td>{err.rowData.pincode || 'N/A'}</td>
                                <td className="text-right text-red-500 font-extrabold pr-2 max-w-[200px] truncate">
                                  {(err.errorList || err.errors || []).join(', ')}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={8} className="text-center py-6 text-gray-400 font-bold">
                                Loading preview rows...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-2 text-center">
                      <Link 
                        to={`/b2b/bulk-jobs/errors/${activeBatch._id}`}
                        className="text-xs font-extrabold text-[#10AFA5] hover:underline"
                      >
                        View All Errors
                      </Link>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 4: Processing Jobs creation */}
            {currentStep === 4 && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl border border-[#E6F4F2] p-8 shadow-sm text-center space-y-6"
              >
                <div className="max-w-md mx-auto space-y-6 py-6">
                  <div className="h-16 w-16 bg-[#F0FDFA] rounded-3xl flex items-center justify-center text-[#10AFA5] mx-auto animate-pulse">
                    <FiClock className="w-8 h-8 animate-spin" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-base font-bold text-gray-800">Dispatching Service Jobs</h3>
                    <p className="text-xs text-gray-400 font-semibold">
                      Writing relational job objects to MongoDB and invoking auto-allocation wave matching queues for nearby engineers.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-gray-500">Job Insertion Progress</span>
                      <span className="text-[#10AFA5]">{creationProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-[#10AFA5] h-full rounded-full transition-all duration-300"
                        style={{ width: `${creationProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 5: Completed */}
            {currentStep === 5 && (
              <motion.div 
                key="completed"
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl border border-[#E6F4F2] p-8 shadow-sm text-center space-y-6 animate-scale-up"
              >
                <div className="max-w-md mx-auto space-y-6 py-6">
                  <div className="h-16 w-16 bg-[#E6F4F2] rounded-3xl flex items-center justify-center text-[#10AFA5] mx-auto shadow-inner shadow-teal-500/10">
                    <FiCheckCircle className="w-10 h-10" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-gray-800">Jobs successfully dispatched!</h3>
                    <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                      We have processed the batch file `{activeBatch?.fileName}`. A total of <strong className="text-gray-800 font-bold">{activeBatch?.validRows}</strong> service jobs have been created and matching events sent to technical engineers.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                    <Link 
                      to="/b2b/jobs"
                      className="bg-[#10AFA5] hover:bg-[#0D9488] text-white text-xs font-bold h-11 px-6 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-teal-500/10 transition-colors"
                    >
                      <FiList className="w-4 h-4" /> View Created Jobs
                    </Link>
                    <button 
                      onClick={handleClearWizard}
                      className="bg-white border border-[#E6F4F2] hover:border-[#10AFA5] text-gray-700 text-xs font-bold h-11 px-6 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                    >
                      Upload Another File
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Informational Sidebar panels */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* File Requirements Box */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-2">
              <FiFileText className="text-[#10AFA5] w-4.5 h-4.5" /> File Requirements
            </h3>
            <ul className="text-xs font-semibold text-gray-500 space-y-2.5">
              <li className="flex items-start gap-2">
                <FiCheck className="text-teal-500 w-4 h-4 shrink-0 mt-0.5" />
                <span>No row limit — supports large enterprise batches of any size.</span>
              </li>
              <li className="flex items-start gap-2">
                <FiCheck className="text-teal-500 w-4 h-4 shrink-0 mt-0.5" />
                <span>Required columns: Customer, Phone, Address, Service, City, Pincode.</span>
              </li>
              <li className="flex items-start gap-2">
                <FiCheck className="text-teal-500 w-4 h-4 shrink-0 mt-0.5" />
                <span>Phone numbers must be valid 10-digit mobiles.</span>
              </li>
              <li className="flex items-start gap-2">
                <FiCheck className="text-teal-500 w-4 h-4 shrink-0 mt-0.5" />
                <span>Duplicate rows will be flagged and excluded.</span>
              </li>
              <li className="flex items-start gap-2">
                <FiCheck className="text-teal-500 w-4 h-4 shrink-0 mt-0.5" />
                <span>Always use the latest downloaded sample format.</span>
              </li>
            </ul>
          </div>

          {/* How it works Wizard Side Cards */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">How Bulk Upload Works</h3>
            <div className="space-y-4 text-xs font-semibold">
              {[
                { s: '1', t: 'Upload Excel File', d: 'Structure your job sheet and upload it.' },
                { s: '2', t: 'System Validation', d: 'We validate all rows, verify coordinates, and check for errors.' },
                { s: '3', t: 'Review & Confirm', d: 'Check error reports, handle duplicates, and authorize dispatch.' },
                { s: '4', t: 'Jobs Created', d: 'Bulk write inserts jobs in database and deducts wallet.' }
              ].map((step, idx) => (
                <div key={idx} className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-[#F0FDFA] text-[#10AFA5] font-extrabold flex items-center justify-center shrink-0">
                    {step.s}
                  </span>
                  <div>
                    <span className="block font-bold text-gray-800">{step.t}</span>
                    <span className="block text-[10px] text-gray-400 mt-0.5 font-medium">{step.d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Wallet check box */}
          <div className="bg-gradient-to-br from-[#10AFA5] to-[#0D9488] rounded-3xl p-6 text-white space-y-4 shadow-lg shadow-teal-500/10 relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 h-20 w-20 bg-white/5 rounded-full" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-100">Financial safety</span>
            <div className="space-y-1">
              <span className="block text-[10px] text-teal-100">Available Wallet Balance</span>
              <span className="text-2xl font-extrabold tracking-tight">
                ₹{walletData ? walletData.balance.toLocaleString('en-IN') : '0.00'}
              </span>
            </div>
            <p className="text-[10px] font-medium text-teal-100/90 leading-relaxed">
              Your corporate wallet balance will be verified before jobs creation. Please top up to avoid validation dispatch holds.
            </p>
            <Link 
              to="/b2b/wallet"
              className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-white/15"
            >
              <FiPlusCircle className="w-4 h-4" /> Top Up Corporate Wallet
            </Link>
          </div>

        </div>
      </div>

      {/* Upload History List (Shows latest 5 uploads) */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">Recent Upload History</h3>
            <Link 
              to="/b2b/bulk-jobs/history"
              className="text-xs font-bold text-[#10AFA5] hover:underline flex items-center gap-1"
            >
              View All <FiArrowRight />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-semibold">
              <thead>
                <tr className="text-gray-400 border-b border-gray-50 pb-2">
                  <th className="py-2.5">Spreadsheet Filename</th>
                  <th>Upload Date</th>
                  <th>Total Rows</th>
                  <th>Valid Rows</th>
                  <th>Failed Rows</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-600">
                {historyData && historyData.length > 0 ? (
                  historyData.map((batch) => (
                    <tr key={batch._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 font-bold text-gray-800 max-w-[200px] truncate">{batch.fileName}</td>
                      <td>{new Date(batch.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td>{batch.totalRows}</td>
                      <td className="text-green-600">{batch.validRows}</td>
                      <td className={batch.invalidRows > 0 ? 'text-red-500' : ''}>{batch.invalidRows}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          batch.status === 'completed' ? 'bg-green-50 text-green-600' :
                          batch.status === 'failed' ? 'bg-red-50 text-red-500' :
                          batch.status === 'validated' ? 'bg-blue-50 text-blue-600' :
                          batch.status === 'processing' ? 'bg-yellow-50 text-yellow-600 animate-pulse' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {batch.status}
                        </span>
                      </td>
                      <td>
                        {batch.status === 'validated' ? (
                          <button 
                            onClick={() => {
                              setActiveBatchId(batch._id);
                              localStorage.setItem('activeB2BBatchId', batch._id);
                              refetchActiveBatch();
                            }}
                            className="text-[#10AFA5] hover:underline font-bold cursor-pointer bg-transparent border-0 p-0"
                          >
                            Review & Confirm
                          </button>
                        ) : batch.status === 'failed' ? (
                          <span className="text-gray-400">Failed</span>
                        ) : (
                          <Link 
                            to={`/b2b/bulk-jobs/${batch._id}`}
                            className="text-gray-400 hover:text-gray-800"
                          >
                            Inspect
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400 font-bold">
                      No spreadsheets uploaded recently. Drag and drop a file above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default BulkJobs;
