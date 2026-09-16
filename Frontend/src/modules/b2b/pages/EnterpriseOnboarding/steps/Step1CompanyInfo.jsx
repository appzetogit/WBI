import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import VerifyButton from '../components/VerifyButton';
import StepActions from '../components/StepActions';
import { validateStep } from '../hooks/useStepValidation';
import { FiBriefcase, FiGlobe, FiCalendar, FiDollarSign } from 'react-icons/fi';

const COMPANY_TYPES = [
  { value: 'Private Limited', label: 'Private Limited (Pvt Ltd)' },
  { value: 'Public Limited', label: 'Public Limited (Ltd)' },
  { value: 'LLP', label: 'Limited Liability Partnership (LLP)' },
  { value: 'Partnership', label: 'Partnership Firm' },
  { value: 'Sole Proprietorship', label: 'Sole Proprietorship' }
];

export default function Step1CompanyInfo({
  data = {},
  kycFlags = {},
  onSave,
  onNext,
  onPrevious,
  onVerifyGst,
  onVerifyPan,
  onVerifyCin,
  saving = false
}) {
  const [formData, setFormData] = useState({
    legalName: '',
    tradeName: '',
    companyType: 'Private Limited',
    gstNumber: '',
    panNumber: '',
    cin: '',
    incorporationDate: '',
    website: '',
    annualTurnover: '',
    ...data
  });

  const [verifyingGst, setVerifyingGst] = useState(false);
  const [verifyingPan, setVerifyingPan] = useState(false);
  const [verifyingCin, setVerifyingCin] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleGstVerify = async () => {
    if (!formData.gstNumber) {
      setErrors((prev) => ({ ...prev, gstNumber: 'Enter GSTIN to verify' }));
      return;
    }
    setVerifyingGst(true);
    try {
      const res = await onVerifyGst(formData.gstNumber);
      if (res.success && res.data) {
        // Auto populate fields from verified GST data
        const profile = res.data.profile || res.data.fields || {};
        setFormData((prev) => ({
          ...prev,
          tradeName: prev.tradeName || profile.tradeNam || profile.tradeName || '',
          legalName: prev.legalName || profile.lgnm || profile.legalName || '',
          panNumber: prev.panNumber || formData.gstNumber.substring(2, 12)
        }));
      }
    } finally {
      setVerifyingGst(false);
    }
  };

  const handlePanVerify = async () => {
    if (!formData.panNumber) {
      setErrors((prev) => ({ ...prev, panNumber: 'Enter PAN to verify' }));
      return;
    }
    setVerifyingPan(true);
    try {
      await onVerifyPan(formData.panNumber);
    } finally {
      setVerifyingPan(false);
    }
  };

  const handleCinVerify = async () => {
    if (!formData.cin) {
      setErrors((prev) => ({ ...prev, cin: 'Enter CIN to verify' }));
      return;
    }
    setVerifyingCin(true);
    try {
      await onVerifyCin(formData.cin);
    } finally {
      setVerifyingCin(false);
    }
  };

  const handleContinue = () => {
    const { isValid, errors: validationErrors } = validateStep(1, formData);
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }
    onSave(1, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(1, formData, { advance: false });
  };

  const gstStatus = kycFlags?.gst?.status;
  const panStatus = kycFlags?.pan?.status;
  const cinStatus = kycFlags?.cin?.status;

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Company Identity & Legal Details</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Enter verified corporate credentials for enterprise account approval.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Legal Business Name"
          name="legalName"
          value={formData.legalName}
          onChange={handleChange}
          required
          placeholder="e.g. Acme Technologies India Private Limited"
          error={errors.legalName}
          icon={FiBriefcase}
        />

        <FormField
          label="Trade / Brand Name"
          name="tradeName"
          value={formData.tradeName}
          onChange={handleChange}
          placeholder="e.g. Acme Tech"
          icon={FiBriefcase}
          helperText="Doing business as / trade name"
        />

        <FormField
          label="Company Constitution"
          name="companyType"
          type="select"
          value={formData.companyType}
          onChange={handleChange}
          options={COMPANY_TYPES}
          required
        />

        <FormField
          label="GSTIN (Goods & Services Tax Number)"
          name="gstNumber"
          value={formData.gstNumber}
          onChange={(e) => handleChange({ target: { name: 'gstNumber', value: e.target.value.toUpperCase() } })}
          required
          placeholder="22AAAAA0000A1Z5"
          error={errors.gstNumber}
          action={
            <VerifyButton
              status={gstStatus}
              loading={verifyingGst}
              onClick={handleGstVerify}
              label="Verify GST"
            />
          }
        />

        <FormField
          label="Permanent Account Number (PAN)"
          name="panNumber"
          value={formData.panNumber}
          onChange={(e) => handleChange({ target: { name: 'panNumber', value: e.target.value.toUpperCase() } })}
          required
          placeholder="ABCDE1234F"
          error={errors.panNumber}
          action={
            <VerifyButton
              status={panStatus}
              loading={verifyingPan}
              onClick={handlePanVerify}
              label="Verify PAN"
            />
          }
        />

        <FormField
          label="Corporate Identification Number (CIN)"
          name="cin"
          value={formData.cin}
          onChange={(e) => handleChange({ target: { name: 'cin', value: e.target.value.toUpperCase() } })}
          placeholder="U72200MH2021PTC123456"
          error={errors.cin}
          helperText="Required for Pvt Ltd and Public Ltd companies"
          action={
            formData.cin ? (
              <VerifyButton
                status={cinStatus}
                loading={verifyingCin}
                onClick={handleCinVerify}
                label="Verify CIN"
              />
            ) : null
          }
        />

        <FormField
          label="Date of Incorporation"
          name="incorporationDate"
          type="date"
          value={formData.incorporationDate ? formData.incorporationDate.split('T')[0] : ''}
          onChange={handleChange}
          icon={FiCalendar}
        />

        <FormField
          label="Company Website"
          name="website"
          type="url"
          value={formData.website}
          onChange={handleChange}
          placeholder="https://acme.com"
          icon={FiGlobe}
        />

        <div className="md:col-span-2">
          <FormField
            label="Annual Turnover Range"
            name="annualTurnover"
            value={formData.annualTurnover}
            onChange={handleChange}
            placeholder="e.g. ₹10 Cr - ₹50 Cr"
            icon={FiDollarSign}
            helperText="Helps determine appropriate credit limits and payment terms"
          />
        </div>
      </div>

      <StepActions
        currentStep={1}
        isFirstStep={true}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
