import React from 'react';
import { FiCheckCircle, FiClock, FiAlertTriangle, FiShield, FiFileText } from 'react-icons/fi';

export default function OnboardingHeader({
  currentStep,
  totalSteps = 16,
  company = {},
  onboarding = {},
  stepCompletion = {}
}) {
  const lifecycleStatus = onboarding?.lifecycleStatus || 'draft';
  const legalName = onboarding?.companyInfo?.legalName || company?.companyName || 'Enterprise Partner';

  // Count completed steps
  let completedCount = 0;
  for (let s = 1; s <= totalSteps; s++) {
    const info = stepCompletion[String(s)] || stepCompletion[s];
    if (info?.completed) completedCount++;
  }
  const progressPercent = Math.min(Math.round((completedCount / totalSteps) * 100), 100);

  const getStatusBadge = () => {
    switch (lifecycleStatus) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <FiCheckCircle className="w-3.5 h-3.5" /> Activated
          </span>
        );
      case 'submitted':
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <FiClock className="w-3.5 h-3.5" /> Under Review
          </span>
        );
      case 'action_required':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <FiAlertTriangle className="w-3.5 h-3.5" /> Action Required
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <FiAlertTriangle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
            <FiFileText className="w-3.5 h-3.5" /> Draft In Progress
          </span>
        );
    }
  };

  return (
    <div className="bg-white border-b border-[#E6F4F2] px-6 py-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Enterprise Onboarding
            </h1>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">{legalName}</span>
            <span>•</span>
            <span>Step {currentStep} of {totalSteps}</span>
          </p>
        </div>

        {/* Progress meter */}
        <div className="flex items-center gap-4 sm:w-64">
          <div className="flex-1">
            <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
              <span>Completion</span>
              <span className="text-[#10AFA5]">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#10AFA5] h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="text-xs font-medium text-gray-400 shrink-0">
            {completedCount}/{totalSteps} steps
          </div>
        </div>
      </div>
    </div>
  );
}
