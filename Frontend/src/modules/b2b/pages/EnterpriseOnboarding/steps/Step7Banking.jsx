import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import VerifyButton from '../components/VerifyButton';
import StepActions from '../components/StepActions';
import { validateStep } from '../hooks/useStepValidation';
import { FiCreditCard, FiHome } from 'react-icons/fi';

const ACCOUNT_TYPES = [
  { value: 'Current', label: 'Current Account (Corporate)' },
  { value: 'Savings', label: 'Savings Account' },
  { value: 'Overdraft', label: 'Overdraft / Cash Credit' }
];

export default function Step7Banking({
  data = {},
  kycFlags = {},
  onSave,
  onNext,
  onPrevious,
  onVerifyBank,
  saving = false
}) {
  const [formData, setFormData] = useState({
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: '',
    bankName: '',
    branchName: '',
    accountType: 'Current',
    ...data
  });

  const [verifyingBank, setVerifyingBank] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...data,
        confirmAccountNumber: data.accountNumber || prev.confirmAccountNumber
      }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleBankVerify = async () => {
    if (!formData.accountNumber) {
      setErrors((prev) => ({ ...prev, accountNumber: 'Enter account number' }));
      return;
    }
    if (!formData.ifsc) {
      setErrors((prev) => ({ ...prev, ifsc: 'Enter IFSC code' }));
      return;
    }
    setVerifyingBank(true);
    try {
      const res = await onVerifyBank(formData.accountNumber, formData.ifsc);
      if (res.success && res.data) {
        const verifiedInfo = res.data.profile || res.data || {};
        if (verifiedInfo.registeredName || verifiedInfo.beneficiaryName) {
          setFormData((prev) => ({
            ...prev,
            accountHolderName: verifiedInfo.registeredName || verifiedInfo.beneficiaryName
          }));
        }
      }
    } finally {
      setVerifyingBank(false);
    }
  };

  const handleContinue = () => {
    if (formData.accountNumber !== formData.confirmAccountNumber) {
      setErrors((prev) => ({ ...prev, confirmAccountNumber: 'Account numbers do not match' }));
      return;
    }
    const { isValid, errors: valErrors } = validateStep(7, formData);
    if (!isValid) {
      setErrors(valErrors);
      return;
    }
    onSave(7, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(7, formData, { advance: false });
  };

  const bankStatus = kycFlags?.bank?.status;

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Corporate Bank & Settlement Account</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Linked bank account for escrow security deposits, service payouts, and refund settlements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Account Beneficiary Name"
          name="accountHolderName"
          value={formData.accountHolderName}
          onChange={handleChange}
          required
          placeholder="e.g. Acme Technologies India Pvt Ltd"
          error={errors.accountHolderName}
          icon={FiHome}
          helperText="Must match the registered legal business name"
        />

        <FormField
          label="Account Type"
          name="accountType"
          type="select"
          value={formData.accountType}
          onChange={handleChange}
          options={ACCOUNT_TYPES}
        />

        <FormField
          label="Bank Account Number"
          name="accountNumber"
          value={formData.accountNumber}
          onChange={handleChange}
          required
          placeholder="e.g. 50200012345678"
          error={errors.accountNumber}
          icon={FiCreditCard}
        />

        <FormField
          label="Confirm Account Number"
          name="confirmAccountNumber"
          value={formData.confirmAccountNumber}
          onChange={handleChange}
          required
          placeholder="Re-enter bank account number"
          error={errors.confirmAccountNumber}
          icon={FiCreditCard}
        />

        <FormField
          label="Bank IFSC Code"
          name="ifsc"
          value={formData.ifsc}
          onChange={(e) => handleChange({ target: { name: 'ifsc', value: e.target.value.toUpperCase() } })}
          required
          placeholder="e.g. HDFC0001234"
          error={errors.ifsc}
          action={
            <VerifyButton
              status={bankStatus}
              loading={verifyingBank}
              onClick={handleBankVerify}
              label="Penny Drop Verify"
            />
          }
        />

        <FormField
          label="Bank & Branch Name"
          name="bankName"
          value={formData.bankName}
          onChange={handleChange}
          placeholder="e.g. HDFC Bank, BKC Mumbai"
        />
      </div>

      <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-100 flex items-start gap-3">
        <FiCreditCard className="w-5 h-5 text-[#10AFA5] shrink-0 mt-0.5" />
        <p className="text-xs text-teal-900 leading-relaxed">
          <strong className="font-semibold">Security Note:</strong> We use an automated RBI-authorized penny-drop check to match account details against your GSTIN records. Bank data is 256-bit encrypted in accordance with ISO 27001 data compliance.
        </p>
      </div>

      <StepActions
        currentStep={7}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
