import React, { useState, useEffect } from 'react';
import { FiX, FiShield, FiLoader, FiRotateCw } from 'react-icons/fi';

export default function OtpModal({
  isOpen,
  onClose,
  channel = 'email', // 'email' | 'sms'
  target = '',
  onConfirm,
  onResend
}) {
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    let timer;
    if (isOpen) {
      setCountdown(60);
      setOtp('');
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 4) return;
    setVerifying(true);
    try {
      await onConfirm(otp);
      onClose();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    await onResend();
    setCountdown(60);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-full bg-[#E6F4F2] text-[#10AFA5] flex items-center justify-center mx-auto text-xl font-bold">
            <FiShield className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Verify {channel === 'email' ? 'Email' : 'Phone'}</h3>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            We sent a verification code to <span className="font-semibold text-gray-800">{target}</span>
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 text-center mb-2">
              Enter Verification Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="0 0 0 0 0 0"
              autoFocus
              className="w-full text-center tracking-[0.6em] font-mono text-2xl py-3 px-4 rounded-xl border border-gray-300 focus:border-[#10AFA5] focus:ring-2 focus:ring-[#10AFA5]/20 outline-none transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Didn't receive code?</span>
            {countdown > 0 ? (
              <span className="text-gray-400">Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="text-[#10AFA5] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <FiRotateCw className="w-3.5 h-3.5" /> Resend Code
              </button>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying || !otp || otp.length < 4}
              className="flex-1 py-2.5 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold hover:bg-[#0d8f87] transition-all shadow-md shadow-[#10AFA5]/20 disabled:bg-gray-200 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {verifying && <FiLoader className="w-4 h-4 animate-spin" />}
              {verifying ? 'Verifying...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
