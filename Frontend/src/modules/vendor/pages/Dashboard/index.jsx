import React, { useState, useEffect, memo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiBriefcase, FiShield, FiClock, FiMapPin, FiDollarSign, 
  FiCheckCircle, FiXCircle, FiCamera, FiPhone, FiUploadCloud
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { themeColors } from '../../../../theme';
import api from '../../../../services/api';
import LogoLoader from '../../../../components/common/LogoLoader';

const Dashboard = memo(() => {
  const navigate = useNavigate();
  const brandColor = themeColors.brand?.teal || '#0D8A72';

  const [loading, setLoading] = useState(true);
  const [vendorData, setVendorData] = useState(null);
  
  // Dashboard state
  const [dashboardMode, setDashboardMode] = useState('A');
  const [isOnline, setIsOnline] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [biometricScanRunning, setBiometricScanRunning] = useState(false);
  const [videoStream, setVideoStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Stats & Bookings
  const [stats, setStats] = useState({ counts: {}, rating: 0, recent: [] });
  const [wallet, setWallet] = useState({ dues: 0, earnings: 0, pendingSettlements: 0 });
  const [pendingDispatches, setPendingDispatches] = useState([]);
  
  // Form / Action states
  const [alarmAcceptedId, setAlarmAcceptedId] = useState(null);
  const [arrivalOtp, setArrivalOtp] = useState('');
  const [completionOtp, setCompletionOtp] = useState('');
  const [showCancellationSurvey, setShowCancellationSurvey] = useState(null);
  const [cashoutProcessing, setCashoutProcessing] = useState(false);
  
  useEffect(() => {
    const dataStr = localStorage.getItem('vendorData');
    if (dataStr) {
      try {
        const v = JSON.parse(dataStr);
        setVendorData(v);
        setIsOnline(v.profileStatus === 'active' || v.isOnline);
      } catch (e) {}
    }
    fetchDashboardData();
  }, []);

  // Polling for live dispatch radar
  useEffect(() => {
    let interval;
    if (isOnline) {
      interval = setInterval(() => {
        fetchDashboardData(false); // Silent fetch
      }, 10000); // 10s poll
    }
    return () => clearInterval(interval);
  }, [isOnline]);

  const fetchDashboardData = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [statsRes, walletRes] = await Promise.all([
        api.get('/vendors/dashboard/stats'),
        api.get('/vendors/wallet')
      ]);

      if (statsRes.data?.success) {
        const d = statsRes.data.data;
        setStats({
          counts: d.bookingCounts || {},
          rating: d.rating || 0,
          recent: d.recentBookings || []
        });
        
        // Filter out pending/requested bookings for the Dispatch Radar
        const dispatches = (d.recentBookings || []).filter(b => 
          b.status === 'requested' || b.status === 'searching' || b.status === 'pending'
        );
        setPendingDispatches(dispatches);
      }
      
      if (walletRes.data?.success) {
        const w = walletRes.data.data;
        setWallet({
          dues: w.dues || 0,
          earnings: w.earnings || 0,
          pendingSettlements: w.pendingSettlements || 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (showLoader) toast.error('Failed to load dashboard data');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error('Camera access denied or unavailable.');
      console.error(err);
    }
  };

  const stopCamera = useCallback(() => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  }, [videoStream]);

  const closeBiometricModal = () => {
    stopCamera();
    setShowBiometricModal(false);
  };

  const handleOnlineToggle = async () => {
    if (!isOnline) {
      setShowBiometricModal(true);
      setTimeout(() => startCamera(), 100);
    } else {
      try {
        await api.put('/vendors/profile', { isOnline: false });
        setIsOnline(false);
        const dataStr = localStorage.getItem('vendorData');
        if (dataStr) {
          const v = JSON.parse(dataStr);
          v.isOnline = false;
          localStorage.setItem('vendorData', JSON.stringify(v));
        }
      } catch (e) {
        toast.error('Failed to update status');
      }
    }
  };

  const captureAndVerify = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setBiometricScanRunning(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error('Failed to capture image');
        setBiometricScanRunning(false);
        return;
      }
      
      const formData = new FormData();
      formData.append('profileImage', blob, 'biometric-scan.jpg');
      
      try {
        const res = await api.post('/vendors/profile/biometric-scan', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data?.success) {
          setIsOnline(true);
          const dataStr = localStorage.getItem('vendorData');
          if (dataStr) {
            const v = JSON.parse(dataStr);
            v.isOnline = true;
            localStorage.setItem('vendorData', JSON.stringify(v));
          }
          toast.success(res.data.message || 'AI Biometric scan verified!');
          closeBiometricModal();
        }
      } catch (error) {
        console.error('Biometric verification failed:', error);
        toast.error(error.response?.data?.message || 'Verification failed. Try again.');
      } finally {
        setBiometricScanRunning(false);
      }
    }, 'image/jpeg', 0.8);
  };

  const acceptDispatch = async (id) => {
    try {
      await api.put(`/vendors/bookings/${id}/accept`);
      toast.success('Dispatch accepted! Head to customer location.');
      setAlarmAcceptedId(id);
      fetchDashboardData(false);
    } catch (error) {
      toast.error('Failed to accept dispatch.');
    }
  };

  const handleInstantCashout = async () => {
    if (wallet.earnings < 100) {
      toast.error('Minimum ₹100 required for instant cashout');
      return;
    }
    setCashoutProcessing(true);
    try {
      await api.post('/vendors/wallet/withdraw', { amount: wallet.earnings });
      toast.success('Withdrawal request initiated successfully.');
      fetchDashboardData(false);
    } catch (error) {
      toast.error('Failed to process cashout.');
    } finally {
      setCashoutProcessing(false);
    }
  };

  if (loading) return <LogoLoader />;

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-white to-[#F0FDF8] p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-[#0D8A72]/5 blur-2xl"></div>
        <div className="relative z-10">
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`}></span>
            </span>
            TaskY Partner Dashboard
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-1 pl-6">Manage dispatches, track digital compliance, and monitor earnings seamlessly.</p>
        </div>

        <div className="flex bg-gray-50 border border-gray-100 p-1 rounded-2xl w-full md:w-auto overflow-x-auto shrink-0 shadow-sm">
          <button onClick={() => setDashboardMode('A')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${dashboardMode === 'A' ? 'bg-[#0D8A72] text-white shadow-md' : 'text-gray-500 hover:text-gray-800 hover:bg-white'}`}>Mode A: Quick Services</button>
          <button onClick={() => setDashboardMode('B')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${dashboardMode === 'B' ? 'bg-[#0D8A72] text-white shadow-md' : 'text-gray-500 hover:text-gray-800 hover:bg-white'}`}>Mode B: Contracts Project</button>
          <button onClick={() => setDashboardMode('C')} className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${dashboardMode === 'C' ? 'bg-[#0D8A72] text-white shadow-md' : 'text-gray-500 hover:text-gray-800 hover:bg-white'}`}>Mode C: Asset Rentals</button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2-Column Main Workspace */}
        <div className="lg:col-span-2 space-y-6">

          {/* MODE A: QUICK SERVICES */}
          {dashboardMode === 'A' && (
            <div className="space-y-6">
              
              {/* Online Radar Toggle */}
              <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm flex justify-between items-center transition-all hover:shadow-md">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-gray-800">Go Online Radar availability</p>
                  <p className="text-xs text-gray-400">Activates real-time background location updates for dispatches.</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold tracking-wider ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isOnline} onChange={handleOnlineToggle} />
                    <div className="w-12 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#0D8A72]"></div>
                  </label>
                </div>
              </div>

              {/* Ping Radar Simulator */}
              {isOnline && pendingDispatches.length === 0 && (
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-green-400 rounded-3xl p-6 border border-gray-700 font-mono text-xs space-y-3 shadow-inner">
                  <p className="font-bold flex items-center gap-2 text-white">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping"></span> Live Background Radar Scanning...
                  </p>
                  <p className="text-gray-400">Awaiting dispatch requests in your radius. Polling server every 10s.</p>
                </div>
              )}

              {/* Active Dispatch Alarms (Job Cards) */}
              {isOnline && pendingDispatches.map(dispatch => (
                <div key={dispatch._id} className="bg-white rounded-3xl border border-red-100 shadow-xl p-6 space-y-4 relative overflow-hidden animate-fade-in transform hover:-translate-y-1 transition-all">
                  <div className="absolute top-0 right-0 bg-red-500 text-white font-bold text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-bl-xl shadow-sm">
                    New Dispatch Request
                  </div>
                  
                  <div className="space-y-3 pt-2">
                    <h3 className="text-base font-black text-gray-800">Job Card ID: {dispatch.bookingId || dispatch._id.slice(-6).toUpperCase()}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-gray-600">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg"><FiMapPin /></div>
                        {dispatch.address?.city || 'Location Hidden'}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg"><FiBriefcase /></div>
                        {dispatch.serviceCategory?.name || 'Quick Service'}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg"><FiClock /></div>
                        Est: 45 Mins
                      </div>
                      <div className="flex items-center gap-2 text-green-700 font-bold bg-green-50/50 p-1.5 rounded-lg border border-green-100">
                        <FiDollarSign className="text-green-700" /> 
                        Payout: ₹{dispatch.totalPrice || dispatch.price || 0} (Net)
                      </div>
                    </div>
                  </div>

                  {alarmAcceptedId !== dispatch._id ? (
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                      <button 
                        onClick={() => {
                          setShowCancellationSurvey(dispatch._id);
                          setPendingDispatches(prev => prev.filter(d => d._id !== dispatch._id));
                        }}
                        className="flex-1 py-3 border-2 border-red-100 text-red-500 font-bold rounded-xl text-xs hover:bg-red-50 transition-colors"
                      >
                        Decline Dispatch
                      </button>
                      <button 
                        onClick={() => acceptDispatch(dispatch._id)}
                        className="flex-1 py-3 bg-[#0D8A72] text-white font-bold rounded-xl text-xs hover:bg-[#0a6b58] transition-all shadow-md hover:shadow-lg transform active:scale-95"
                      >
                        Accept Dispatch
                      </button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 space-y-4 shadow-inner mt-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                        <span className="text-xs font-bold text-gray-700">Dialer Masking Proxy:</span>
                        <button onClick={() => toast.success('Dialing masked customer proxy: +91 98765 XXXXX')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 shadow-sm transition-colors">
                          <FiPhone className="w-4 h-4 text-[#0D8A72]" /> Call Masked
                        </button>
                      </div>
                      <div className="text-center text-xs font-bold text-blue-600 py-2">
                        Navigate to Booking Details tab to manage OTP and completion flow.
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Daily Earnings Ledger */}
              <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
                <h3 className="font-bold text-base text-gray-800">Daily Earnings Ledger (Today)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div className="bg-gradient-to-b from-gray-50 to-gray-100 p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Tasks Net Pay</span>
                    <span className="block text-xl font-black text-gray-800 mt-2">₹{(wallet.earnings || 0).toLocaleString()}</span>
                  </div>
                  <div className="bg-gradient-to-b from-green-50 to-green-100/50 p-5 rounded-2xl border border-green-200 shadow-sm">
                    <span className="block text-[10px] text-green-700 font-bold uppercase tracking-wider">Cash Tips</span>
                    <span className="block text-xl font-black text-green-800 mt-2">₹0</span>
                  </div>
                  <div className="bg-gradient-to-b from-red-50 to-red-100/50 p-5 rounded-2xl border border-red-200 shadow-sm">
                    <span className="block text-[10px] text-red-600 font-bold uppercase tracking-wider">TaskY Commission</span>
                    <span className="block text-xl font-black text-red-700 mt-2">₹{(wallet.dues || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODE B: CONTRACTS / EMPTY STATE */}
          {dashboardMode === 'B' && (
            <div className="bg-white rounded-3xl border border-gray-100 p-10 shadow-sm text-center space-y-4 animate-fade-in">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400">
                <FiBriefcase className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-gray-800">Contracts Project Dashboard</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">You currently don't have any active project contracts. Switch to Mode A to accept quick dispatch services.</p>
            </div>
          )}

          {/* MODE C: ASSET RENTALS */}
          {dashboardMode === 'C' && (
            <div className="bg-white rounded-3xl border border-gray-100 p-10 shadow-sm text-center space-y-4 animate-fade-in">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400">
                <FiUploadCloud className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-gray-800">Asset Rentals Mode</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">This module is locked for your current partner tier. Contact support to upgrade your vendor profile.</p>
            </div>
          )}
        </div>

        {/* 1-Column Right Sidebar */}
        <div className="space-y-6">

          {/* Secure Escrow Lock Info */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-sm text-gray-800">Financial Security Escrow</h3>
            <div className="p-5 bg-gradient-to-br from-teal-50 to-emerald-50/30 border border-teal-100/50 rounded-2xl space-y-3 text-xs leading-relaxed text-gray-600 shadow-inner">
              <p className="font-extrabold text-[#0D8A72] flex items-center gap-2 text-sm">
                <FiShield className="w-5 h-5"/> Upfront Payment Lock Active
              </p>
              <p>Clients pay 100% of cost upfront before task scheduling. Payments remain locked in a secure corporate escrow account, releasing instantly to partner wallets upon input of the Completion OTP.</p>
            </div>
          </div>

          {/* Partner Wallet Card */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-5 relative overflow-hidden group hover:shadow-lg transition-all">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <FiDollarSign className="w-24 h-24" />
            </div>
            
            <div className="flex justify-between items-center relative z-10">
              <h3 className="font-bold text-sm text-gray-800">In-App Partner Wallet</h3>
              <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center">
                <FiDollarSign className="text-[#0D8A72]" />
              </div>
            </div>

            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Available Balance</span>
              <h2 className="text-4xl font-black text-gray-800 tracking-tight">₹{(wallet.earnings || 0).toLocaleString()}</h2>
            </div>

            <div className="pt-4 space-y-3 relative z-10 border-t border-gray-100">
              <button
                onClick={handleInstantCashout}
                disabled={cashoutProcessing}
                className="w-full py-3.5 bg-[#0D8A72] text-white font-bold rounded-xl text-xs shadow-md hover:bg-[#0a6b58] hover:shadow-lg transition-all flex items-center justify-center gap-2 transform active:scale-95"
              >
                {cashoutProcessing ? 'Processing Transfer...' : 'Run Instant Cashout to Bank'}
              </button>
              <p className="text-[10px] text-gray-400 text-center leading-relaxed">Flexible Instant Mode applies a flat rate of ₹5 per IMPS request. Auto-Friday disbursals are free of cost.</p>
            </div>
          </div>

          {/* Compliance Profile */}
          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4 hover:shadow-md transition-shadow">
            <h3 className="font-bold text-sm text-gray-800">Partner Compliance Profile</h3>
            
            <div className="space-y-3 text-xs font-semibold">
              <div className="flex items-center justify-between p-3.5 bg-green-50 text-green-700 border border-green-200 rounded-xl">
                <span className="flex items-center gap-2"><FiCheckCircle className="w-4 h-4"/> Aadhaar Identity check</span>
                <span className="text-[10px] uppercase font-bold bg-white px-2 py-1 rounded-md shadow-sm">Verified</span>
              </div>
              <div className="flex items-center justify-between p-3.5 bg-green-50 text-green-700 border border-green-200 rounded-xl">
                <span className="flex items-center gap-2"><FiCheckCircle className="w-4 h-4"/> Vendor Status</span>
                <span className="text-[10px] uppercase font-bold bg-white px-2 py-1 rounded-md shadow-sm">{vendorData?.profileStatus || vendorData?.approvalStatus || 'Approved'}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* MODAL: BIOMETRIC SCAN */}
      {showBiometricModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 text-center space-y-5 shadow-2xl transform scale-100 transition-transform">
            {!biometricScanRunning && (
              <div className="w-48 h-48 mx-auto rounded-full overflow-hidden bg-gray-100 border-4 border-[#0D8A72] shadow-inner relative">
                {videoStream ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover transform scale-x-[-1]" 
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-[#0D8A72]">
                    <FiCamera className="w-8 h-8 animate-pulse" />
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Random Face Scan</h3>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">To ensure safety guidelines, perform a quick facial biometric scan before switching availability to Online.</p>
            </div>
            
            {biometricScanRunning ? (
              <div className="py-6 space-y-3">
                <div className="w-10 h-10 border-4 border-gray-100 border-t-[#0D8A72] rounded-full animate-spin mx-auto shadow-sm"></div>
                <p className="text-[10px] font-bold text-[#0D8A72] uppercase tracking-wider">Verifying Biometrics...</p>
              </div>
            ) : (
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button onClick={closeBiometricModal} className="flex-1 py-3 border-2 border-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={captureAndVerify} disabled={!videoStream} className={`flex-1 py-3 text-white font-bold rounded-xl text-xs shadow-md transition-all transform active:scale-95 ${videoStream ? 'bg-[#0D8A72] hover:bg-[#0a6b58]' : 'bg-gray-400 cursor-not-allowed'}`}>
                  Capture & Verify
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
});

Dashboard.displayName = 'VendorDashboard';
export default Dashboard;
