import React from 'react';
import { 
  FiBriefcase, FiMapPin, FiUser, FiDollarSign, 
  FiLayers, FiGlobe, FiCreditCard, FiTrendingUp, 
  FiShield, FiClock, FiUsers, FiBox, 
  FiCheckSquare, FiFileText, FiEye, FiSend,
  FiCheck
} from 'react-icons/fi';

const PHASES = [
  {
    id: 'identity',
    title: 'Identity & Contacts',
    steps: [
      { num: 1, title: 'Company Profile', icon: FiBriefcase },
      { num: 2, title: 'Addresses', icon: FiMapPin },
      { num: 3, title: 'Primary Contact', icon: FiUser },
      { num: 4, title: 'Finance Contact', icon: FiDollarSign }
    ]
  },
  {
    id: 'operations',
    title: 'Operations & Scope',
    steps: [
      { num: 5, title: 'Service Portfolio', icon: FiLayers },
      { num: 6, title: 'Coverage & Branches', icon: FiGlobe }
    ]
  },
  {
    id: 'commercials',
    title: 'Commercials & Governance',
    steps: [
      { num: 7, title: 'Bank Account', icon: FiCreditCard },
      { num: 8, title: 'Credit Profile', icon: FiTrendingUp },
      { num: 9, title: 'Escrow & Payments', icon: FiShield },
      { num: 10, title: 'SLA Configuration', icon: FiClock },
      { num: 11, title: 'Approval Hierarchy', icon: FiUsers },
      { num: 12, title: 'Bulk Project Rules', icon: FiBox },
      { num: 13, title: 'Compliance & Policies', icon: FiCheckSquare }
    ]
  },
  {
    id: 'kyc_submit',
    title: 'KYC & Submission',
    steps: [
      { num: 14, title: 'KYC & Documents', icon: FiFileText },
      { num: 15, title: 'Review Application', icon: FiEye },
      { num: 16, title: 'Final Submission', icon: FiSend }
    ]
  }
];

export default function OnboardingSidebar({
  currentStep,
  onSelectStep,
  stepCompletion = {}
}) {
  return (
    <aside className="w-full lg:w-72 bg-white border-r border-[#E6F4F2] flex flex-col shrink-0 h-full overflow-y-auto scrollbar-hide py-6 px-4">
      <div className="space-y-6">
        {PHASES.map((phase) => (
          <div key={phase.id} className="space-y-1.5">
            <h3 className="px-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {phase.title}
            </h3>

            <div className="space-y-1">
              {phase.steps.map((step) => {
                const isActive = currentStep === step.num;
                const comp = stepCompletion[String(step.num)] || stepCompletion[step.num];
                const isCompleted = comp?.completed;
                const Icon = step.icon;

                return (
                  <button
                    key={step.num}
                    type="button"
                    onClick={() => onSelectStep(step.num)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                      isActive
                        ? 'bg-[#10AFA5] text-white shadow-md shadow-[#10AFA5]/20 font-bold'
                        : isCompleted
                        ? 'bg-emerald-50/40 text-gray-800 hover:bg-emerald-50'
                        : 'text-gray-600 hover:bg-[#F0FDFA] hover:text-[#10AFA5]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs transition-colors ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : isCompleted
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500 group-hover:bg-[#E6F4F2] group-hover:text-[#10AFA5]'
                      }`}>
                        {isCompleted && !isActive ? (
                          <FiCheck className="w-4 h-4 stroke-[3]" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className="text-xs truncate font-medium">
                        {step.num}. {step.title}
                      </span>
                    </div>

                    {isCompleted && !isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
