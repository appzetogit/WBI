import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Phone, KeyRound, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { sharedAuthService } from '../../services/authService';

const ForgotPasswordFlow = ({ role = 'user', loginRoute = '/user', isInline = false }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // State
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formError, setFormError] = useState('');
  
  // OTP Timer
  const [timeLeft, setTimeLeft] = useState(60);
  const otpInputRefs = useRef([]);

  useEffect(() => {
    let timer;
    if (step === 2 && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  // Handle Request OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setFormError(''); // Clear previous errors
    
    if (!identifier) {
      setFormError('Please enter your email or mobile number');
      return;
    }
    
    setLoading(true);
    try {
      const response = await sharedAuthService.forgotPassword(role, identifier);
      if (response.success) {
        toast.success(response.message || 'OTP sent successfully');
        setStep(2);
        setTimeLeft(60);
      } else {
        setFormError(response.message || 'Failed to send OTP');
      }
    } catch (err) {
      // Use inline error instead of global toast for professional look
      setFormError(err.response?.data?.message || 'Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // OTP Input Logic
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto focus next
    if (value !== '' && index < 5) {
      otpInputRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1].focus();
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await sharedAuthService.verifyResetOtp(role, identifier, otpValue);
      if (response.success && response.resetToken) {
        setResetToken(response.resetToken);
        toast.success('OTP verified successfully');
        setStep(3);
      } else {
        toast.error(response.message || 'Invalid OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timeLeft > 0) return;
    setLoading(true);
    try {
      const response = await sharedAuthService.resendResetOtp(role, identifier);
      if (response.success) {
        toast.success('A new OTP has been sent');
        setTimeLeft(60);
        setOtp(['', '', '', '', '', '']);
        otpInputRefs.current[0].focus();
      } else {
        toast.error(response.message || 'Failed to resend OTP');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Please wait before requesting a new OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await sharedAuthService.resetPassword(role, identifier, resetToken, newPassword, confirmPassword);
      if (response.success) {
        setStep(4);
      } else {
        toast.error(response.message || 'Failed to reset password');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Server error during password reset');
    } finally {
      setLoading(false);
    }
  };

  const variants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <div className={isInline ? "w-full" : "min-h-[100dvh] w-full flex items-center justify-center bg-transparent px-4 py-8"}>
      <div className={`w-full max-w-md mx-auto ${isInline ? 'bg-transparent' : 'bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)]'} overflow-hidden relative`}>
        {/* Back Button */}
        {step > 1 && step < 4 && (
          <button
            onClick={() => setStep(step - 1)}
            className="absolute top-0 left-0 p-2 rounded-full hover:bg-gray-100 transition-colors z-10"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
        )}

        <div className={isInline ? "pt-2 pb-2" : "p-8"}>
          <AnimatePresence mode="wait">
            {/* STEP 1: Request OTP */}
            {step === 1 && (
              <motion.div key="step1" variants={variants} initial="initial" animate="animate" exit="exit">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <KeyRound className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Forgot Password?</h2>
                  <p className="text-gray-500">Don't worry! It happens. Please enter the email or mobile number associated with your account.</p>
                </div>

                <form onSubmit={handleRequestOtp} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email or Mobile Number</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        value={identifier}
                        onChange={(e) => {
                          // Allow emails (which can have letters) but strip all spaces
                          const val = e.target.value.replace(/\s+/g, '');
                          setIdentifier(val);
                          if (formError) setFormError('');
                        }}
                        className={`block w-full pl-10 pr-3 py-3 border ${formError ? 'border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50/30' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'} rounded-xl transition-colors`}
                        placeholder="Enter your email or mobile"
                        required
                      />
                    </div>
                    {/* Inline Professional Error Message */}
                    {formError && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className="mt-2 flex items-start space-x-1.5"
                      >
                        <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
                          <span className="text-red-600 text-[10px] font-bold">!</span>
                        </div>
                        <p className="text-sm text-red-500 font-medium leading-tight">
                          {formError}
                        </p>
                      </motion.div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !identifier}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Code'}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button onClick={() => navigate(loginRoute)} className="text-sm font-medium text-blue-600 hover:text-blue-500">
                    Back to Login
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Verify OTP */}
            {step === 2 && (
              <motion.div key="step2" variants={variants} initial="initial" animate="animate" exit="exit">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h2>
                  <p className="text-gray-500">We sent a 6-digit code to <span className="font-semibold text-gray-700">{identifier}</span></p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="flex justify-between gap-2">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={el => otpInputRefs.current[index] = el}
                        type="text"
                        maxLength="1"
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="w-12 h-14 text-center text-xl font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.join('').length !== 6}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Code'}
                  </button>
                </form>

                <div className="mt-8 text-center">
                  <p className="text-sm text-gray-500">
                    Didn't receive the code?{' '}
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={timeLeft > 0 || loading}
                      className={`font-medium ${timeLeft > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-500'}`}
                    >
                      {timeLeft > 0 ? `Resend in ${timeLeft}s` : 'Click to resend'}
                    </button>
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Reset Password */}
            {step === 3 && (
              <motion.div key="step3" variants={variants} initial="initial" animate="animate" exit="exit">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Set new password</h2>
                  <p className="text-gray-500">Your new password must be different to previously used passwords.</p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="••••••••"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="••••••••"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !newPassword || !confirmPassword}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset Password'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* STEP 4: Success */}
            {step === 4 && (
              <motion.div key="step4" variants={variants} initial="initial" animate="animate" exit="exit" className="text-center py-8">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Password Reset!</h2>
                <p className="text-gray-500 mb-8">Your password has been successfully reset. Click below to log in magically.</p>
                <button
                  onClick={() => navigate(loginRoute)}
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all"
                >
                  Continue to Login
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordFlow;
