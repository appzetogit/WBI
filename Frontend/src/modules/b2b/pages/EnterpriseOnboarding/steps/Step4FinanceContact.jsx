import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { validateStep } from '../hooks/useStepValidation';
import { FiDollarSign, FiMail, FiPhone, FiBriefcase } from 'react-icons/fi';

export default function Step4FinanceContact({
  data = {},
  primaryContact = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    email: '',
    phone: '',
    sameAsPrimary: false,
    invoiceNotification: 'both',
    ...data
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;

    setFormData((prev) => {
      const next = { ...prev, [name]: val };
      if (name === 'sameAsPrimary' && val) {
        next.name = primaryContact.name || '';
        next.designation = primaryContact.designation || 'Finance & Accounts';
        next.email = primaryContact.email || '';
        next.phone = primaryContact.phone || primaryContact.mobile || '';
      }
      return next;
    });

    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleContinue = () => {
    const { isValid, errors: valErrors } = validateStep(4, formData);
    if (!isValid) {
      setErrors(valErrors);
      return;
    }
    onSave(4, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(4, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Finance & Billing Representative</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Recipient for GST tax invoices, credit statements, and payment reconciliation.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
          <input
            type="checkbox"
            name="sameAsPrimary"
            checked={formData.sameAsPrimary}
            onChange={handleChange}
            className="w-4 h-4 rounded text-[#10AFA5] focus:ring-[#10AFA5] border-gray-300"
          />
          Same as Primary Contact
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Finance Contact Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="e.g. Priya Nair"
          error={errors.name}
          icon={FiDollarSign}
        />

        <FormField
          label="Designation / Role"
          name="designation"
          value={formData.designation}
          onChange={handleChange}
          placeholder="e.g. Chief Financial Officer / Accounts Manager"
          icon={FiBriefcase}
        />

        <FormField
          label="Billing Email Address"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="billing@acme.com"
          error={errors.email}
          icon={FiMail}
          helperText="All automated monthly GST invoices will be dispatched here"
        />

        <FormField
          label="Finance Phone Number"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          placeholder="9876543210"
          icon={FiPhone}
        />

        <div className="md:col-span-2">
          <FormField
            label="Invoice Delivery Preferences"
            name="invoiceNotification"
            type="select"
            value={formData.invoiceNotification}
            onChange={handleChange}
            options={[
              { value: 'both', label: 'Email & Platform Portal (Recommended)' },
              { value: 'email', label: 'Email Only' },
              { value: 'portal', label: 'Platform Portal Only' }
            ]}
          />
        </div>
      </div>

      <StepActions
        currentStep={4}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
