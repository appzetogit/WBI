import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { FiUsers, FiShield } from 'react-icons/fi';

export default function Step11Approvals({
  data = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    requireApprovalAbove: '25000',
    approvalWorkflow: 'single_tier',
    approverRole: 'Operations Head',
    autoApproveEmergency: true,
    ...data
  });

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleContinue = () => {
    onSave(11, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(11, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Organizational Approval Hierarchy</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Establish internal financial safeguards and dual-sign-off workflows for work orders.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Approval Threshold Limit (₹)"
          name="requireApprovalAbove"
          type="number"
          value={formData.requireApprovalAbove}
          onChange={handleChange}
          placeholder="e.g. 25000"
          helperText="Work orders above this spend amount require supervisor approval before technician dispatch"
        />

        <FormField
          label="Approval Workflow Structure"
          name="approvalWorkflow"
          type="select"
          value={formData.approvalWorkflow}
          onChange={handleChange}
          options={[
            { value: 'single_tier', label: 'Single Tier (Branch Manager or Ops Lead)' },
            { value: 'dual_tier', label: 'Dual Tier (Ops Lead + Finance Director)' },
            { value: 'none', label: 'No Approval Required (Direct Dispatch)' }
          ]}
          icon={FiUsers}
        />

        <FormField
          label="Default Approver Authority Role"
          name="approverRole"
          value={formData.approverRole}
          onChange={handleChange}
          placeholder="e.g. Facilities Director / Finance Head"
        />

        <div className="flex items-center pt-6">
          <label className="flex items-start gap-3 text-xs text-gray-700 cursor-pointer p-3 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-gray-50 w-full">
            <input
              type="checkbox"
              name="autoApproveEmergency"
              checked={formData.autoApproveEmergency}
              onChange={handleChange}
              className="w-4 h-4 mt-0.5 rounded text-[#10AFA5] focus:ring-[#10AFA5] border-gray-300"
            />
            <div>
              <span className="font-bold text-gray-900 block">Bypass Approval for Critical Outages</span>
              <span className="text-gray-500 text-[11px]">
                Allows field dispatch immediately when marked as Priority 1 (outage/breakdown).
              </span>
            </div>
          </label>
        </div>
      </div>

      <StepActions
        currentStep={11}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
