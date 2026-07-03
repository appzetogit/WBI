import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FiLock, FiCheckCircle, FiAlertCircle, FiEye, FiEyeOff } from 'react-icons/fi';
import api from '../../../../services/api';
import toast from 'react-hot-toast';

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string().min(8, 'Confirm Password must be at least 8 characters long')
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [userDetails, setUserDetails] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setErrorMsg('Invitation token is missing. Please check your email link.');
        setVerifying(false);
        return;
      }

      try {
        const res = await api.post('/b2b/users/accept-invite', { token });
        if (res.data.success) {
          setUserDetails(res.data.data);
        } else {
          setErrorMsg(res.data.message || 'Invalid or expired invitation link.');
        }
      } catch (err) {
        setErrorMsg(err.response?.data?.message || 'Verification failed. The token may be expired.');
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const onSubmit = async (data) => {
    const parsed = passwordSchema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      const res = await api.post('/b2b/users/set-password', {
        token,
        password: data.password
      });

      if (res.data.success) {
        setSuccess(true);
        toast.success('Account activated successfully!');
      } else {
        toast.error(res.data.message || 'Failed to set password.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Activation failed. Please try again.');
    }
  };

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-tr from-[#F0FDFA] to-white p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#10AFA5]"></div>
          <p className="text-gray-500 font-bold text-sm tracking-wide">Verifying invitation token...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-tr from-[#F0FDFA] to-white p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-red-50 max-w-md w-full text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-50 text-red-500">
            <FiAlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-800">Invalid Invitation Link</h2>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">{errorMsg}</p>
          </div>
          <button
            onClick={() => navigate('/b2b/login')}
            className="w-full py-3.5 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-2xl transition-all shadow-sm"
          >
            Go to Login Page
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-tr from-[#F0FDFA] to-white p-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-emerald-50 max-w-md w-full text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-50 text-emerald-500 animate-bounce">
            <FiCheckCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-800">All Set!</h2>
            <p className="text-sm text-gray-500 font-medium leading-relaxed">
              Your account has been configured and activated successfully. You can now access the B2B portal.
            </p>
          </div>
          <button
            onClick={() => navigate('/b2b/login')}
            className="w-full py-3.5 bg-[#10AFA5] hover:bg-[#0E9B92] text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-[#10AFA5]/10"
          >
            Log In to Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-tr from-[#F0FDFA] to-white p-6">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-md w-full space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-gray-800">Activate Account</h2>
          <p className="text-xs text-gray-400 font-bold leading-relaxed">
            Welcome <span className="text-gray-700 font-extrabold">{userDetails?.fullName}</span>. Set up your password to activate your account for <span className="text-[#10AFA5] font-extrabold">{userDetails?.companyName}</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email View only */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Email Address</label>
            <input
              type="text"
              value={userDetails?.email}
              disabled
              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-400 cursor-not-allowed outline-none"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5 relative">
            <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Create Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter strong password"
                {...register('password', { required: true })}
                className="w-full pl-10 pr-10 py-3 border border-gray-200 focus:border-[#10AFA5] rounded-xl text-sm font-semibold outline-none transition-all"
              />
              <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5 relative">
            <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                {...register('confirmPassword', { required: true })}
                className="w-full pl-10 pr-10 py-3 border border-gray-200 focus:border-[#10AFA5] rounded-xl text-sm font-semibold outline-none transition-all"
              />
              <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 mt-2 bg-[#10AFA5] hover:bg-[#0E9B92] text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-[#10AFA5]/10"
          >
            Activate & Set Password
          </button>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvite;
