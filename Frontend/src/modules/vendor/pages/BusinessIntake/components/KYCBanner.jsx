import React from 'react';
import { ShieldAlert } from 'lucide-react';

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
      <a
        href="/vendor/dynamic/compliance"
        className="ml-4 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
      >
        Complete KYC →
      </a>
    </div>
  );
};

export default KYCBanner;
