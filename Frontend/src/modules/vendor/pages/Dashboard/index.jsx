import React, { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FiBriefcase, FiShield, FiClipboard, FiCalendar, 
  FiArrowUpRight, FiArrowDownRight, FiNavigation, FiPhone, 
  FiCheckCircle, FiDollarSign, FiFileText, FiUploadCloud, 
  FiSettings, FiMapPin, FiFolder, FiAlertTriangle, FiCamera, 
  FiClock, FiXCircle, FiPlay, FiSmile, FiBookOpen, FiActivity
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { themeColors } from '../../../../theme';
import api from '../../../../services/api';

const Dashboard = memo(() => {
  const navigate = useNavigate();
  const brandColor = themeColors.brand?.teal || '#0D8A72';

  // Active Dashboard Mode: 'A' (Quick Services), 'B' (Contracts), 'C' (Rentals)
  const [dashboardMode, setDashboardMode] = useState('A');
  const [vendorData, setVendorData] = useState(null);

  // Mode A (Quick Service) States
  const [isOnline, setIsOnline] = useState(false);
  const [locationPings, setLocationPings] = useState([]);
  const [showActiveAlarm, setShowActiveAlarm] = useState(true);
  const [alarmAccepted, setAlarmAccepted] = useState(false);
  const [arrivalOtp, setArrivalOtp] = useState('');
  const [arrivalOtpVerified, setArrivalOtpVerified] = useState(false);
  const [completionOtp, setCompletionOtp] = useState('');
  const [completionOtpVerified, setCompletionOtpVerified] = useState(false);
  const [showCancellationSurvey, setShowCancellationSurvey] = useState(false);

  // Daily Ledger Mock Data
  const [earningsToday, setEarningsToday] = useState(1360);
  const [tipsToday, setTipsToday] = useState(150);
  const [commissionToday, setCommissionToday] = useState(240);

  // Mode B (Contracts) States
  const [milestones, setMilestones] = useState([
    { id: 1, name: 'Site Survey', status: 'completed' },
    { id: 2, name: 'Wiring & Cable Prep', status: 'completed' },
    { id: 3, name: 'Component Mounting', status: 'in_progress' },
    { id: 4, name: 'Programming & Logic', status: 'pending' },
    { id: 5, name: 'Final Testing & Signoff', status: 'pending' }
  ]);
  const [procurements, setProcurements] = useState([
    { item: '6-Port Smart Junction Box', qty: 2, cost: 1800, status: 'approved' },
    { item: 'Shielded CAT-6 Spool (50m)', qty: 1, cost: 1200, status: 'pending_approval' }
  ]);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialQty, setNewMaterialQty] = useState('');
  const [newMaterialCost, setNewMaterialCost] = useState('');
  
  // Mode C (Rentals) States
  const [assets, setAssets] = useState([
    { id: 'AST-902', name: 'Industrial Concrete Mixer', status: 'Available', deposit: 5000 },
    { id: 'AST-774', name: 'Hydraulic Scaffolding Ladder', status: 'Out on Rent', deposit: 8000 },
    { id: 'AST-551', name: 'High-Torque Rotary Hammer Drill', status: 'Maintenance', deposit: 2000 }
  ]);
  const [selectedAssetForClaim, setSelectedAssetForClaim] = useState(null);
  const [damageClaimAmount, setDamageClaimAmount] = useState('');
  const [damageDescription, setDamageDescription] = useState('');

  // General Wallet / Payout States
  const [walletBalance, setWalletBalance] = useState(4350);
  const [cashoutProcessing, setCashoutProcessing] = useState(false);
  
  // Anti-Renting biometric state
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [biometricScanRunning, setBiometricScanRunning] = useState(false);

  useEffect(() => {
    // Read vendor data to determine primary mode from categories/services if present
    const dataStr = localStorage.getItem('vendorData');
    if (dataStr) {
      try {
        const v = JSON.parse(dataStr);
        setVendorData(v);
        // Map to corresponding mode
        if (v.businessType === 'project_partner') {
          setDashboardMode('B');
        }
      } catch (_) {}
    }
  }, []);

  // Mode A: Radar simulator
  useEffect(() => {
    let interval = null;
    if (isOnline) {
      interval = setInterval(() => {
        const timestamp = new Date().toLocaleTimeString();
        setLocationPings(prev => [`Ping dispatched at ${timestamp} (Coordinates: 10.02${Math.floor(Math.random()*90)}, 76.32${Math.floor(Math.random()*90)})`, ...prev.slice(0, 4)]);
      }, 5000);
    } else {
      setLocationPings([]);
    }
    return () => clearInterval(interval);
  }, [isOnline]);

  const handleOnlineToggle = () => {
    if (!isOnline) {
      // Trigger anti-renting unannounced biometric face scan check before letting them go online
      setShowBiometricModal(true);
    } else {
      setIsOnline(false);
    }
  };

  const handleBiometricSuccess = () => {
    setBiometricScanRunning(true);
    setTimeout(() => {
      setBiometricScanRunning(false);
      setShowBiometricModal(false);
      setIsOnline(true);
      toast.success('AI Biometric scan matched owner profile! Online mode unlocked.');
    }, 2500);
  };

  const handleVerifyArrivalOtp = () => {
    if (arrivalOtp === '4321') {
      setArrivalOtpVerified(true);
      toast.success('Arrival OTP verified! Escrow holds activated, job started.');
    } else {
      toast.error('Invalid OTP! Enter 4321 for verification simulation.');
    }
  };

  const handleVerifyCompletionOtp = () => {
    if (completionOtp === '8821') {
      setCompletionOtpVerified(true);
      // Simulate Split Payment Engine (15% Commission, 85% Wallet)
      const grossJobPayout = 800;
      const partnerEarnings = grossJobPayout * 0.85; // 680
      const systemCommission = grossJobPayout * 0.15; // 120

      setWalletBalance(prev => prev + partnerEarnings);
      setEarningsToday(prev => prev + partnerEarnings);
      setCommissionToday(prev => prev + systemCommission);

      toast.success(`Job completed! ₹${partnerEarnings} (85%) credited to your wallet. WBI platform take-rate ₹${systemCommission} (15%) deducted.`);
    } else {
      toast.error('Invalid Completion OTP! Enter 8821 for validation.');
    }
  };

  const handleInstantCashout = () => {
    if (walletBalance < 100) {
      toast.error('Insufficient wallet balance for instant cashout');
      return;
    }
    setCashoutProcessing(true);
    setTimeout(() => {
      setWalletBalance(prev => prev - 500 - 5); // Cashout 500 + 5 processing fee
      setCashoutProcessing(false);
      toast.success('₹500.00 instantly transferred to your bank account via IMPS/UPI routing (₹5 processing fee applied).');
    }, 2000);
  };

  const handleAddProcurement = () => {
    if (!newMaterialName || !newMaterialCost) return;
    const costNum = parseFloat(newMaterialCost);
    const qtyNum = parseInt(newMaterialQty) || 1;
    const newRecord = {
      item: newMaterialName,
      qty: qtyNum,
      cost: costNum * qtyNum,
      status: 'pending_approval'
    };
    setProcurements(prev => [...prev, newRecord]);
    setNewMaterialName('');
    setNewMaterialQty('');
    setNewMaterialCost('');
    toast.success('Material receipt uploaded and appended to client invoice. Pending Admin review.');
  };

  const handleDamageClaim = () => {
    if (!damageClaimAmount) return;
    toast.success(`Security deposit claim of ₹${damageClaimAmount} submitted for verification with photographic damage proof.`);
    setSelectedAssetForClaim(null);
    setDamageClaimAmount('');
    setDamageDescription('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4">

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl shadow-sm border border-[#E6F4F2]">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
            TaskY Partner Dashboard
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage dispatches, track digital BGV KYC/Penny drop compliance, and monitor earnings.</p>
        </div>

        {/* Dynamic Mode Switcher */}
        <div className="flex bg-gray-50 border border-gray-100 p-1 rounded-2xl w-full md:w-auto overflow-x-auto shrink-0">
          <button 
            onClick={() => setDashboardMode('A')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${dashboardMode === 'A' ? 'bg-[#0D8A72] text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Mode A: Quick Services
          </button>
          <button 
            onClick={() => setDashboardMode('B')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${dashboardMode === 'B' ? 'bg-[#0D8A72] text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Mode B: Contracts Project
          </button>
          <button 
            onClick={() => setDashboardMode('C')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${dashboardMode === 'C' ? 'bg-[#0D8A72] text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Mode C: Asset Rentals
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 2-Column Main Workspace */}
        <div className="lg:col-span-2 space-y-6">

          {/* MODE A: BLUE-COLLAR / QUICK SERVICES */}
          {dashboardMode === 'A' && (
            <div className="space-y-6">
              
              {/* online status switch */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-gray-500">Go Online Radar availability</p>
                  <p className="text-[10px] text-gray-400">Activates real-time background location updates for dispatches.</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={isOnline}
                      onChange={handleOnlineToggle}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D8A72]"></div>
                  </label>
                </div>
              </div>

              {/* Ping Radar Simulator */}
              {isOnline && (
                <div className="bg-gray-900 text-green-400 rounded-3xl p-5 border border-gray-800 font-mono text-xs space-y-2 animate-fade-in">
                  <p className="font-bold flex items-center gap-1.5 text-white">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-ping"></span> Live Background Location Pings:
                  </p>
                  <div className="space-y-1 text-[10px]">
                    {locationPings.length > 0 ? locationPings.map((ping, idx) => (
                      <p key={idx}>{ping}</p>
                    )) : (
                      <p className="text-gray-500">Awaiting location lock... updates every 5 seconds</p>
                    )}
                  </div>
                </div>
              )}

              {/* Active Dispatch Alarm (Job Card) */}
              {showActiveAlarm && (
                <div className="bg-white rounded-3xl border border-red-100 shadow-lg p-6 space-y-4 relative overflow-hidden animate-pulse-slow">
                  <div className="absolute top-0 right-0 bg-red-500 text-white font-bold text-[9px] uppercase tracking-wider px-3 py-1 rounded-bl-xl">
                    New Dispatch Request
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-gray-800">Job Card ID: DISP-88372</h3>
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-gray-600 pt-2">
                      <div className="flex items-center gap-2">
                        <FiMapPin className="text-[#0D8A72]" /> Location: Infopark Phase-2 (1.8 km)
                      </div>
                      <div className="flex items-center gap-2">
                        <FiBriefcase className="text-[#0D8A72]" /> Category: Smart Lock Setup & Calibration
                      </div>
                      <div className="flex items-center gap-2">
                        <FiClock className="text-[#0D8A72]" /> Est Time: 45 Minutes
                      </div>
                      <div className="flex items-center gap-2 text-green-700 font-bold">
                        <FiDollarSign className="text-green-700" /> Payout: ₹680 (Net Earnings)
                      </div>
                    </div>
                  </div>

                  {!alarmAccepted ? (
                    <div className="flex gap-3 pt-2">
                      <button 
                        onClick={() => {
                          setShowActiveAlarm(false);
                          setShowCancellationSurvey(true);
                          toast.error('Dispatch request declined.');
                        }}
                        className="flex-1 py-3 border border-red-200 text-red-500 font-bold rounded-xl text-xs hover:bg-red-50 transition-colors"
                      >
                        Decline Dispatch
                      </button>
                      <button 
                        onClick={() => {
                          setAlarmAccepted(true);
                          toast.success('Dispatch accepted! Head to customer location.');
                        }}
                        className="flex-1 py-3 bg-[#0D8A72] text-white font-bold rounded-xl text-xs hover:bg-teal-700 transition-all shadow-md"
                      >
                        Accept Dispatch
                      </button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-4">
                      
                      {/* Dialer masking */}
                      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                        <span className="text-xs font-bold text-gray-700">Dialer Masking Proxy:</span>
                        <button 
                          onClick={() => toast.success('Dialing masked customer proxy: +91 98765 XXXXX')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-[#0D8A72]/20 text-[#0D8A72] rounded-xl text-xs font-bold hover:bg-teal-100 transition-colors"
                        >
                          <FiPhone className="w-3.5 h-3.5" /> Call Customer Masked
                        </button>
                      </div>

                      {/* Arrival OTP */}
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-700">1. Arrival OTP Validation (Ask customer at door)</p>
                        {!arrivalOtpVerified ? (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              maxLength={4}
                              placeholder="Enter 4-digit Arrival OTP (Use 4321)" 
                              className="flex-1 p-2.5 border rounded-xl text-xs font-semibold outline-none focus:border-[#0D8A72]"
                              value={arrivalOtp}
                              onChange={e => setArrivalOtp(e.target.value.replace(/[^0-9]/g, ''))}
                            />
                            <button 
                              onClick={handleVerifyArrivalOtp}
                              className="px-4 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-black"
                            >
                              Verify
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-2">
                            <FiCheckCircle className="mr-2 w-4 h-4" /> Arrival Verified. Job in progress.
                          </div>
                        )}
                      </div>

                      {/* Completion OTP */}
                      {arrivalOtpVerified && (
                        <div className="space-y-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-bold text-gray-700">2. Complete OTP Sign-off (Ask customer on completion)</p>
                          {!completionOtpVerified ? (
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                maxLength={4}
                                placeholder="Enter Completion OTP (Use 8821)" 
                                className="flex-1 p-2.5 border rounded-xl text-xs font-semibold outline-none focus:border-[#0D8A72]"
                                value={completionOtp}
                                onChange={e => setCompletionOtp(e.target.value.replace(/[^0-9]/g, ''))}
                              />
                              <button 
                                onClick={handleVerifyCompletionOtp}
                                className="px-4 bg-[#0D8A72] text-white font-bold rounded-xl text-xs hover:bg-teal-700"
                              >
                                Sign-off Job
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-2">
                              <FiCheckCircle className="mr-2 w-4 h-4" /> Job Completed & Funds Settled!
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}

              {/* Cancellation micro-survey */}
              {showCancellationSurvey && (
                <div className="bg-white rounded-3xl border border-red-100 shadow-md p-6 space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-sm text-gray-800">Job Cancellation Audit Survey</h4>
                    <button onClick={() => setShowCancellationSurvey(false)} className="text-gray-400 hover:text-gray-600"><FiXCircle className="w-5 h-5"/></button>
                  </div>
                  <p className="text-xs text-gray-500">Why was the dispatch cancelled? (Helps detect off-platform cash steering leakage)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-semibold text-gray-600">
                    <button onClick={() => { setShowCancellationSurvey(false); toast.success('Survey response logged!'); }} className="p-3 border rounded-xl hover:bg-gray-50 text-left">Customer not reachable</button>
                    <button onClick={() => { setShowCancellationSurvey(false); toast.success('Survey response logged!'); }} className="p-3 border rounded-xl hover:bg-gray-50 text-left">Customer requested cash settlement offline</button>
                    <button onClick={() => { setShowCancellationSurvey(false); toast.success('Survey response logged!'); }} className="p-3 border rounded-xl hover:bg-gray-50 text-left">Equipment unavailable</button>
                  </div>
                </div>
              )}

              {/* Daily Earnings Ledger */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Daily Earnings Ledger (Today)</h3>
                
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <span className="block text-[10px] text-gray-400 font-bold uppercase">Tasks Net Pay</span>
                    <span className="block text-base font-extrabold text-gray-800 mt-1">₹{earningsToday}</span>
                  </div>
                  <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100">
                    <span className="block text-[10px] text-green-600 font-bold uppercase">Cash Tips</span>
                    <span className="block text-base font-extrabold text-green-700 mt-1">₹{tipsToday}</span>
                  </div>
                  <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100 text-red-500">
                    <span className="block text-[10px] text-red-400 font-bold uppercase">TaskY Commission</span>
                    <span className="block text-base font-extrabold text-red-600 mt-1">₹{commissionToday}</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* MODE B: PROFESSIONAL CONTRACTS */}
          {dashboardMode === 'B' && (
            <div className="space-y-6">
              
              {/* Milestone Progress Board */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Milestone Progress Board (Home Automation Setup)</h3>
                <div className="space-y-3">
                  {milestones.map((m, idx) => (
                    <div key={m.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                          m.status === 'completed' ? 'bg-green-100 text-green-700' :
                          m.status === 'in_progress' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                          'bg-gray-100 text-gray-400'
                        }`}>
                          {idx + 1}
                        </div>
                        <span className="text-xs font-bold text-gray-800">{m.name}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        m.status === 'completed' ? 'bg-green-50 text-green-600' :
                        m.status === 'in_progress' ? 'bg-blue-50 text-blue-600' :
                        'bg-gray-50 text-gray-400'
                      }`}>
                        {m.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Procurement Module */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Digital Material Procurement</h3>
                <p className="text-xs text-gray-400">Upload and claim local materials purchase receipts to append costs directly to the client's final invoice.</p>
                
                <div className="space-y-3">
                  {procurements.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-semibold">
                      <div>
                        <p className="text-gray-800 font-bold">{p.item}</p>
                        <p className="text-gray-400 text-[10px]">Qty: {p.qty} • Cost: ₹{p.cost}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${p.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                        {p.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-gray-700">Add New Procurement Receipt</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input 
                      type="text" 
                      placeholder="Material Name" 
                      className="p-2 border rounded-xl text-xs outline-none focus:border-[#0D8A72]"
                      value={newMaterialName}
                      onChange={e => setNewMaterialName(e.target.value)}
                    />
                    <input 
                      type="number" 
                      placeholder="Qty" 
                      className="p-2 border rounded-xl text-xs outline-none focus:border-[#0D8A72]"
                      value={newMaterialQty}
                      onChange={e => setNewMaterialQty(e.target.value)}
                    />
                    <input 
                      type="number" 
                      placeholder="Cost / Unit" 
                      className="p-2 border rounded-xl text-xs outline-none focus:border-[#0D8A72]"
                      value={newMaterialCost}
                      onChange={e => setNewMaterialCost(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleAddProcurement}
                    className="w-full py-2 bg-gray-900 text-white font-bold rounded-xl text-xs hover:bg-black transition-colors"
                  >
                    Upload Bill Receipt & Submit Cost
                  </button>
                </div>
              </div>

              {/* Warranty Management */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Warranty Management Index</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 border rounded-xl bg-gray-50 border-gray-100">
                    <p className="font-bold text-gray-800">Smart Hub Hub-992</p>
                    <p className="text-[10px] text-gray-400 mt-1">Manufacturer Warranty: 2 Years Active</p>
                    <p className="text-[10px] text-gray-400">Installation Coverage: Active (Expires 12-May-2027)</p>
                  </div>
                  <div className="p-3 border rounded-xl bg-gray-50 border-gray-100">
                    <p className="font-bold text-gray-800">Camera System Cam-773</p>
                    <p className="text-[10px] text-gray-400 mt-1">Manufacturer Warranty: 1 Year Active</p>
                    <p className="text-[10px] text-gray-400">Installation Coverage: Active (Expires 20-Jun-2027)</p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* MODE C: ASSET & HEAVY RENTAL PROVIDERS */}
          {dashboardMode === 'C' && (
            <div className="space-y-6">
              
              {/* Asset Availability Grid */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Live Asset Availability Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {assets.map((asset, idx) => (
                    <div key={asset.id} className="p-4 border border-gray-100 rounded-2xl bg-gray-50 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-800">{asset.id}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                          asset.status === 'Available' ? 'bg-green-50 text-green-700' :
                          asset.status === 'Out on Rent' ? 'bg-blue-50 text-blue-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {asset.status}
                        </span>
                      </div>
                      <p className="text-gray-500 font-semibold">{asset.name}</p>
                      
                      {/* Availability switcher */}
                      <select 
                        value={asset.status}
                        onChange={(e) => {
                          const updated = [...assets];
                          updated[idx].status = e.target.value;
                          setAssets(updated);
                          toast.success(`${asset.id} status updated to ${e.target.value}`);
                        }}
                        className="w-full mt-2 p-1.5 bg-white border border-gray-200 rounded-xl text-[10px] focus:outline-none"
                      >
                        <option>Available</option>
                        <option>Out on Rent</option>
                        <option>Undergoing Maintenance</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Logistics Routing Sheet */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Logistics Routing Sheet</h3>
                <div className="space-y-3 text-xs">
                  <div className="p-3 border rounded-xl flex items-center justify-between bg-gray-50 border-gray-100">
                    <div>
                      <p className="font-bold text-gray-800">Concrete Mixer Delivery Slot</p>
                      <p className="text-[10px] text-gray-400 mt-1">Route: Warehouse #3 ➔ Infopark Site (Delivery Time: 10:00 AM - 12:00 PM)</p>
                    </div>
                    <button 
                      onClick={() => toast.success('Routing details fetched')}
                      className="px-2.5 py-1 bg-[#0D8A72] text-white font-bold rounded-lg text-[10px]"
                    >
                      Route Map
                    </button>
                  </div>
                  <div className="p-3 border rounded-xl flex items-center justify-between bg-gray-50 border-gray-100">
                    <div>
                      <p className="font-bold text-gray-800">Hydraulic Scaffolding Pickup Slot</p>
                      <p className="text-[10px] text-gray-400 mt-1">Route: Kochi Tech Zone ➔ Warehouse #3 (Pickup Time: 04:00 PM - 06:00 PM)</p>
                    </div>
                    <button 
                      onClick={() => toast.success('Routing details fetched')}
                      className="px-2.5 py-1 bg-[#0D8A72] text-white font-bold rounded-lg text-[10px]"
                    >
                      Route Map
                    </button>
                  </div>
                </div>
              </div>

              {/* Security Deposit Vault */}
              <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-800">Security Deposit Vault Pool</h3>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Escrow Holdings</span>
                </div>
                
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <div key={asset.id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs">
                      <div>
                        <p className="font-bold text-gray-800">{asset.name}</p>
                        <p className="text-[10px] text-gray-400">Escrow Safety Deposit Held: ₹{asset.deposit}</p>
                      </div>
                      {asset.status === 'Out on Rent' && (
                        <button 
                          onClick={() => setSelectedAssetForClaim(asset)}
                          className="px-3 py-1.5 bg-red-500 text-white font-bold rounded-xl text-[10px] hover:bg-red-600"
                        >
                          File Damage Claim
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* 1-Column Right Sidebar */}
        <div className="space-y-6">

          {/* Secure Escrow Lock Info */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">Financial Security Escrow</h3>
            <div className="p-4 bg-teal-50/50 border border-[#10AFA5]/10 rounded-2xl space-y-2 text-xs leading-relaxed text-gray-600">
              <p className="font-bold text-[#0D8A72] flex items-center gap-1.5">
                <FiShield/> Upfront Payment Lock Active
              </p>
              <p>Clients pay 100% of cost upfront before task scheduling. Payments remain locked in a secure corporate escrow account, releasing instantly to partner wallets upon input of the Completion OTP.</p>
            </div>
          </div>

          {/* Partner Wallet Card */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-800">In-App Partner Wallet</h3>
              <FiDollarSign className="text-[#0D8A72]" />
            </div>

            <div className="space-y-1">
              <span className="text-xs text-gray-400 font-bold uppercase">Available Balance</span>
              <h2 className="text-3xl font-black text-gray-800">₹{walletBalance.toLocaleString()}</h2>
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={handleInstantCashout}
                disabled={cashoutProcessing}
                className="w-full py-3 bg-[#0D8A72] text-white font-extrabold rounded-xl text-xs shadow-md hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
              >
                {cashoutProcessing ? 'Processing IMPS Transfer...' : 'Run Instant Cashout to Bank'}
              </button>
              <p className="text-[10px] text-gray-400 text-center">Flexible Instant Mode applies a flat rate of ₹5 per IMPS request. Auto-Friday disbursals are free of cost.</p>
            </div>
          </div>

          {/* Compliance & Insurance Status */}
          <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-800">Partner Compliance Profile</h3>
            
            <div className="space-y-3 text-xs font-semibold">
              <div className="flex items-center justify-between p-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl">
                <span>Aadhaar Identity check</span>
                <span className="text-[9px] uppercase font-bold">Verified</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl">
                <span>Penny Drop Name Score (95%)</span>
                <span className="text-[9px] uppercase font-bold">Passed</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl">
                <span>Active Insurance Cover</span>
                <span className="text-[9px] uppercase font-bold">₹20k active</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* MODAL: ANTI-RENTING BIOMETRIC VERIFICATION */}
      {showBiometricModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 border border-gray-100 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center text-[#0D8A72] mx-auto">
              <FiCamera className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base">Random Face Scan Verification</h3>
              <p className="text-xs text-gray-400 mt-1">To ensure safety guidelines, perform a quick facial biometric scan before switching availability to Online.</p>
            </div>
            
            {biometricScanRunning ? (
              <div className="py-4 space-y-2">
                <div className="w-8 h-8 border-4 border-t-transparent border-[#0D8A72] rounded-full animate-spin mx-auto"></div>
                <p className="text-[10px] text-gray-400">Comparing live facial model with Aadhaar verification record...</p>
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setShowBiometricModal(false)}
                  className="flex-1 py-2.5 border rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBiometricSuccess}
                  className="flex-1 py-2.5 bg-[#0D8A72] text-white font-bold rounded-xl text-xs hover:bg-teal-700"
                >
                  Start Scanning
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: FILE DAMAGE CLAIM */}
      {selectedAssetForClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-gray-100 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800 text-sm">Submit Safety Deposit Damage Claim</h3>
              <button onClick={() => setSelectedAssetForClaim(null)} className="text-gray-400 hover:text-gray-600"><FiXCircle className="w-5 h-5"/></button>
            </div>
            <p className="text-xs text-gray-500">Asset: {selectedAssetForClaim.name} ({selectedAssetForClaim.id})</p>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-600 mb-1">Requested Deduction Amount (Escrow Hold: ₹{selectedAssetForClaim.deposit})</label>
                <input 
                  type="number"
                  placeholder="Enter Claim Amount"
                  className="w-full p-3 border rounded-xl outline-none focus:border-[#0D8A72] font-semibold"
                  value={damageClaimAmount}
                  onChange={e => setDamageClaimAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-bold text-gray-600 mb-1">Explain Damage details</label>
                <textarea 
                  rows={3}
                  placeholder="Describe parts damaged, wear, or missing tools..."
                  className="w-full p-3 border rounded-xl outline-none focus:border-[#0D8A72]"
                  value={damageDescription}
                  onChange={e => setDamageDescription(e.target.value)}
                />
              </div>

              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50 text-center space-y-2">
                <FiUploadCloud className="w-6 h-6 mx-auto text-gray-400" />
                <p className="font-bold text-gray-500">Upload Photographic Proof of Damage</p>
                <p className="text-[10px] text-gray-400">Claims require photographic proof to retain safety holds.</p>
              </div>
            </div>

            <button 
              onClick={handleDamageClaim}
              className="w-full py-3 bg-red-500 text-white font-bold rounded-xl text-xs hover:bg-red-600 shadow-md"
            >
              Submit Claim & Lock Deposit Holding
            </button>
          </div>
        </div>
      )}

    </div>
  );
});

Dashboard.displayName = 'VendorDashboard';
export default Dashboard;
