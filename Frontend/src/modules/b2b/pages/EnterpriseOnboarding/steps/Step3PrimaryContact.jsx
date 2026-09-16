import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import VerifyButton from '../components/VerifyButton';
import OtpModal from '../components/OtpModal';
import StepActions from '../components/StepActions';
import { validateStep } from '../hooks/useStepValidation';
import { FiUser, FiMail, FiPhone, FiBriefcase } from 'react-icons/fi';

export default function Step3PrimaryContact({
  data = {},
  onSave,
  onNext,
  onPrevious,
  onSendOtp,
  onConfirmOtp,
  saving = false
}) {
  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    email: '',
    phone: '',
    altPhone: '',
    emailVerified: false,
    phoneVerified: false,
    ...data
  });

  const [errors, setErrors] = useState({});
  const [otpModal, setOtpModal] = useState({
    open: false,
    channel: 'email',
    target: '',
    token: ''
  });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...data,
        phone: data.phone || data.mobile || prev.phone
      }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleTriggerOtp = async (channel) => {
    const target = channel === 'email' ? formData.email : formData.phone;
    if (!target) {
      setErrors((prev) => ({
        ...prev,
        [channel]: `Please enter ${channel} to send verification code`
      }));
      return;
    }
    const res = await onSendOtp(channel, target, 'primary');
    if (res.success) {
      setOtpModal({
        open: true,
        channel,
        target,
        token: res.token
      });
    }
  };

  const handleConfirmOtpModal = async (otp) => {
    const res = await onConfirmOtp(
      otpModal.channel,
      otpModal.target,
      otp,
      otpModal.token,
      'primary'
    );
    if (res.success) {
      if (otpModal.channel === 'email') {
        setFormData((prev) => ({ ...prev, emailVerified: true }));
      } else {
        setFormData((prev) => ({ ...prev, phoneVerified: true }));
      }
    }
  };

  const handleContinue = () => {
    const { isValid, errors: valErrors } = validateStep(3, formData);
    if (!isValid) {
      setErrors(valErrors);
      return;
    }
    onSave(3, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(3, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Primary Authorized Representative</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          This person will hold master administrative privileges and sign platform agreements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Full Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="e.g. Vikram Sharma"
          error={errors.name}
          icon={FiUser}
        />

        <FormField
          label="Designation / Role"
          name="designation"
          value={formData.designation}
          onChange={handleChange}
          placeholder="e.g. VP Operations / Director"
          icon={FiBriefcase}
        />

        <FormField
          label="Official Email Address"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="vikram@acme.com"
          error={errors.email}
          icon={FiMail}
          action={
            <VerifyButton
              status={formData.emailVerified ? 'verified' : 'unverified'}
              onClick={() => handleTriggerOtp('email')}
              label="Verify Email"
            />
          }
        />

        <FormField
          label="Mobile Phone Number"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          required
          placeholder="9876543210"
          error={errors.phone}
          icon={FiPhone}
          action={
            <VerifyButton
              status={formData.phoneVerified ? 'verified' : 'unverified'}
              onClick={() => handleTriggerOtp('sms')}
              label="Verify Mobile"
            />
          }
        />

        <div className="md:col-span-2">
          <FormField
            label="Alternate Contact Number (Optional)"
            name="altPhone"
            value={formData.altPhone}
            onChange={handleChange}
            placeholder="e.g. Landline or secondary mobile"
            icon={FiPhone}
          />
        </div>
      </div>

      <StepActions
        currentStep={3}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />

      <OtpModal
        isOpen={otpModal.open}
        onClose={() => setOtpModal((prev) => ({ ...prev, open: false }))}
        channel={otpModal.channel}
        target={otpModal.target}
        onConfirm={handleConfirmOtpModal}
        onResend={() => onSendOtp(otpModal.channel, otpModal.target, 'primary')}
      />
    </div>
  );
}
