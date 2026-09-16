import React from 'react';
import { 
  FiCheckCircle, FiClock, FiAlertTriangle, FiArrowRight, 
  FiFileText, FiShield, FiCheck, FiSend, FiLoader 
} from 'react-icons/fi';
import { Link } from 'react-router-dom';

export default function Step16Submit({
  onboarding = {},
  company = {},
  documents = [],
  stepCompletion = {},
  onSubmit,
  onPrevious,
  saving = false
}) {
  const lifecycleStatus = onboarding?.lifecycleStatus || 'draft';
  const isSubmitted = lifecycleStatus === 'submitted' || lifecycleStatus === 'under_review' || lifecycleStatus === 'active';
  const isActivated = lifecycleStatus === 'active';

  // Check prerequisites
  const checks = [
    { label: 'Company Identity & Legal Details', ok: !!onboarding?.companyInfo?.legalName && !!onboarding?.companyInfo?.gstNumber },
    { label: 'Registered & Billing Office Address', ok: !!onboarding?.addresses?.registered || !!onboarding?.addresses?.registeredAddress },
    { label: 'Primary Contact Person', ok: !!onboarding?.primaryContact?.name && !!onboarding?.primaryContact?.email },
    { label: 'Service Portfolio Selected', ok: (onboarding?.serviceRequirements?.selectedServices || []).length > 0 },
    { label: 'Bank Account & Settlement Details', ok: !!onboarding?.banking?.accountNumber },
    { label: 'Master SLA Contract E-Signed', ok: !!onboarding?.slaConfig?.slaSigned },
    { label: 'Statutory Certificates Uploaded', ok: documents.length >= 2 }
  ];

  const allPassed = checks.every((c) => c.ok);

  if (isActivated) {
    return (
      <div className="text-center py-12 px-6 max-w-lg mx-auto space-y-5">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
          <FiCheckCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-gray-900">Enterprise Account Activated!</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your corporate profile and compliance documents have been verified. You now have full production access to dispatch bulk work orders and hire certified technicians.
          </p>
        </div>
        <div className="pt-4 flex justify-center gap-3">
          <Link
            to="/b2b/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#10AFA5] text-white text-sm font-bold hover:bg-[#0d8f87] transition-all shadow-lg shadow-[#10AFA5]/20"
          >
            Go to B2B Dashboard <FiArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="text-center py-12 px-6 max-w-lg mx-auto space-y-6">
        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto text-3xl">
          <FiClock className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-gray-900">Application Under Verification</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your enterprise onboarding file was submitted on{' '}
            <span className="font-semibold text-gray-700">
              {onboarding.submittedAt ? new Date(onboarding.submittedAt).toLocaleDateString() : 'recently'}
            </span>
            . Our compliance and operations desk is reviewing your tax certificates and bank details.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-left space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Review Timeline</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-700">
              <FiCheckCircle className="w-4 h-4" />
              <span>Identity & KYC Documentation Received</span>
            </div>
            <div className="flex items-center gap-2 text-blue-700">
              <FiClock className="w-4 h-4 animate-spin" />
              <span>Operations Desk Verification (Avg. 24 hours)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center text-[10px]">3</span>
              <span>Credit Line & SLA Counter-Signature</span>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-center gap-3">
          <Link
            to="/b2b/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Final Verification & Application Submission</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Ensure all prerequisite sections are fulfilled before submitting your profile for approval.
        </p>
      </div>

      {/* Prerequisites Checklist */}
      <div className="p-5 rounded-2xl border border-gray-200 bg-white space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Submission Readiness Checklist
        </h3>

        <div className="space-y-2">
          {checks.map((c, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                c.ok
                  ? 'border-emerald-200 bg-emerald-50/30 text-emerald-900'
                  : 'border-amber-200 bg-amber-50/30 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  c.ok ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {c.ok ? <FiCheck className="w-3 h-3 stroke-[3]" /> : '!'}
                </div>
                <span className="font-semibold">{c.label}</span>
              </div>
              <span className="text-[11px] font-bold">
                {c.ok ? 'Completed' : 'Required'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Information Alert */}
      <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex items-start gap-3">
        <FiShield className="w-5 h-5 text-[#10AFA5] shrink-0 mt-0.5" />
        <p className="text-xs text-teal-900 leading-relaxed">
          <strong>Next Steps After Submission:</strong> Our operations team reviews corporate profiles within 24 business hours. You will receive an automated notification and email once your credit line and service ticketing panel are activated.
        </p>
      </div>

      {/* Final Submit Button */}
      <div className="pt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevious}
          className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          Previous Step
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || !allPassed}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-lg shadow-emerald-600/20 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? (
            <FiLoader className="w-4 h-4 animate-spin" />
          ) : (
            <FiSend className="w-4 h-4" />
          )}
          {saving ? 'Submitting Application...' : 'Submit Enterprise Application'}
        </button>
      </div>
    </div>
  );
}
