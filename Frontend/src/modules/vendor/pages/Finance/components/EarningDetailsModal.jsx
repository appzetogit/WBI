import React from 'react';
import {
  X,
  Building2,
  UserCheck,
  IndianRupee,
  ShieldCheck,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Receipt,
  FileText,
  Percent,
  Layers,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { formatINR } from '../../../services/financeService';
import { useNavigate } from 'react-router-dom';

const EarningDetailsModal = ({ isOpen, onClose, earning }) => {
  const navigate = useNavigate();

  if (!isOpen || !earning) return null;

  const isB2B = earning.source === 'B2B_JOB';
  const gross = earning.grossAmount || 0;
  const platformFee = earning.platformFee || 0;
  const vendorPayable = earning.vendorPayable || 0;
  // Engineer share is shown only when the ledger recorded one — never estimated.
  const engineerPayout = Number.isFinite(Number(earning.engineerPayout)) && earning.engineerPayout !== null
    ? Number(earning.engineerPayout)
    : null;
  const vendorNetMargin = engineerPayout === null ? null : vendorPayable - engineerPayout;

  const handleNavigateToJob = () => {
    onClose();
    navigate(`/vendor/my-jobs?search=${encodeURIComponent(earning.jobId || '')}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`p-6 text-white flex items-center justify-between ${
          isB2B
            ? 'bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900'
            : 'bg-gradient-to-br from-teal-950 via-teal-900 to-slate-900'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              {isB2B ? <Building2 className="w-6 h-6 text-indigo-300" /> : <UserCheck className="w-6 h-6 text-teal-300" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider font-bold text-teal-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                  {isB2B ? 'B2B Corporate Job' : 'User App Service Job'}
                </span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  earning.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {earning.status}
                </span>
              </div>
              <h2 className="text-lg font-black text-white mt-1 font-mono">{earning.jobId}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Service & Client Overview */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase">Job Title / Service</span>
              {earning.city && (
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-gray-400" /> {earning.city}
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-gray-900">{earning.title}</div>
            <div className="text-xs text-gray-500">Client / Customer: <span className="font-semibold text-gray-700">{earning.clientName || 'N/A'}</span></div>
          </div>

          {/* Financial Breakdown (Transparent Ledger) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Financial Calculation Ledger</span>
              <span className="text-[11px] text-teal-600 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified Job Settlement
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-gray-200 bg-slate-50/50 space-y-3">
              {/* Gross Amount */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 font-medium">Customer / Client Billed Total (Gross)</span>
                <span className="font-bold text-gray-900">{formatINR(gross)}</span>
              </div>

              {/* Platform Fee */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 flex items-center gap-1">
                  Platform Commission & Technology Fee
                </span>
                <span className="font-medium text-rose-600">-{formatINR(platformFee)}</span>
              </div>

              {/* Total Vendor Payable */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-200">
                <span className="font-bold text-gray-800">Total Vendor Payable Share</span>
                <span className="font-black text-gray-900 text-sm">{formatINR(vendorPayable)}</span>
              </div>

              {/* Engineer Share */}
              <div className="flex items-center justify-between text-xs pl-3 border-l-2 border-indigo-400 py-0.5">
                <span className="text-indigo-700 font-medium">↳ Field Engineer Share</span>
                <span className="font-bold text-indigo-600">{engineerPayout === null ? 'Not recorded' : formatINR(engineerPayout)}</span>
              </div>

              {/* Net Vendor Retained Margin */}
              <div className="flex items-center justify-between text-xs pl-3 border-l-2 border-teal-500 py-0.5 bg-teal-50/50 rounded-r-lg">
                <span className="text-teal-900 font-bold">↳ Net Vendor Retained Margin</span>
                <span className="font-black text-teal-700">{vendorNetMargin === null ? '—' : formatINR(vendorNetMargin)}</span>
              </div>
            </div>
          </div>

          {/* Timeline & Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Date Logged</span>
              <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {earning.date ? new Date(earning.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Settlement Status</span>
              <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                {earning.status === 'paid' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Settled to Vendor</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-amber-700">Pending Admin Settlement</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleNavigateToJob}
            className="px-4 py-2 text-xs font-bold text-teal-700 hover:text-teal-800 hover:bg-teal-50 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>View in My Jobs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EarningDetailsModal;
