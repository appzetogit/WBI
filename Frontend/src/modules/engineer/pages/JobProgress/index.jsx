import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiUpload, FiX, FiCheckCircle, FiPlus, FiDollarSign, FiClock, FiFileText, FiCamera } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import engineerService from '../../../../services/engineerService';
import { SkeletonCard } from '../../../../components/common/SkeletonLoaders';
import { compressImageToBase64 } from '../../../../utils/imageCompression';
import { getUserFacingError } from '../../../../utils/userFacingError';

const JobProgress = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const signatureRef = useRef(null);

  const [job, setJob] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Work Updates (Photos/Videos)
  const [mediaFiles, setMediaFiles] = useState([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Structured Notes
  const [notes, setNotes] = useState({
    issueFound: '',
    resolutionDetails: '',
    additionalRemarks: ''
  });

  // Materials
  const [materials, setMaterials] = useState([]);
  const [newMaterial, setNewMaterial] = useState({ name: '', quantity: 1, cost: '' });

  // Expenses
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ expenseType: 'Travel', amount: '', description: '' });

  // Signature
  const [signatureData, setSignatureData] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    fetchProgressData();
  }, [id]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);
      const res = await engineerService.getJobProgress(id);
      if (res.success) {
        setJob(res.data.job);
        setTimeline(res.data.timeline);
        if (res.data.job.structuredNotes) {
          setNotes(res.data.job.structuredNotes);
        }
        setMaterials(res.data.job.materials || []);
        setExpenses(res.data.job.expenses || []);
      }
    } catch (err) {
      toast.error('Failed to load job progress');
    } finally {
      setLoading(false);
    }
  };

  const handleMediaUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploadingMedia(true);
    try {
      const base64Files = await Promise.all(
        files.map((f) =>
          f.type.startsWith('image/')
            ? compressImageToBase64(f)
            : new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(f);
              })
        )
      );
      await engineerService.uploadJobMedia(id, { workPhotos: base64Files });
      setMediaFiles(prev => [...prev, ...base64Files]);
      toast.success('Photos uploaded');
    } catch (err) {
      toast.error(getUserFacingError(err, 'Upload failed. Please try again.'));
    } finally {
      setIsUploadingMedia(false);
      if (e.target) e.target.value = '';
    }
  };

  const removeMedia = (index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    // In a real app, you'd also want an API call to delete from backend
  };

  // Save Notes Loading State
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const buildNotesPayload = () => {
    const issueFound = (notes.issueFound || '').trim();
    const resolutionDetails = (notes.resolutionDetails || '').trim();
    const additionalRemarks = (notes.additionalRemarks || '').trim();
    const notesText = [issueFound, resolutionDetails, additionalRemarks]
      .filter(Boolean)
      .join('\n');
    return {
      notes: notesText || (issueFound || resolutionDetails ? 'Work notes updated' : ''),
      structuredNotes: {
        issueFound,
        resolutionDetails,
        additionalRemarks
      }
    };
  };

  const handleSaveNotes = async () => {
    const payload = buildNotesPayload();
    if (!payload.notes && !notes.issueFound?.trim() && !notes.resolutionDetails?.trim()) {
      toast.error('Please enter issue or resolution notes');
      return;
    }
    try {
      setIsSavingNotes(true);
      await engineerService.addJobNotes(id, payload);
      toast.success('Notes saved successfully');
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
      setJob(prev => prev ? ({
        ...prev,
        workerNotes: payload.notes,
        structuredNotes: payload.structuredNotes
      }) : prev);
    } catch (e) {
      toast.error(getUserFacingError(e, 'Failed to save notes'));
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAddMaterial = async () => {
    if (!newMaterial.name || !newMaterial.cost) return;
    try {
      await engineerService.addJobMaterials(id, [newMaterial]);
      setMaterials(prev => [...prev, { ...newMaterial, status: 'pending' }]);
      setNewMaterial({ name: '', quantity: 1, cost: '' });
      toast.success('Material added');
    } catch (e) {
      toast.error('Failed to add material');
    }
  };

  const handleAddExpense = async () => {
    if (!newExpense.amount || !newExpense.description) return;
    try {
      await engineerService.addJobExpenses(id, [newExpense]);
      setExpenses(prev => [...prev, { ...newExpense, status: 'pending' }]);
      setNewExpense({ expenseType: 'Travel', amount: '', description: '' });
      toast.success('Expense added');
    } catch (e) {
      toast.error('Failed to add expense');
    }
  };

  // Canvas Drawing for Signature
  const getCoords = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoords(e, canvas);
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoords(e, canvas);
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (signatureRef.current) {
      setSignatureData(signatureRef.current.toDataURL());
    }
  };

  const clearSignature = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const canvas = signatureRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const handleCompleteJob = async () => {
    // Validation
    const allPhotos = [...(job?.workPhotos || []), ...mediaFiles];
    if (allPhotos.length === 0) {
      return toast.error('Progress images are required to complete the job.');
    }
    if (!notes.issueFound && !notes.resolutionDetails) {
      return toast.error('Work notes (Issue or Resolution) are required.');
    }
    if (!signatureData) {
      return toast.error('Customer signature is required.');
    }

    try {
      setSubmitting(true);
      
      // Auto-save notes just in case
      await engineerService.addJobNotes(id, buildNotesPayload());

      await engineerService.completeJob(id, { 
        workPhotos: allPhotos,
        customerSignature: signatureData 
      });
      
      toast.success('Job Completed Successfully!');
      navigate(`/engineer/job/${id}/success`);
    } catch (e) {
      toast.error(getUserFacingError(e, 'Failed to complete job. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FCFC] p-4">
        <SkeletonCard className="h-16 mb-6" />
        <SkeletonCard className="h-40 mb-6" />
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  if (!job) return <div className="p-8 text-center text-gray-500">Job Not Found</div>;

  // Timeline UI Data
  const stages = ['Assigned', 'Accepted', 'In Progress', 'Completed'];
  const currentStageIndex = stages.findIndex(s => {
    if (job.status === 'completed' || job.status === 'work_done') return s === 'Completed';
    if (job.status === 'in_progress' || job.status === 'visited') return s === 'In Progress';
    if (job.status === 'assigned' || job.status === 'confirmed') return s === 'Accepted';
    return s === 'Assigned';
  });

  return (
    <div className="min-h-screen bg-[#F8FCFC] text-[#0F172A] ">
      {/* Header */}
      <header className="bg-white px-4 py-4 sticky top-0 z-50 shadow-sm flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-700 active:scale-95">
          <FiArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Job Progress</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-8 pb-48">
        
        {/* Progress Timeline UI */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50 overflow-hidden">
          <div className="flex items-center justify-between relative px-2">
            <div className="absolute left-6 right-6 top-4 h-0.5 bg-gray-200 z-0"></div>
            <div 
              className="absolute left-6 top-4 h-0.5 bg-[#10AFA5] z-0 transition-all duration-500" 
              style={{ width: `${(Math.max(currentStageIndex, 0) / (stages.length - 1)) * 100}%`, right: '1.5rem' }}
            ></div>
            
            {stages.map((stage, idx) => {
              const isCompleted = idx <= currentStageIndex;
              return (
                <div key={stage} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${isCompleted ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'bg-white border-gray-300 text-gray-300'}`}>
                    {isCompleted ? <FiCheckCircle className="w-5 h-5" /> : <div className="w-3 h-3 rounded-full bg-gray-200"></div>}
                  </div>
                  <span className={`text-[10px] font-bold ${isCompleted ? 'text-[#10AFA5]' : 'text-gray-400'}`}>{stage}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Job Status Section */}
        <section className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold">Job Status</h2>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 uppercase">
              {job.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-gray-50">
            <span className="text-gray-500">Work Start Time</span>
            <span className="font-semibold">{job.startedAt ? new Date(job.startedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Not Started'}</span>
          </div>
          <div className="flex justify-between text-sm py-2">
            <span className="text-gray-500">Service Amount</span>
            <span className="font-bold text-[#10AFA5]">₹{job.finalAmount || 0}</span>
          </div>
        </section>

        {/* Work Updates Section */}
        <section>
          <h2 className="font-bold text-lg mb-3">Work Updates</h2>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50">
            <label className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-[#10AFA5]/30 bg-[#10AFA5]/5 text-[#10AFA5] cursor-pointer hover:bg-[#10AFA5]/10 transition-all mb-4">
              <FiUpload className="w-8 h-8 mb-2" />
              <span className="text-sm font-bold">Add Photos / Videos</span>
              <span className="text-xs text-gray-500 mt-1">Upload work progress</span>
              <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleMediaUpload} disabled={isUploadingMedia} />
            </label>

            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {job.workPhotos?.map((img, i) => (
                <div key={`existing-${i}`} className="relative shrink-0">
                  <img fetchPriority="low" loading="lazy" src={img} alt="progress" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                </div>
              ))}
              {mediaFiles.map((img, i) => (
                <div key={`new-${i}`} className="relative shrink-0">
                  <img fetchPriority="low" loading="lazy" src={img} alt="progress" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                  <button onClick={() => removeMedia(i)} className="absolute -top-2 -right-2 bg-white rounded-full text-red-500 shadow-md p-1">
                    <FiX className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Work Notes Section */}
        <section>
          <h2 className="font-bold text-lg mb-3">Notes</h2>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Issue Found</label>
              <textarea 
                value={notes.issueFound || ''}
                onChange={(e) => setNotes({...notes, issueFound: e.target.value})}
                placeholder="e.g. AC gas leakage found"
                className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-[#10AFA5]"
                rows="2"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Resolution Details</label>
              <textarea 
                value={notes.resolutionDetails || ''}
                onChange={(e) => setNotes({...notes, resolutionDetails: e.target.value})}
                placeholder="e.g. Gas refilled and cooling restored"
                className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-[#10AFA5]"
                rows="2"
              />
            </div>
            <button 
              type="button"
              onClick={handleSaveNotes} 
              disabled={isSavingNotes}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-[#10AFA5] hover:bg-[#0E9F96] active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSavingNotes ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving Notes...</span>
                </>
              ) : notesSaved ? (
                <>
                  <FiCheckCircle className="w-4 h-4 text-white" />
                  <span>Notes Saved!</span>
                </>
              ) : (
                <span>Save Notes</span>
              )}
            </button>
          </div>
        </section>

        {/* Material Usage Section */}
        <section>
          <h2 className="font-bold text-lg mb-3">Material Usage</h2>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50">
            {materials.map((m, i) => (
              <div key={i} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-bold text-sm text-gray-800">{m.name} <span className="text-gray-400 font-normal">x{m.quantity}</span></p>
                </div>
                <span className="font-bold text-gray-800">₹{m.cost}</span>
              </div>
            ))}
            
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 mt-4 pt-4 border-t border-gray-100">
              <input type="text" placeholder="Item" value={newMaterial.name} onChange={(e) => setNewMaterial({...newMaterial, name: e.target.value})} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-0" />
              <input type="number" placeholder="Qty" value={newMaterial.quantity} onChange={(e) => setNewMaterial({...newMaterial, quantity: Number(e.target.value)})} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-0" />
              <input type="number" placeholder="₹" value={newMaterial.cost} onChange={(e) => setNewMaterial({...newMaterial, cost: Number(e.target.value)})} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-0" />
              <button onClick={handleAddMaterial} className="bg-[#10AFA5] text-white p-3 rounded-xl active:scale-95 flex items-center justify-center">
                <FiPlus />
              </button>
            </div>
          </div>
        </section>

        {/* Expense Tracking Section */}
        <section>
          <h2 className="font-bold text-lg mb-3">Expense Tracking</h2>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50">
            {expenses.map((e, i) => (
              <div key={i} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-bold text-sm text-gray-800">{e.expenseType}</p>
                  <p className="text-xs text-gray-500">{e.description}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-gray-800 block">₹{e.amount}</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${e.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{e.status}</span>
                </div>
              </div>
            ))}

            <div className="space-y-3 mt-4 pt-4 border-t border-gray-100">
              <select value={newExpense.expenseType} onChange={(e) => setNewExpense({...newExpense, expenseType: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#10AFA5]">
                <option value="Travel">Travel Expense</option>
                <option value="Material">Material Expense</option>
                <option value="Additional">Additional Expense</option>
              </select>
              <div className="flex gap-2">
                <input type="number" placeholder="₹ Amount" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})} className="w-1/3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#10AFA5]" />
                <input type="text" placeholder="Description" value={newExpense.description} onChange={(e) => setNewExpense({...newExpense, description: e.target.value})} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#10AFA5]" />
              </div>
              <button onClick={handleAddExpense} className="w-full py-3 rounded-xl font-bold text-[#10AFA5] bg-[#10AFA5]/10 active:scale-95 transition-all text-sm">
                Submit Expense
              </button>
            </div>
          </div>
        </section>

        {/* Customer Signature Section */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-lg">Customer Signature</h2>
            {signatureData && (
              <button 
                type="button" 
                onClick={clearSignature} 
                className="text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                Clear / Re-sign
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-50">
            <p className="text-xs text-gray-500 mb-3">Please ask the customer to sign inside the box below.</p>
            <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 overflow-hidden relative touch-none select-none">
              <canvas
                ref={signatureRef}
                width={500}
                height={200}
                style={{ touchAction: 'none' }}
                className="w-full h-44 cursor-crosshair block"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!signatureData && !isDrawing && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-300 text-xs font-semibold select-none">
                  ✍️ Customer signs here
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* Complete Job Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.04)] z-40">
        <div className="max-w-lg mx-auto">
          <button 
            type="button"
            onClick={handleCompleteJob}
            disabled={submitting}
            className="w-full py-4 rounded-xl font-bold text-white bg-[#10AFA5] hover:bg-[#0E9F96] shadow-lg shadow-[#10AFA5]/30 active:scale-[0.98] transition-all text-base flex items-center justify-center gap-2 disabled:opacity-70 disabled:scale-100 cursor-pointer"
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Completing Job...</span>
              </>
            ) : (
              <span>Complete Job</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobProgress;
