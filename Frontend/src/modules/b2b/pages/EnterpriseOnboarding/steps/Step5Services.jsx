import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { validateStep } from '../hooks/useStepValidation';
import { FiCheck, FiLayers, FiPackage } from 'react-icons/fi';

const DEFAULT_SERVICES = [
  { id: 'cctv_surveillance', label: 'CCTV & Video Surveillance', desc: 'IP cameras, NVR/DVR installation & maintenance' },
  { id: 'networking_wifi', label: 'Enterprise Networking & Wi-Fi', desc: 'Routers, switches, rack cabling, access points' },
  { id: 'access_control', label: 'Access Control & Biometrics', desc: 'RFID, turnstiles, attendance & boom barriers' },
  { id: 'fire_safety', label: 'Fire Safety & Alarms', desc: 'Smoke detectors, suppression systems, fire panels' },
  { id: 'electrical_ups', label: 'Electrical & UPS Systems', desc: 'Power backup, panel wiring, generator maintenance' },
  { id: 'hvac_cooling', label: 'HVAC & Climate Control', desc: 'Commercial AC units, chillers, air ducts' },
  { id: 'av_conferencing', label: 'Audio-Visual & Boardroom', desc: 'Displays, video conferencing systems, projectors' },
  { id: 'facility_maintenance', label: 'General Facility Ops', desc: 'Preventive maintenance, repairs & facility care' }
];

const VOLUME_TIERS = [
  { value: '1-25', label: '1 - 25 service requests / month' },
  { value: '26-100', label: '26 - 100 service requests / month' },
  { value: '101-500', label: '101 - 500 service requests / month' },
  { value: '500+', label: '500+ high-volume enterprise tickets / month' }
];

export default function Step5Services({
  data = {},
  config = {},
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    selectedServices: [],
    monthlyTicketVolume: '26-100',
    notes: '',
    ...data
  });

  const [errors, setErrors] = useState({});

  // Use platform service catalog from config if available, otherwise default
  const catalog = (config.serviceCatalog && config.serviceCatalog.length > 0)
    ? config.serviceCatalog.map((s) => ({
        id: s.key || s.serviceCode || s.name,
        label: s.label || s.name,
        desc: s.description || s.category || 'Platform Certified Service'
      }))
    : DEFAULT_SERVICES;

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const toggleService = (id) => {
    setFormData((prev) => {
      const current = prev.selectedServices || [];
      const updated = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      return { ...prev, selectedServices: updated };
    });
    if (errors.selectedServices) {
      setErrors((prev) => ({ ...prev, selectedServices: '' }));
    }
  };

  const handleContinue = () => {
    const { isValid, errors: valErrors } = validateStep(5, formData);
    if (!isValid) {
      setErrors(valErrors);
      return;
    }
    onSave(5, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(5, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Service Portfolio & Volume Expectations</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Select the service domains your organization intends to procure through our engineer network.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          Service Categories Required <span className="text-red-500">*</span>
        </label>
        {errors.selectedServices && (
          <p className="text-xs text-red-500 font-medium mb-3">⚠️ {errors.selectedServices}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {catalog.map((srv) => {
            const isSelected = (formData.selectedServices || []).includes(srv.id);
            return (
              <div
                key={srv.id}
                onClick={() => toggleService(srv.id)}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'border-[#10AFA5] bg-[#E6F4F2]/30 shadow-xs'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{srv.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{srv.desc}</p>
                </div>

                <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-[#10AFA5] text-white' : 'border border-gray-300 bg-white'
                }`}>
                  {isSelected && <FiCheck className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
        <FormField
          label="Expected Monthly Ticket Volume"
          name="monthlyTicketVolume"
          type="select"
          value={formData.monthlyTicketVolume}
          onChange={(e) => setFormData((prev) => ({ ...prev, monthlyTicketVolume: e.target.value }))}
          options={VOLUME_TIERS}
          icon={FiPackage}
          helperText="Determines dedicated technician capacity allocation in your service hubs"
        />

        <FormField
          label="Special SLA / Operational Notes"
          name="notes"
          type="textarea"
          rows={2}
          value={formData.notes}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Any custom equipment brands, security clearances, or shift timings required..."
        />
      </div>

      <StepActions
        currentStep={5}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
