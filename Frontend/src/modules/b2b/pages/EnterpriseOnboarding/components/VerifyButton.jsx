import React from 'react';
import { FiCheckCircle, FiLoader, FiAlertCircle } from 'react-icons/fi';

export default function VerifyButton({
  status, // 'verified' | 'failed' | 'pending' | 'unverified'
  loading = false,
  onClick,
  disabled = false,
  label = 'Verify'
}) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <FiCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
        Verified
      </span>
    );
  }

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
      >
        <FiLoader className="w-3.5 h-3.5 animate-spin text-[#10AFA5]" />
        Verifying...
      </button>
    );
  }

  if (status === 'failed') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
      >
        <FiAlertCircle className="w-3.5 h-3.5 text-rose-500" />
        Retry Verify
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
        disabled
          ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
          : 'bg-[#10AFA5] text-white hover:bg-[#0d8f87] cursor-pointer shadow-[#10AFA5]/20'
      }`}
    >
      {label}
    </button>
  );
}
