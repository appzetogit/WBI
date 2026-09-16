import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { FiBox, FiCheckCircle } from 'react-icons/fi';

export default function Step12BulkProjects({
  data = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    dispatchMode: 'rolling_batch',
    engineerCrewSize: '2_crew',
    qaVerificationRule: 'gps_photos_checklist',
    materialProcurement: 'hybrid',
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
    onSave(12, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(12, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Multi-Site & Bulk Project Execution Rules</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Configure default deployment parameters for large-scale multi-city rollouts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Multi-Site Dispatch Cadence"
          name="dispatchMode"
          type="select"
          value={formData.dispatchMode}
          onChange={handleChange}
          options={[
            { value: 'rolling_batch', label: 'Rolling Batches (e.g., 10 sites every Monday)' },
            { value: 'simultaneous_blitz', label: 'Simultaneous Pan-India (All sites on target date)' },
            { value: 'phased_milestone', label: 'Phased Milestones (Region-by-region rollout)' }
          ]}
          icon={FiBox}
        />

        <FormField
          label="Field Crew Deployment Composition"
          name="engineerCrewSize"
          type="select"
          value={formData.engineerCrewSize}
          onChange={handleChange}
          options={[
            { value: 'solo', label: 'Solo Specialist Engineer per site' },
            { value: '2_crew', label: '2-Person Crew (Lead Engineer + Assistant)' },
            { value: 'large_crew', label: '4+ Specialist Team for heavy commercial installs' }
          ]}
        />

        <FormField
          label="Mandatory QA Sign-off Requirement"
          name="qaVerificationRule"
          type="select"
          value={formData.qaVerificationRule}
          onChange={handleChange}
          options={[
            { value: 'gps_photos_checklist', label: 'Geo-tagged Before/After Photos + Standard Checklist' },
            { value: 'video_walkthrough', label: 'Complete Video Walkthrough + Store Manager Signature' },
            { value: 'digital_otp', label: 'Fast OTP Verification by Site Incharge' }
          ]}
          icon={FiCheckCircle}
        />

        <FormField
          label="Hardware & Material Procurement Model"
          name="materialProcurement"
          type="select"
          value={formData.materialProcurement}
          onChange={handleChange}
          options={[
            { value: 'hybrid', label: 'Hybrid (Enterprise provides active gear, platform supplies consumables)' },
            { value: 'client_supplied', label: '100% Client Supplied (Labor & Tools only)' },
            { value: 'turnkey', label: 'Turnkey Procurement (Platform sources and delivers everything)' }
          ]}
        />
      </div>

      <StepActions
        currentStep={12}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
