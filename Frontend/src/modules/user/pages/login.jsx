import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiPhone, FiArrowRight, FiCheckCircle, FiChevronLeft } from 'react-icons/fi';
import { FcGoogle } from 'react-icons/fc';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../theme';
import { userAuthService, sharedAuthService } from '../../../services/authService';
import { configService } from '../../../services/configService';
import { getFirebaseAuth } from '../../../firebase';
import LogoLoader from '../../../components/common/LogoLoader';
import DebugConsole from '../components/common/DebugConsole';
import Onboarding from '../components/Onboarding';

import { z } from "zod";

// Zod schema
const phoneSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Please enter a valid 10-digit phone number"),
});

const Login = () => {
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem('onboardingCompleted_v5');
    } catch {
      return false; // Safely default to false if localStorage is unavailable
    }
  });
  
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpToken, setOtpToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isAppleLoginEnabled, setIsAppleLoginEnabled] = useState(false);

  useEffect(() => {
    configService.getSettings().then((res) => {
      if (res?.settings) {
        setIsAppleLoginEnabled(Boolean(res.settings.isAppleLoginEnabled));
      }
    });
  }, []);

  // Timer countdown effect
  useEffect(() => {
    let interval;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Refs for focus management
  const phoneInputRef = useRef(null);
  const otpInputRefs = useRef([]);

  // Auto-focus logic
  useEffect(() => {
    // Redirect if already logged in
    if (localStorage.getItem('accessToken')) {
      navigate('/user', { replace: true });
      return;
    }

    if (step === 'phone' && phoneInputRef.current) {
      setTimeout(() => phoneInputRef.current.focus(), 100);
    } else if (step === 'otp' && otpInputRefs.current[0]) {
      setTimeout(() => otpInputRefs.current[0].focus(), 100);
    }
  }, [step, navigate]);

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();

    // Zod Validation
    const validationResult = phoneSchema.safeParse({ phone: phoneNumber });
    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      // Clean phone number
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const response = await userAuthService.sendOTP(cleanPhone);

      if (response.success) {
        setOtpToken(response.token);
        setIsLoading(false);
        setStep('otp');
        setResendTimer(120); // Start 2 min timer
        toast.success(
          <div className="flex items-center gap-2">
            <FiCheckCircle className="text-green-500" />
            <span>OTP sent successfully!</span>
          </div>
        );
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Failed to send OTP');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Failed to send OTP. Please try again.');
    }
  };

  const handleOtpChange = (index, value) => {
    // Allow only numbers
    if (value && !/^\d+$/.test(value)) return;

    if (value.length > 1) {
      // Handle paste of full OTP or partial
      const cleaned = value.replace(/\D/g, '').slice(0, 6);
      if (cleaned.length === 6) {
        setOtp(cleaned.split(''));
        otpInputRefs.current[5]?.focus();
      } else if (cleaned.length > 0) {
        const newOtp = [...otp];
        for (let i = 0; i < cleaned.length && index + i < 6; i++) {
          newOtp[index + i] = cleaned[i];
        }
        setOtp(newOtp);
        const nextIndex = Math.min(index + cleaned.length, 5);
        otpInputRefs.current[nextIndex]?.focus();
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Auto-verify as last digit enters
  useEffect(() => {
    const otpValue = otp.join('');
    if (otpValue.length === 6 && !isLoading && otpToken) {
      handleOtpSubmit();
    }
  }, [otp]);

  const handleOtpSubmit = async (e) => {
    if (e) e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      toast.error('Please enter complete OTP');
      return;
    }
    if (!otpToken) {
      toast.error('Please request OTP first');
      return;
    }
    setIsLoading(true);
    try {
      const response = await userAuthService.verifyLogin({
        phone: phoneNumber.replace(/\D/g, ''),
        otp: otpValue
      });

      if (response.success) {
        if (response.isNewUser) {
          toast.success('Phone verified! Please complete your registration.');
          navigate('/user/signup', {
            state: {
              phone: phoneNumber,
              verificationToken: response.verificationToken
            }
          });
        } else {
          toast.success('Welcome back!');
          navigate(response.redirectTo || '/user', { replace: true });
        }
      } else {
        setIsLoading(false);
        toast.error(response.message || 'Verification failed');
      }
    } catch (error) {
      setIsLoading(false);
      toast.error(error.response?.data?.message || 'Verification failed. Please try again.');
    }
  };

  const handleSocialLogin = async (providerName) => {
    try {
      setIsLoading(true);
      const credentials = await getFirebaseAuth();
      if (!credentials || !credentials.auth) {
        throw new Error('Firebase Auth is not available');
      }
      const { auth, GoogleAuthProvider, OAuthProvider, signInWithPopup } = credentials;
      const provider =
        providerName === 'apple'
          ? new OAuthProvider('apple.com')
          : new GoogleAuthProvider();

      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();

      const response = await sharedAuthService.socialLogin({ token, role: 'user' });
      if (response.success) {
        toast.success('Welcome Back!');
        navigate(response.redirectTo || '/user', { replace: true });
      } else {
        toast.error(response.message || 'Login failed');
      }
    } catch (error) {
      console.error('User social login error:', error);
      toast.error(error?.response?.data?.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Brand Colors from theme
  const brandColor = themeColors.brand?.orange || '#FF8A00';

  // --- Onboarding Check ---
  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="min-h-[100dvh] bg-transparent flex flex-col pt-[max(env(safe-area-inset-top),32px)] pb-[max(env(safe-area-inset-bottom),20px)] px-6 relative overflow-x-hidden">
      
      {/* Top Logo Area */}
      <div className="w-full flex justify-center mb-6 h-14 items-center mt-2 shrink-0">
          <img fetchPriority="low" loading="lazy" 
            src="/logo/logo.webp" 
            alt="WBI Logo" 
            className="h-full w-auto max-w-[180px] object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextElementSibling) {
                e.target.nextElementSibling.style.display = 'block';
              }
            }}
          />
          <span className="hidden text-3xl font-extrabold text-[#FF8A00] tracking-tight">WBI</span>
      </div>

      {/* Heading Area */}
      <div className="w-full text-center mb-7 shrink-0">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1a2b3c] tracking-tight">
          {step === 'phone' ? 'Sign in to account' : 'Verify your phone'}
        </h2>
        <p className="mt-2 text-sm text-gray-500 font-medium">
          {step === 'phone'
            ? 'Enter your mobile number to get started'
            : `We've sent a code to +91 ${phoneNumber}`
          }
        </p>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-start">
          {step === 'phone' ? (
            <form className="flex flex-col" onSubmit={handlePhoneSubmit}>
              <div className="mb-5">
                <label htmlFor="phone" className="block text-sm font-semibold text-[#1a2b3c] mb-2 ml-1">
                  Mobile Number
                </label>
                <div className="relative rounded-2xl group border border-gray-200 focus-within:border-[#FF8A00] focus-within:ring-1 focus-within:ring-[#FF8A00] transition-all bg-white shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-[#FF8A00] transition-colors">
                    <FiPhone className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="absolute inset-y-0 left-12 flex items-center pointer-events-none">
                    <span className="text-gray-500 font-semibold border-r pr-3 border-gray-200 sm:text-base">+91</span>
                  </div>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    id="phone"
                    className="block w-full pl-[100px] pr-4 py-3.5 bg-transparent border-transparent focus:border-transparent focus:ring-0 sm:text-lg font-bold text-[#1a2b3c] placeholder-gray-300 rounded-2xl"
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length <= 10) setPhoneNumber(val);
                    }}
                  />
                </div>
              </div>

              {/* Action Area */}
              <div className="flex flex-col gap-4">
                <button
                  type="submit"
                  disabled={isLoading || phoneNumber.length < 10}
                  className="w-full flex justify-center py-3.5 px-4 rounded-2xl text-base font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-md hover:shadow-lg cursor-pointer"
                  style={{ backgroundColor: brandColor }}
                >
                  {isLoading ? (
                    <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
                  ) : (
                    <span>Get OTP</span>
                  )}
                </button>

                <div className="flex items-center gap-3 py-0.5">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">or continue with</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>

                <div className={`grid gap-3 ${isAppleLoginEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleSocialLogin('google')}
                    className="w-full inline-flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-2xl shadow-sm bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
                  >
                    <FcGoogle className="w-5 h-5 mr-2 shrink-0" />
                    {isAppleLoginEnabled ? 'Google' : 'Continue with Google'}
                  </button>
                  {isAppleLoginEnabled && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSocialLogin('apple')}
                      className="w-full inline-flex justify-center items-center py-3.5 px-4 border border-gray-200 rounded-2xl shadow-sm bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
                    >
                      <svg className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24" fill="black" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.05 20.28c-.98.68-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 13.25 4.51 5.96 9.05 5.68c1.3.07 2.45.81 3.05.81.65 0 2.06-.88 3.55-.74 1.3.06 2.5.64 3.3 1.68-2.8 1.67-2.3 5.48.51 6.6-1.07 2.4-2.14 4.58-2.41 6.25zM12.03 5.09c-.06-1.74 1.34-3.32 3.1-3.4 1.14 1.94-.96 3.84-3.1 3.4z" />
                      </svg>
                      Apple
                    </button>
                  )}
                </div>

                <div className="space-y-2 pt-2 text-center">
                  <p className="text-sm text-gray-500 font-medium">
                    New to WBI?{' '}
                    <Link
                      to="/user/signup"
                      className="text-[#FF8A00] hover:text-[#e65100] font-bold transition-colors"
                    >
                      Create an account
                    </Link>
                  </p>
                  <p className="text-sm text-gray-500 font-medium">
                    <Link
                      to="/user/forgot-password"
                      className="text-[#FF8A00] hover:text-[#e65100] font-bold transition-colors"
                    >
                      Forgot Password?
                    </Link>
                  </p>
                </div>
              </div>
            </form>
          ) : (
            <form className="flex flex-col flex-1" onSubmit={handleOtpSubmit}>
              <div className="flex justify-center gap-2 sm:gap-3 mb-8">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold border-gray-200 rounded-2xl focus:ring-[#FF8A00] focus:border-[#FF8A00] transition-all bg-white shadow-sm"
                    style={{ caretColor: brandColor, color: '#1a2b3c' }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-sm mb-6 px-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setOtp(['', '', '', '', '', '']);
                    setOtpToken('');
                    setStep('phone');
                    setResendTimer(0);
                  }}
                  className="flex items-center font-bold text-gray-500 hover:text-[#FF8A00] transition-colors"
                >
                  <FiChevronLeft className="mr-1 h-5 w-5" /> Change Number
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (isLoading || resendTimer > 0) return;
                    try {
                      setIsLoading(true);
                      const response = await userAuthService.sendOTP(phoneNumber.replace(/\D/g, ''));
                      if (response.success) {
                        setOtpToken(response.token);
                        setResendTimer(120);
                        toast.success('OTP resent!');
                      }
                    } catch {
                      toast.error('Error sending OTP');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading || resendTimer > 0}
                  className="font-bold text-[#FF8A00] hover:text-[#e65100] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resendTimer > 0
                    ? `Resend in ${Math.floor(resendTimer / 60)}:${String(resendTimer % 60).padStart(2, '0')}`
                    : 'Resend OTP'}
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || otp.join('').length !== 6}
                  className="w-full flex justify-center py-3.5 px-4 rounded-2xl text-base font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-md hover:shadow-lg cursor-pointer"
                  style={{ backgroundColor: brandColor }}
                >
                  {isLoading ? (
                    <LogoLoader fullScreen={false} inline={true} size="w-6 h-6" />
                  ) : (
                    <span>Verify & Continue</span>
                  )}
                </button>
              </div>
            </form>
          )}
      </div>

      {/* Footer */}
      <div className="w-full text-center text-xs text-gray-400 mt-4 shrink-0 pb-2 space-y-1.5">
        <p className="text-[11px] leading-relaxed max-w-xs mx-auto">
          By continuing, you agree to WBI's{' '}
          <Link to="/user/terms-services" className="font-semibold text-gray-600 underline hover:text-[#FF8A00] transition-colors">
            Terms & Services
          </Link>
          {' '}and{' '}
          <Link to="/user/privacy-policy" className="font-semibold text-gray-600 underline hover:text-[#FF8A00] transition-colors">
            Privacy Policy
          </Link>
        </p>
        <p>&copy; {new Date().getFullYear()} WBI. All rights reserved.</p>
      </div>
      <DebugConsole />
    </div>
  );
};

export default Login;
