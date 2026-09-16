import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { FiTrendingUp, FiShield, FiDollarSign } from 'react-icons/fi';

const CREDIT_TERMS = [
  { value: 'prepaid', label: '100% Advance / Wallet Escrow (Zero Security Deposit)' },
  { value: 'net_15', label: 'Net 15 Days Credit (Post-ticket completion)' },
  { value: 'net_30', label: 'Net 30 Days Credit (Standard Enterprise)' },
  { value: 'net_45', label: 'Net 45 Days Credit (Enterprise Tier 1)' }
];

export default function Step8Credit({
  data = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    requestedLimit: '500000',
    preferredTerms: 'net_30',
    securityDepositPreference: 'wallet_escrow',
    creditRating: '',
    ratingAgency: '',
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
    onSave(8, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(8, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Enterprise Credit Line & Payment Terms</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Configure preferred billing cycles, post-paid terms, and revolving service limits.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Requested Monthly Revolving Credit Limit (₹)"
          name="requestedLimit"
          type="number"
          value={formData.requestedLimit}
          onChange={handleChange}
          placeholder="e.g. 1000000"
          icon={FiDollarSign}
          helperText="Approved limit is determined based on financial docs and credit appraisal"
        />

        <FormField
          label="Preferred Payment Terms"
          name="preferredTerms"
          type="select"
          value={formData.preferredTerms}
          onChange={handleChange}
          options={CREDIT_TERMS}
        />

        <FormField
          label="Security Backing Instrument"
          name="securityDepositPreference"
          type="select"
          value={formData.securityDepositPreference}
          onChange={handleChange}
          options={[
            { value: 'wallet_escrow', label: 'Revolving Escrow Wallet (Auto-debited)' },
            { value: 'bank_guarantee', label: 'Bank Guarantee (BG / SBLC)' },
            { value: 'corporate_pdc', label: 'Corporate Post-Dated Cheque (PDC)' },
            { value: 'none', label: 'Unsecured Credit Line (Requires Tier 1 Audit)' }
          ]}
          icon={FiShield}
        />

        <FormField
          label="External Credit Rating (If any)"
          name="creditRating"
          value={formData.creditRating}
          onChange={handleChange}
          placeholder="e.g. CRISIL BBB+ / ICRA A"
          icon={FiTrendingUp}
          helperText="CRISIL, ICRA, CARE, or Dun & Bradstreet rating"
        />
      </div>

      <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-start gap-3">
        <FiTrendingUp className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 leading-relaxed">
          <strong>Approval Guidelines:</strong> Revolving credit lines exceeding ₹10,00,000 require audited balance sheets for the last 2 financial years or an active Bank Guarantee.
        </p>
      </div>

      <StepActions
        currentStep={8}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
