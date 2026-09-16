import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { FiClock, FiCheckCircle, FiEdit3, FiShield, FiLoader } from 'react-icons/fi';

export default function Step10Sla({
  data = {},
  onSave,
  onNext,
  onPrevious,
  onSignSla,
  saving = false
}) {
  const [formData, setFormData] = useState({
    criticalResponseHours: '4',
    standardTurnaroundHours: '24',
    ppmFrequency: 'quarterly',
    slaTier: 'gold',
    slaSigned: false,
    signedBy: '',
    signedAt: null,
    signerDesignation: '',
    ...data
  });

  const [signing, setSigning] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signerInfo, setSignerInfo] = useState({ name: '', designation: '' });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSignConfirm = async (e) => {
    e.preventDefault();
    if (!signerInfo.name || !signerInfo.designation) return;
    setSigning(true);
    try {
      const res = await onSignSla(signerInfo.name, signerInfo.designation);
      if (res.success) {
        setFormData((prev) => ({
          ...prev,
          slaSigned: true,
          signedBy: signerInfo.name,
          signerDesignation: signerInfo.designation,
          signedAt: new Date().toISOString()
        }));
        setShowSignModal(false);
      }
    } finally {
      setSigning(false);
    }
  };

  const handleContinue = () => {
    onSave(10, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(10, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Service Level Agreement (SLA) Matrix</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Select contractually binding on-site response times and execute the digital service agreement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Enterprise SLA Tier"
          name="slaTier"
          type="select"
          value={formData.slaTier}
          onChange={handleChange}
          options={[
            { value: 'platinum', label: 'Platinum 24x7 Mission Critical (2-hr on-site)' },
            { value: 'gold', label: 'Gold Business Critical (4-hr response / 24-hr resolution)' },
            { value: 'silver', label: 'Silver Standard (Next Business Day / 48-hr resolution)' }
          ]}
          icon={FiShield}
        />

        <FormField
          label="Critical Ticket First Response Time"
          name="criticalResponseHours"
          type="select"
          value={formData.criticalResponseHours}
          onChange={handleChange}
          options={[
            { value: '2', label: 'Within 2 Hours (Urgent Outage)' },
            { value: '4', label: 'Within 4 Hours (High Priority)' },
            { value: '8', label: 'Within 8 Hours (Same Day)' }
          ]}
          icon={FiClock}
        />

        <FormField
          label="Standard Request Resolution Target"
          name="standardTurnaroundHours"
          type="select"
          value={formData.standardTurnaroundHours}
          onChange={handleChange}
          options={[
            { value: '24', label: 'Within 24 Hours' },
            { value: '48', label: 'Within 48 Hours' },
            { value: '72', label: 'Within 72 Hours' }
          ]}
          icon={FiClock}
        />

        <FormField
          label="Planned Preventive Maintenance (PPM) Schedule"
          name="ppmFrequency"
          type="select"
          value={formData.ppmFrequency}
          onChange={handleChange}
          options={[
            { value: 'monthly', label: 'Monthly Audits & Health Checks' },
            { value: 'quarterly', label: 'Quarterly Routine Servicing' },
            { value: 'biannual', label: 'Bi-Annual Comprehensive Audit' }
          ]}
        />
      </div>

      {/* Digital SLA Signing Box */}
      <div className="p-5 rounded-2xl border border-gray-200 bg-gray-50/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiEdit3 className="w-5 h-5 text-[#10AFA5]" />
            <h3 className="text-sm font-bold text-gray-900">Master Service Level Agreement Signature</h3>
          </div>
          {formData.slaSigned && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              <FiCheckCircle className="w-3.5 h-3.5" /> E-Signed & Valid
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          By e-signing, you agree to the platform terms of service, uptime warranties, and standardized engineer dispatch rate cards.
        </p>

        {formData.slaSigned ? (
          <div className="p-3 bg-white rounded-xl border border-emerald-200 flex items-center justify-between text-xs text-gray-700">
            <div>
              <p className="font-semibold text-emerald-800">Digitally executed by {formData.signedBy}</p>
              <p className="text-[11px] text-gray-400">
                Designation: {formData.signerDesignation} • Timestamp: {formData.signedAt ? new Date(formData.signedAt).toLocaleString() : 'Executed'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSignModal(true)}
              className="text-xs text-[#10AFA5] font-semibold hover:underline"
            >
              Re-sign
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSignModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10AFA5] text-white text-xs font-bold hover:bg-[#0d8f87] transition-all shadow-md shadow-[#10AFA5]/20 cursor-pointer"
          >
            <FiEdit3 className="w-4 h-4" /> E-Sign SLA Contract Now
          </button>
        )}
      </div>

      <StepActions
        currentStep={10}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />

      {/* SLA Sign Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-2">Sign Master Service Agreement</h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter the authorized signatory details for contract generation.
            </p>

            <form onSubmit={handleSignConfirm} className="space-y-4">
              <FormField
                label="Signatory Full Name"
                name="name"
                value={signerInfo.name}
                onChange={(e) => setSignerInfo({ ...signerInfo, name: e.target.value })}
                required
                placeholder="e.g. Vikram Sharma"
              />

              <FormField
                label="Corporate Designation"
                name="designation"
                value={signerInfo.designation}
                onChange={(e) => setSignerInfo({ ...signerInfo, designation: e.target.value })}
                required
                placeholder="e.g. Managing Director"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={signing || !signerInfo.name || !signerInfo.designation}
                  className="flex-1 py-2.5 rounded-xl bg-[#10AFA5] text-white text-xs font-bold hover:bg-[#0d8f87] disabled:bg-gray-200 flex items-center justify-center gap-1.5"
                >
                  {signing && <FiLoader className="w-3.5 h-3.5 animate-spin" />}
                  {signing ? 'Signing...' : 'Confirm E-Signature'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
