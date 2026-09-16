import React, { useState, useEffect } from 'react';
import FormField from '../components/FormField';
import StepActions from '../components/StepActions';
import { FiPlus, FiTrash2, FiMapPin, FiPhone, FiUser } from 'react-icons/fi';

const REGIONS = [
  'Pan-India', 'North India (NCR, Punjab, UP, Haryana)',
  'West India (Maharashtra, Gujarat, Goa)',
  'South India (Karnataka, TN, Telangana, Kerala)',
  'East & North-East India (WB, Bihar, Odisha, Assam)'
];

export default function Step6Coverage({
  data = {},
  branches = [],
  onAddBranch,
  onRemoveBranch,
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const [formData, setFormData] = useState({
    regions: 'Pan-India',
    slaPreference: 'standard',
    notes: '',
    ...data
  });

  const [newBranch, setNewBranch] = useState({
    branchName: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    contactPerson: '',
    contactPhone: ''
  });
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      setFormData((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleBranchSubmit = async (e) => {
    e.preventDefault();
    if (!newBranch.branchName || !newBranch.city) return;
    setAddingBranch(true);
    try {
      const res = await onAddBranch(newBranch);
      if (res.success) {
        setNewBranch({
          branchName: '',
          address: '',
          city: '',
          state: '',
          pincode: '',
          contactPerson: '',
          contactPhone: ''
        });
        setShowBranchModal(false);
      }
    } finally {
      setAddingBranch(false);
    }
  };

  const handleContinue = () => {
    onSave(6, formData, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(6, formData, { advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">Operational Coverage & Regional Hubs</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Map regional offices, distribution centers, or stores where field engineers will be dispatched.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Primary Service Region"
          name="regions"
          type="select"
          value={formData.regions}
          onChange={(e) => setFormData((prev) => ({ ...prev, regions: e.target.value }))}
          options={REGIONS.map((r) => ({ value: r, label: r }))}
        />

        <FormField
          label="Service Dispatch Priority"
          name="slaPreference"
          type="select"
          value={formData.slaPreference}
          onChange={(e) => setFormData((prev) => ({ ...prev, slaPreference: e.target.value }))}
          options={[
            { value: 'standard', label: 'Standard (Next Business Day / 24 hrs)' },
            { value: 'critical', label: 'Mission Critical (4-hour on-site SLA)' },
            { value: 'same_day', label: 'Same Day Dispatch (8 hrs)' }
          ]}
        />
      </div>

      {/* Branch List Section */}
      <div className="pt-4 border-t border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Operating Branches & Facilities</h3>
            <p className="text-xs text-gray-500">Add sites where tickets will be dispatched</p>
          </div>
          <button
            type="button"
            onClick={() => setShowBranchModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#10AFA5] text-white text-xs font-semibold hover:bg-[#0d8f87] transition-all cursor-pointer shadow-sm shadow-[#10AFA5]/20"
          >
            <FiPlus className="w-4 h-4" /> Add Branch
          </button>
        </div>

        {branches.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
            <FiMapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-gray-600">No specific branches added yet</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Tickets will default to your registered headquarters address.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {branches.map((b) => (
              <div
                key={b._id}
                className="p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all flex items-start justify-between gap-3 shadow-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 truncate">{b.branchName}</span>
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {b.city || 'Hub'}
                    </span>
                  </div>
                  {b.branchAddress && (
                    <p className="text-xs text-gray-500 flex items-start gap-1">
                      <FiMapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" />
                      <span className="truncate">{b.branchAddress}, {b.city} {b.pincode}</span>
                    </p>
                  )}
                  {b.contactPerson && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <FiUser className="w-3.5 h-3.5 text-gray-400" /> {b.contactPerson} {b.contactPhone ? `(${b.contactPhone})` : ''}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveBranch(b._id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="Remove Branch"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <StepActions
        currentStep={6}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />

      {/* Add Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-4">Add Regional Facility / Branch</h3>
            <form onSubmit={handleBranchSubmit} className="space-y-4">
              <FormField
                label="Branch / Site Name"
                name="branchName"
                value={newBranch.branchName}
                onChange={(e) => setNewBranch({ ...newBranch, branchName: e.target.value })}
                required
                placeholder="e.g. Pune Tech Center / Andheri Hub"
              />

              <FormField
                label="Street Address"
                name="address"
                value={newBranch.address}
                onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                placeholder="Plot No., Industrial Area, Road..."
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="City"
                  name="city"
                  value={newBranch.city}
                  onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                  required
                  placeholder="e.g. Pune"
                />
                <FormField
                  label="PIN Code"
                  name="pincode"
                  maxLength={6}
                  value={newBranch.pincode}
                  onChange={(e) => setNewBranch({ ...newBranch, pincode: e.target.value })}
                  placeholder="e.g. 411014"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Site Contact Person"
                  name="contactPerson"
                  value={newBranch.contactPerson}
                  onChange={(e) => setNewBranch({ ...newBranch, contactPerson: e.target.value })}
                  placeholder="e.g. Rahul Patil"
                  icon={FiUser}
                />
                <FormField
                  label="Contact Phone"
                  name="contactPhone"
                  value={newBranch.contactPhone}
                  onChange={(e) => setNewBranch({ ...newBranch, contactPhone: e.target.value })}
                  placeholder="e.g. 9822012345"
                  icon={FiPhone}
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingBranch || !newBranch.branchName || !newBranch.city}
                  className="flex-1 py-2.5 rounded-xl bg-[#10AFA5] text-white text-sm font-semibold hover:bg-[#0d8f87] disabled:bg-gray-200"
                >
                  {addingBranch ? 'Saving...' : 'Add Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
