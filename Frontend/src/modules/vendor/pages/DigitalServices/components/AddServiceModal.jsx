import React, { useState } from 'react';
import { FiX, FiCheck, FiChevronRight, FiBriefcase, FiLayers } from 'react-icons/fi';
import vendorOfferingService from '../../../services/vendorOfferingService';
import toast from 'react-hot-toast';

export default function AddServiceModal({ isOpen, onClose, categoriesConfig, vendorModels, onSuccess }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    executionModel: '',
    categoryId: '',
    subCategoryId: '',
    title: '',
    shortDescription: '',
    basePrice: '',
    deliveryTime: ''
  });

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 1 && !formData.executionModel) {
      return toast.error("Please select an execution model");
    }
    if (step === 2 && !formData.categoryId) {
      return toast.error("Please select a category");
    }
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.shortDescription) {
      return toast.error("Title and Short Description are required");
    }

    setLoading(true);
    try {
      const payload = {
        executionModel: formData.executionModel,
        categoryId: formData.categoryId,
        title: formData.title,
        shortDescription: formData.shortDescription,
        pricing: { basePrice: Number(formData.basePrice) },
        capacity: { deliveryTime: formData.deliveryTime }
      };

      const res = await vendorOfferingService.createServiceOffering(payload);
      if (res.success) {
        toast.success("Service draft created successfully!");
        onSuccess();
        onClose();
        setStep(1);
        setFormData({ executionModel: '', categoryId: '', subCategoryId: '', title: '', shortDescription: '', basePrice: '', deliveryTime: '' });
      } else {
        toast.error(res.message || "Failed to create service");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in-up">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Add New Service</h2>
            <p className="text-xs text-slate-500 mt-1">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <FiX className="text-xl" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* Step 1: Execution Model */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="font-bold text-slate-700 text-lg mb-4">Choose Execution Model</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {vendorModels.includes('ONE_TIME') && (
                  <div 
                    onClick={() => setFormData({...formData, executionModel: 'ONE_TIME'})}
                    className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${formData.executionModel === 'ONE_TIME' ? 'border-[#00a78e] bg-[#00a78e]/5' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                      <FiLayers className="text-xl" />
                    </div>
                    <h4 className="font-bold text-slate-800">One-Time Service</h4>
                    <p className="text-xs text-slate-500 mt-2">Fixed scope tasks like website setup, bug fixes, or design mockups.</p>
                  </div>
                )}

                {vendorModels.includes('PROJECT') && (
                  <div 
                    onClick={() => setFormData({...formData, executionModel: 'PROJECT'})}
                    className={`p-5 rounded-xl border-2 cursor-pointer transition-all ${formData.executionModel === 'PROJECT' ? 'border-[#00a78e] bg-[#00a78e]/5' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
                      <FiBriefcase className="text-xl" />
                    </div>
                    <h4 className="font-bold text-slate-800">Project-Based Service</h4>
                    <p className="text-xs text-slate-500 mt-2">Long-term projects like full app development or CRM building.</p>
                  </div>
                )}
                
                {vendorModels.length === 0 && (
                  <div className="col-span-2 p-6 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-sm">
                    You currently have no approved service execution models. Please contact support.
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Step 2: Category */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="font-bold text-slate-700 text-lg mb-4">Select Service Category</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {categoriesConfig.map(cat => (
                  <div 
                    key={cat._id}
                    onClick={() => setFormData({...formData, categoryId: cat._id})}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center text-center ${formData.categoryId === cat._id ? 'border-[#00a78e] bg-[#00a78e]/5 text-[#00a78e]' : 'border-slate-200 hover:border-slate-300 text-slate-700'}`}
                  >
                    <span className="text-sm font-semibold">{cat.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Fields */}
          {step === 3 && (
            <div className="space-y-5">
              <h3 className="font-bold text-slate-700 text-lg mb-4">Service Details</h3>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Service Title <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a78e]/50" 
                  placeholder="e.g. Custom E-commerce Website Development"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Short Description <span className="text-red-500">*</span></label>
                <textarea 
                  value={formData.shortDescription}
                  onChange={e => setFormData({...formData, shortDescription: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a78e]/50 min-h-[80px]" 
                  placeholder="Briefly describe what you will deliver..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Starting Price (₹)</label>
                  <input 
                    type="number" 
                    value={formData.basePrice}
                    onChange={e => setFormData({...formData, basePrice: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a78e]/50" 
                    placeholder="15000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Delivery Time (Days)</label>
                  <input 
                    type="text" 
                    value={formData.deliveryTime}
                    onChange={e => setFormData({...formData, deliveryTime: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a78e]/50" 
                    placeholder="e.g. 10 - 15"
                  />
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-between bg-slate-50">
          {step > 1 ? (
            <button 
              onClick={handleBack}
              className="px-6 py-2.5 font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Back
            </button>
          ) : <div></div>}

          {step < 3 ? (
            <button 
              onClick={handleNext}
              className="px-6 py-2.5 bg-[#00a78e] text-white font-semibold rounded-lg flex items-center hover:bg-[#008f79] transition-colors"
            >
              Continue <FiChevronRight className="ml-1" />
            </button>
          ) : (
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 bg-[#00a78e] text-white font-semibold rounded-lg flex items-center hover:bg-[#008f79] transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save as Draft'} <FiCheck className="ml-1" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
