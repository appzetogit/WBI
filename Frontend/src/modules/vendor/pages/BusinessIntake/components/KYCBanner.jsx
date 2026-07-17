import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

const KYCBanner = ({ show = true }) => {
  if (!show) return null;
  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-xl px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-900">KYC Verification Pending</p>
          <p className="text-xs text-amber-700">You must complete KYC verification before submitting bids or accepting invitations.</p>
        </div>
      </div>
      <Link 
        to="/vendor/dynamic/compliance" 
        className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors"
      >
        Complete KYC →
      </Link>
    </div>
  );
};

export default KYCBanner;
