import React, { useState, useEffect } from 'react';
import StepActions from '../components/StepActions';
import { FiCheckSquare, FiShield, FiFileText } from 'react-icons/fi';

const POLICIES = [
  {
    key: 'laborCompliance',
    title: 'Statutory Labour & Minimum Wages Compliance',
    desc: 'Confirmation that all deployed technicians and contracted service teams adhere to state Minimum Wages, PF, and ESI acts.'
  },
  {
    key: 'safetyStandards',
    title: 'Occupational Health & Environmental Safety (EHS)',
    desc: 'Commitment to zero-accident workplace safety protocols, PPE usage on industrial sites, and electrical hazard safety.'
  },
  {
    key: 'antiBribery',
    title: 'Anti-Bribery & Ethical Conduct Policy',
    desc: 'Strict prohibition of unauthorized facilitation payments, gifts, or kickbacks in procurement and billing interactions.'
  },
  {
    key: 'dataPrivacy',
    title: 'Information Security & DPDP Act Adherence',
    desc: 'Protection of enterprise facility schematics, customer access credentials, and CCTV footage under the Digital Personal Data Protection Act.'
  }
];

export default function Step13Compliance({
  data = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    laborCompliance: true,
    safetyStandards: true,
    antiBribery: true,
    dataPrivacy: true,
    declarationAccepted: true,
    ...data
  });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const togglePolicy = (key) => {
    setFormData((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allAccepted = POLICIES.every((p) => formData[p.key]) && formData.declarationAccepted;

  const handleContinue = () => {
    onSave(13, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(13, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Statutory Governance & Compliance Declarations</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Enterprise verification requires explicit attestation to national regulatory standards.
        </p>
      </div>

      <div className="space-y-3">
        {POLICIES.map((p) => {
          const checked = !!formData[p.key];
          return (
            <div
              key={p.key}
              onClick={() => togglePolicy(p.key)}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                checked
                  ? 'border-[#10AFA5] bg-[#E6F4F2]/20'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {}}
                className="mt-1 w-4 h-4 rounded text-[#10AFA5] focus:ring-[#10AFA5] border-gray-300 pointer-events-none"
              />
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-gray-800">{p.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-xl bg-slate-900 text-white flex items-start gap-3 mt-4">
        <FiShield className="w-5 h-5 text-[#10AFA5] shrink-0 mt-0.5" />
        <label className="text-xs text-slate-300 leading-relaxed cursor-pointer">
          <input
            type="checkbox"
            checked={formData.declarationAccepted}
            onChange={(e) => setFormData((prev) => ({ ...prev, declarationAccepted: e.target.checked }))}
            className="mr-2 w-4 h-4 rounded text-[#10AFA5] focus:ring-[#10AFA5]"
          />
          I hereby certify and declare on behalf of the organization that all information, tax identifiers, and documents provided herein are authentic, legally valid, and compliant with prevailing Indian legislation.
        </label>
      </div>

      <StepActions
        currentStep={13}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        canContinue={allAccepted}
        saving={saving}
      />
    </div>
  );
}
