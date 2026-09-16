import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { FiShield, FiLock, FiClock } from 'react-icons/fi';

const ESCROW_MODELS = [
  { value: 'completion_release', label: '100% Release upon QA sign-off and completion' },
  { value: 'milestone_split', label: 'Milestone: 30% on technician check-in, 70% on final sign-off' },
  { value: 'weekly_batch', label: 'Consolidated weekly batch settlement' }
];

export default function Step9Payments({
  data = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    escrowModel: 'completion_release',
    autoReleaseHours: '48',
    disputeWindowDays: '7',
    preferredPaymentGateway: 'virtual_account_neft',
    ...data
  });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleContinue = () => {
    onSave(9, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(9, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Escrow & Job Settlement Protocol</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Establish automated funds lock, milestone disbursals, and contractor sign-off controls.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Escrow Disbursal Model"
          name="escrowModel"
          type="select"
          value={formData.escrowModel}
          onChange={handleChange}
          options={ESCROW_MODELS}
          icon={FiLock}
        />

        <FormField
          label="Auto-Release Timeout (Hours)"
          name="autoReleaseHours"
          type="select"
          value={formData.autoReleaseHours}
          onChange={handleChange}
          options={[
            { value: '24', label: '24 Hours after site engineer submits job proof' },
            { value: '48', label: '48 Hours standard grace period' },
            { value: '72', label: '72 Hours extended audit window' }
          ]}
          icon={FiClock}
          helperText="Funds automatically clear unless disputed by your branch manager"
        />

        <FormField
          label="Dispute Filing Grace Window"
          name="disputeWindowDays"
          type="select"
          value={formData.disputeWindowDays}
          onChange={handleChange}
          options={[
            { value: '3', label: '3 Days after job completion' },
            { value: '7', label: '7 Days standard dispute window' },
            { value: '14', label: '14 Days enterprise audit window' }
          ]}
          icon={FiShield}
        />

        <FormField
          label="Preferred Settlement Rails"
          name="preferredPaymentGateway"
          type="select"
          value={formData.preferredPaymentGateway}
          onChange={handleChange}
          options={[
            { value: 'virtual_account_neft', label: 'Dedicated Virtual Account (NEFT/RTGS Auto-credit)' },
            { value: 'corporate_card', label: 'Corporate Credit Card / P-Card' },
            { value: 'standing_instruction', label: 'Automated NACH / e-Mandate Debit' }
          ]}
        />
      </div>

      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
        <FiLock className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-700 leading-relaxed">
          <strong>Smart Escrow Protection:</strong> Client funds remain locked in an RBI-compliant nodal account until field work is digitally verified via OTP or geo-tagged photograph by your facility supervisor.
        </p>
      </div>

      <StepActions
        currentStep={9}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
