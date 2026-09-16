import React from 'react';
import ScoreCard from '../components/ScoreCard';
import StepActions from '../components/StepActions';
import { 
  FiEdit2, FiCheckCircle, FiBriefcase, FiMapPin, 
  FiUser, FiDollarSign, FiLayers, FiCreditCard, 
  FiFileText, FiClock 
} from 'react-icons/fi';

export default function Step15Review({
  onboarding = {},
  company = {},
  documents = [],
  branches = [],
  onGoToStep,
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const o = onboarding || {};
  const ci = o.companyInfo || {};
  const addr = o.addresses || {};
  const pc = o.primaryContact || {};
  const fc = o.financeContact || {};
  const sr = o.serviceRequirements || {};
  const bk = o.banking || {};
  const cp = o.creditProfile || {};
  const sla = o.slaConfig || {};

  const handleContinue = () => {
    onSave(15, { reviewed: true }, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(15, { reviewed: true }, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Application Summary & Pre-Submission Review</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Review all entered enterprise data prior to final submission for operations review.
        </p>
      </div>

      {/* Profile Readiness & Risk Analytics Card */}
      <ScoreCard onboarding={onboarding} documents={documents} />

      {/* Review Sections Grid */}
      <div className="space-y-4">
        {/* Section 1: Company Profile */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <FiBriefcase className="w-4 h-4 text-[#10AFA5]" />
              <h3 className="text-sm font-bold text-gray-900">1. Company Profile</h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep(1)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#10AFA5] hover:underline"
            >
              <FiEdit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block">Legal Name</span>
              <span className="font-semibold text-gray-800">{ci.legalName || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block">GSTIN</span>
              <span className="font-semibold text-gray-800 font-mono">{ci.gstNumber || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block">PAN</span>
              <span className="font-semibold text-gray-800 font-mono">{ci.panNumber || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Constitution</span>
              <span className="font-semibold text-gray-800">{ci.companyType || '—'}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Addresses */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <FiMapPin className="w-4 h-4 text-[#10AFA5]" />
              <h3 className="text-sm font-bold text-gray-900">2. Addresses</h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep(2)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#10AFA5] hover:underline"
            >
              <FiEdit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block">Registered Office</span>
              <span className="font-semibold text-gray-800">{addr.registered || addr.registeredAddress || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Billing Address</span>
              <span className="font-semibold text-gray-800">{addr.billingAddress || addr.registered || '—'}</span>
            </div>
          </div>
        </div>

        {/* Section 3 & 4: Contacts */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <FiUser className="w-4 h-4 text-[#10AFA5]" />
              <h3 className="text-sm font-bold text-gray-900">3 & 4. Authorized Representatives</h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep(3)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#10AFA5] hover:underline"
            >
              <FiEdit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block">Primary Contact</span>
              <span className="font-semibold text-gray-800">{pc.name || '—'}</span>
              <span className="text-gray-500 block">{pc.designation} • {pc.email} • {pc.phone}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Finance Contact</span>
              <span className="font-semibold text-gray-800">{fc.name || '—'}</span>
              <span className="text-gray-500 block">{fc.designation} • {fc.email} • {fc.phone}</span>
            </div>
          </div>
        </div>

        {/* Section 5: Services & Branches */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <FiLayers className="w-4 h-4 text-[#10AFA5]" />
              <h3 className="text-sm font-bold text-gray-900">5 & 6. Scope & Hubs</h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep(5)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#10AFA5] hover:underline"
            >
              <FiEdit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block">Services Selected</span>
              <span className="font-semibold text-gray-800">
                {(sr.selectedServices || []).length} Categories selected
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">Regional Branches</span>
              <span className="font-semibold text-gray-800">
                {branches.length} Sites configured
              </span>
            </div>
          </div>
        </div>

        {/* Section 7 & 8: Banking & Credit */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <FiCreditCard className="w-4 h-4 text-[#10AFA5]" />
              <h3 className="text-sm font-bold text-gray-900">7 & 8. Banking & Commercials</h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep(7)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#10AFA5] hover:underline"
            >
              <FiEdit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-400 block">Bank Account</span>
              <span className="font-semibold text-gray-800 font-mono">
                {bk.accountNumber ? `••••${String(bk.accountNumber).slice(-4)}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">IFSC</span>
              <span className="font-semibold text-gray-800 font-mono">{bk.ifsc || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block">Requested Credit</span>
              <span className="font-semibold text-gray-800">
                {cp.requestedLimit ? `₹${Number(cp.requestedLimit).toLocaleString('en-IN')}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">SLA Tier</span>
              <span className="font-semibold text-gray-800 uppercase">{sla.slaTier || 'Gold'}</span>
            </div>
          </div>
        </div>

        {/* Section 14: Documents */}
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <FiFileText className="w-4 h-4 text-[#10AFA5]" />
              <h3 className="text-sm font-bold text-gray-900">14. Uploaded Certificates</h3>
            </div>
            <button
              type="button"
              onClick={() => onGoToStep(14)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#10AFA5] hover:underline"
            >
              <FiEdit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {documents.map((d) => (
              <div key={d._id} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-between">
                <span className="truncate font-medium text-gray-800">{d.documentLabel || d.documentType}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  d.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <StepActions
        currentStep={15}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
