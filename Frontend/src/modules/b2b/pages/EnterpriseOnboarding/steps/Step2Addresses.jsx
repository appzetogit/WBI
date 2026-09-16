import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { validateStep } from '../hooks/useStepValidation';
import { FiMapPin } from 'react-icons/fi';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh'
];

export default function Step2Addresses({
  data = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    registeredAddress: '',
    registeredCity: '',
    registeredState: '',
    registeredPincode: '',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingPincode: '',
    sameAsRegistered: true,
    ...data
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...data,
        // Support legacy schema registered string
        registeredAddress: data.registeredAddress || (typeof data.registered === 'string' ? data.registered : prev.registeredAddress)
      }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    
    setFormData((prev) => {
      const next = { ...prev, [name]: val };
      if (name === 'sameAsRegistered' && val) {
        next.billingAddress = next.registeredAddress;
        next.billingCity = next.registeredCity;
        next.billingState = next.registeredState;
        next.billingPincode = next.registeredPincode;
      }
      return next;
    });

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleContinue = () => {
    const payload = {
      ...formData,
      // Ensure backend field compatibility
      registered: formData.registeredAddress
    };
    const { isValid, errors: valErrors } = validateStep(2, payload);
    if (!isValid) {
      setErrors(valErrors);
      return;
    }
    onSave(2, payload, { advance: true });
  };

  const handleSaveDraft = () => {
    const payload = {
      ...formData,
      registered: formData.registeredAddress
    };
    onSave(2, payload, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Corporate & Billing Addresses</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Specify your official registered address for legal compliance and tax invoices.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#10AFA5] flex items-center gap-1.5">
          <FiMapPin className="w-3.5 h-3.5" /> Registered Office Address
        </h3>

        <FormField
          label="Registered Address Line"
          name="registeredAddress"
          type="textarea"
          rows={2}
          value={formData.registeredAddress}
          onChange={handleChange}
          required
          placeholder="Building, Street, Sector, Landmark..."
          error={errors.registered || errors.registeredAddress}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            label="City"
            name="registeredCity"
            value={formData.registeredCity}
            onChange={handleChange}
            placeholder="e.g. Mumbai"
          />

          <FormField
            label="State"
            name="registeredState"
            type="select"
            value={formData.registeredState}
            onChange={handleChange}
            placeholder="Select State"
            options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
          />

          <FormField
            label="PIN Code"
            name="registeredPincode"
            maxLength={6}
            value={formData.registeredPincode}
            onChange={handleChange}
            placeholder="e.g. 400001"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#10AFA5] flex items-center gap-1.5">
            <FiMapPin className="w-3.5 h-3.5" /> Billing / Invoicing Address
          </h3>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="sameAsRegistered"
              checked={formData.sameAsRegistered}
              onChange={handleChange}
              className="w-4 h-4 rounded text-[#10AFA5] focus:ring-[#10AFA5] border-gray-300"
            />
            Same as registered office
          </label>
        </div>

        {!formData.sameAsRegistered && (
          <div className="space-y-4 pt-2">
            <FormField
              label="Billing Address Line"
              name="billingAddress"
              type="textarea"
              rows={2}
              value={formData.billingAddress}
              onChange={handleChange}
              placeholder="Building, Street, Sector..."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label="City"
                name="billingCity"
                value={formData.billingCity}
                onChange={handleChange}
                placeholder="e.g. Pune"
              />

              <FormField
                label="State"
                name="billingState"
                type="select"
                value={formData.billingState}
                onChange={handleChange}
                placeholder="Select State"
                options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
              />

              <FormField
                label="PIN Code"
                name="billingPincode"
                maxLength={6}
                value={formData.billingPincode}
                onChange={handleChange}
                placeholder="e.g. 411001"
              />
            </div>
          </div>
        )}
      </div>

      <StepActions
        currentStep={2}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
