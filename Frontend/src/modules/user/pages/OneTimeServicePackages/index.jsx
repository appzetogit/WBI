import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiX, FiInfo, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

// Loading Shimmer Skeletons
const ShimmerRow = () => (
  <div className="bg-white p-4 rounded-2xl border border-gray-50 flex items-center gap-4 animate-pulse">
    <div className="w-5 h-5 rounded-lg bg-gray-100 shrink-0"></div>
    <div className="flex-1 space-y-2 min-w-0 pr-2">
      <div className="h-4 bg-gray-100 rounded-lg w-2/5"></div>
      <div className="h-3 bg-gray-100 rounded-lg w-4/5"></div>
    </div>
    <div className="w-12 h-4 bg-gray-100 rounded-lg shrink-0"></div>
  </div>
);

const PackagesSkeleton = () => (
  <div className="bg-[#F8FCFC] min-h-screen pb-56 px-5 pt-4 space-y-6 animate-pulse">
    <div className="h-10 w-full flex items-center gap-3">
      <div className="h-9 w-9 bg-gray-50 rounded-full border border-gray-100"></div>
      <div className="h-8 w-1/3 bg-gray-50 rounded-lg"></div>
    </div>
    <div className="space-y-2">
      <div className="h-5 bg-gray-50 rounded-lg w-2/5"></div>
      <div className="h-4 bg-gray-50 rounded-lg w-3/5"></div>
    </div>
    <div className="space-y-3">
      <ShimmerRow />
      <ShimmerRow />
      <ShimmerRow />
      <ShimmerRow />
    </div>
  </div>
);

const OneTimeServicePackages = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Params from Step 1
  const brandId = searchParams.get('brandId');
  const issueIds = searchParams.get('issueIds');
  const customIssueText = searchParams.get('customIssueText') || '';

  // API States
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState(null);
  const [brand, setBrand] = useState(null);
  const [subServices, setSubServices] = useState([]);
  
  // Interaction States
  const [checkedSubServices, setCheckedSubServices] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);

  useEffect(() => {
    fetchData();
  }, [slug, brandId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setApiFailed(false);

      // 1. Fetch service details
      const svcRes = await api.get(`/users/one-time-services/${slug}`);
      if (!svcRes.data.success) throw new Error('Service details not found');
      
      const srv = svcRes.data.data;
      setService(srv);
      
      // 2. Fetch Brand Details if brandId is present
      if (brandId && brandId !== 'other') {
        const brandsRes = await api.get(`/users/one-time-services/${srv._id}/brands`);
        if (brandsRes.data.success) {
          const selectedBr = brandsRes.data.data.find(b => b._id === brandId);
          if (selectedBr) setBrand(selectedBr);
        }
      } else if (brandId === 'other') {
        setBrand({ _id: 'other', brandName: 'Others', logo: null });
      }

      // 3. Fetch sub-services for this service + brand
      const brandParam = brandId ? `?brandId=${brandId}` : '';
      const subRes = await api.get(`/services/${srv._id}/sub-services${brandParam}`);
      if (subRes.data.success) {
        const fetchedSubServices = subRes.data.data;
        setSubServices(fetchedSubServices);

        // Pre-check items with isDefault: true
        const defaultCheckedIds = fetchedSubServices
          .filter(sub => sub.isDefault)
          .map(sub => sub.subServiceId);
        setCheckedSubServices(defaultCheckedIds);
      } else {
        throw new Error('Failed to load sub-services');
      }

    } catch (error) {
      console.error('Error fetching dynamic Step 2 details:', error);
      setApiFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (subServiceId) => {
    setCheckedSubServices(prev => {
      if (prev.includes(subServiceId)) {
        return prev.filter(id => id !== subServiceId);
      } else {
        return [...prev, subServiceId];
      }
    });
  };

  // Live total price & selected items count calculations
  const selectedItems = subServices.filter(sub => checkedSubServices.includes(sub.subServiceId));
  const totalPrice = selectedItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const itemCount = selectedItems.length;

  const handleContinue = async () => {
    if (subServices.length > 0 && checkedSubServices.length === 0) {
      toast.error('Please select at least one service to continue');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Local Quantities Map (default 1)
      const quantities = {};
      checkedSubServices.forEach(id => quantities[id] = 1);

      // Price Snapshot Object matching draft spec
      const priceSnapshot = {
        packageTotal: totalPrice,
        finalAmount: totalPrice, // Draft recalculates taxes in step 3/4
        itemCount: itemCount
      };

      const payload = {
        serviceId: service._id,
        brandId: brandId && brandId !== 'other' ? brandId : null,
        issueIds: issueIds ? issueIds.split(',') : [],
        packageIds: checkedSubServices, // Saved inside packageIds for checkout schema compatibility
        quantities,
        priceSnapshot,
        customIssueText
      };

      const res = await api.post('/users/one-time-bookings/draft', payload);
      
      if (res.data.success) {
        // Persist details locally in localStorage as a backup bookingContext reference
        localStorage.setItem('selectedSubServices', JSON.stringify({
          items: selectedItems.map(sub => ({ subServiceId: sub.subServiceId, name: sub.name, price: sub.price })),
          totalPrice,
          itemCount
        }));

        // Navigate to Step 3 (Address & Schedule page)
        navigate(`/user/one-time-checkout?draftId=${res.data.data._id}`);
      } else {
        toast.error(res.data.message || 'Failed to save draft details');
      }
    } catch (error) {
      console.error('Draft booking creation failure:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <PackagesSkeleton />;

  if (apiFailed || !service) {
    return (
      <div className="min-h-screen bg-white p-6 flex flex-col items-center justify-center text-center space-y-6">
        <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center text-red-500">
          <FiAlertTriangle size={32} />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-800">Connection Failed</h3>
          <p className="text-xs text-gray-400 font-bold mt-1">Couldn't load sub-services list. Tap below to retry.</p>
        </div>
        <button
          onClick={fetchData}
          className="px-6 py-3 bg-[#10AFA5] hover:bg-[#0E9D94] text-white font-bold text-xs rounded-2xl transition-all"
        >
          Retry Load
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F8FCFC] min-h-screen pb-56">
      {/* Header Bar */}
      <header className="px-4 py-4 flex items-center gap-3 sticky top-0 bg-[#F8FCFC]/90 backdrop-blur-md z-10 border-b border-gray-150/40">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs border border-gray-100 active:scale-95 transition-all"
        >
          <FiChevronLeft className="w-5 h-5 text-gray-800" />
        </button>

        {brand && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border border-gray-100 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
              {brand.logo ? (
                <img src={brand.logo} alt={brand.brandName} className="h-5 w-5 object-contain" />
              ) : (
                <div className="text-[10px] font-black text-gray-400">{brand.brandName.substring(0, 2)}</div>
              )}
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider leading-none">Selected Brand</span>
              <span className="text-xs font-black text-gray-850 leading-tight">{brand.brandName}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Form Area */}
      <div className="px-5 pt-4">
        <h2 className="text-[18px] font-black text-gray-850 tracking-tight mb-1">3. Add Services (Optional)</h2>
        <p className="text-[11px] text-gray-400 font-semibold mb-6">Add additional services if required</p>

        {/* Warning Banner when all options unchecked */}
        {checkedSubServices.length === 0 && (
          <div className="bg-amber-50 border border-amber-250/20 rounded-2xl p-4 mb-6 flex gap-3 items-center">
            <FiInfo className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="text-xs font-bold text-amber-600">Please select at least one service to continue</span>
          </div>
        )}

        {/* Dynamic Sub-Services List */}
        <div className="flex flex-col gap-3">
          {subServices.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 space-y-4">
              <p className="text-gray-400 text-xs font-bold">No additional services available for this brand</p>
              <button
                onClick={handleContinue}
                className="px-6 py-2.5 bg-[#10AFA5] text-white text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all"
              >
                Continue with Basic Service
              </button>
            </div>
          ) : (
            subServices.map(sub => {
              const isChecked = checkedSubServices.includes(sub.subServiceId);
              
              return (
                <div 
                  key={sub.subServiceId} 
                  onClick={() => handleToggle(sub.subServiceId)}
                  className={`bg-white p-4 rounded-2xl border flex items-center gap-4 cursor-pointer transition-all ${
                    isChecked ? 'border-[#10AFA5] bg-[#F0FDFA]/10 shadow-xs' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {/* Checkbox UI */}
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${
                    isChecked ? 'bg-[#10AFA5] border-[#10AFA5] text-white' : 'border-gray-200 bg-white'
                  }`}>
                    {isChecked && <FiCheck className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  
                  {/* Content Details */}
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-xs font-black text-gray-850 leading-tight">{sub.name}</h3>
                    <p className="text-[10px] text-gray-400 font-semibold leading-normal mt-0.5 line-clamp-2">
                      {sub.description || 'Standard sub-service inspection'}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-gray-900">₹{sub.price}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sticky Price Summary Footer */}
      {subServices.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-10px_40px_rgba(0,0,0,0.06)] rounded-t-3xl z-20 max-w-[480px] mx-auto p-5 pb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-gray-800 uppercase tracking-wide">Price Summary</h4>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">{itemCount} items selected</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-gray-900">₹{totalPrice}</p>
            </div>
          </div>
          
          <div className="flex justify-start">
            <button 
              onClick={() => setShowDetails(true)}
              className="text-xs font-bold text-[#10AFA5] hover:text-[#0E9B92] active:scale-95 transition-all"
            >
              View Details
            </button>
          </div>
          
          <button
            onClick={handleContinue}
            disabled={itemCount === 0 || isSubmitting}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 ${
              itemCount === 0 || isSubmitting
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-[#10AFA5] shadow-md shadow-[#10AFA5]/15 active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Continue</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* View Details Animated Modal Bottom Sheet */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs p-4 pb-8">
          <div className="bg-white w-full max-w-[440px] rounded-t-3xl p-6 shadow-2xl relative animate-slideUp">
            <button 
              onClick={() => setShowDetails(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <FiX className="w-4 h-4" />
            </button>
            
            <h3 className="text-sm font-black text-gray-800 mb-6">Payment Summary</h3>
            
            <div className="space-y-4 mb-6 max-h-[40vh] overflow-y-auto pr-1">
              {selectedItems.map(sub => (
                <div key={sub.subServiceId} className="flex justify-between text-xs font-bold text-gray-500">
                  <span>{sub.name}</span>
                  <span>₹{sub.price}</span>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between text-sm font-black border-t border-gray-100 pt-4 mb-6">
              <span className="text-gray-800">Subtotal</span>
              <span className="text-[#10AFA5]">₹{totalPrice}</span>
            </div>

            <button
              onClick={() => setShowDetails(false)}
              className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider bg-[#10AFA5] text-white shadow-md shadow-[#10AFA5]/15 active:scale-[0.98] transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OneTimeServicePackages;
