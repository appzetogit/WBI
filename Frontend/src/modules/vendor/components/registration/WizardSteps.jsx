import React, { useState } from 'react';
import { FiCheckCircle, FiUpload, FiMapPin, FiCreditCard, FiUser, FiBriefcase, FiZap, FiLayers } from 'react-icons/fi';

export const Step1Account = ({ data, updateData, errors }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Account Setup</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Owner Name</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.ownerName || ''} onChange={e => updateData({ ownerName: e.target.value })} placeholder="John Doe" />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Mobile Number</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.mobile || ''} onChange={e => updateData({ mobile: e.target.value })} placeholder="10-digit number" />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Email</label>
      <input type="email" className="w-full p-3 border rounded-xl" value={data.email || ''} onChange={e => updateData({ email: e.target.value })} placeholder="john@example.com" />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Password</label>
      <input type="password" className="w-full p-3 border rounded-xl" value={data.password || ''} onChange={e => updateData({ password: e.target.value })} placeholder="Create a strong password" />
    </div>
  </div>
);

export const Step2PartnerMode = ({ data, updateData }) => (
  <div className="space-y-6">
    <div className="text-center">
      <h3 className="text-2xl font-bold text-gray-900">How will you work with WBI?</h3>
      <p className="text-gray-500 mt-2">Choose how you will operate on the WBI platform.</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div 
        onClick={() => updateData({ partnerMode: 'independent' })}
        className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg ${data.partnerMode === 'independent' ? 'border-[#0D8A72] bg-teal-50' : 'border-gray-200 bg-white hover:border-[#0D8A72]/50'}`}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-full ${data.partnerMode === 'independent' ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-500'}`}>
            <FiUser className="w-6 h-6" />
          </div>
          <h4 className={`text-lg font-bold ${data.partnerMode === 'independent' ? 'text-[#0D8A72]' : 'text-gray-900'}`}>Independent Partner</h4>
        </div>
        <ul className="text-sm text-gray-600 space-y-2 mb-4 list-disc list-inside">
          <li>I work independently.</li>
          <li>I personally accept jobs.</li>
          <li>I don't have my own company/team.</li>
          <li>I will complete assigned work myself.</li>
        </ul>
        <div className="text-xs text-gray-500 bg-white/50 p-2 rounded-lg border border-gray-100">
          <strong>Examples:</strong> Electrician, Plumber, AC Technician, RO Technician, CCTV Technician, Laptop Repair, Mobile Repair, Car Electrician
        </div>
      </div>

      <div 
        onClick={() => updateData({ partnerMode: 'company' })}
        className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg ${data.partnerMode === 'company' ? 'border-[#0D8A72] bg-teal-50' : 'border-gray-200 bg-white hover:border-[#0D8A72]/50'}`}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-full ${data.partnerMode === 'company' ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-500'}`}>
            <FiBriefcase className="w-6 h-6" />
          </div>
          <h4 className={`text-lg font-bold ${data.partnerMode === 'company' ? 'text-[#0D8A72]' : 'text-gray-900'}`}>Vendor Company</h4>
        </div>
        <ul className="text-sm text-gray-600 space-y-2 mb-4 list-disc list-inside">
          <li>I own or manage a company.</li>
          <li>I have workers and/or engineers.</li>
          <li>I will manage my team from Vendor Dashboard.</li>
          <li>Jobs can be assigned to my team.</li>
        </ul>
        <div className="text-xs text-gray-500 bg-white/50 p-2 rounded-lg border border-gray-100">
          <strong>Examples:</strong> ABC Security Pvt Ltd, Solar Company, Digital Agency, Healthcare Company, Automation Company
        </div>
      </div>
    </div>
  </div>
);

// Step 3: Business Type
export const Step3BusinessType = ({ data, updateData }) => (
  <div className="space-y-6">
    <div className="text-center">
      <h3 className="text-2xl font-bold text-gray-900">What type of services does your business provide?</h3>
      <p className="text-gray-500 mt-2">Select the operational model for your business.</p>
    </div>
    <div className="grid grid-cols-1 gap-4">
      <div 
        onClick={() => updateData({ businessType: 'quick_service' })}
        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg flex gap-4 items-start ${data.businessType === 'quick_service' ? 'border-[#0D8A72] bg-teal-50' : 'border-gray-200 bg-white hover:border-[#0D8A72]/50'}`}
      >
        <div className={`p-3 rounded-full shrink-0 ${data.businessType === 'quick_service' ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-500'}`}>
          <FiZap className="w-6 h-6" />
        </div>
        <div>
          <h4 className={`text-lg font-bold mb-1 ${data.businessType === 'quick_service' ? 'text-[#0D8A72]' : 'text-gray-900'}`}>Quick Service Partner</h4>
          <p className="text-sm text-gray-600 mb-3">Instant booking services where technicians visit customer locations.</p>
          <div className="flex flex-wrap gap-1.5">
            {['Home Appliances', 'Electrical', 'Plumbing', 'Mobile & Gadgets', 'IT & Computer', 'Networking', 'Telecom', 'CCTV', 'Security Devices', 'Office Equipment', 'Automobile', 'Banking Devices', 'Audio & Video'].map(ex => (
              <span key={ex} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-500">{ex}</span>
            ))}
          </div>
        </div>
      </div>

      <div 
        onClick={() => updateData({ businessType: 'project_partner' })}
        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg flex gap-4 items-start ${data.businessType === 'project_partner' ? 'border-[#0D8A72] bg-teal-50' : 'border-gray-200 bg-white hover:border-[#0D8A72]/50'}`}
      >
        <div className={`p-3 rounded-full shrink-0 ${data.businessType === 'project_partner' ? 'bg-[#0D8A72] text-white' : 'bg-gray-100 text-gray-500'}`}>
          <FiLayers className="w-6 h-6" />
        </div>
        <div>
          <h4 className={`text-lg font-bold mb-1 ${data.businessType === 'project_partner' ? 'text-[#0D8A72]' : 'text-gray-900'}`}>Project & Enterprise Partner</h4>
          <p className="text-sm text-gray-600 mb-3">Long-term projects, installations, enterprise contracts and managed services.</p>
          <div className="flex flex-wrap gap-1.5">
            {['Digital Solutions', 'Energy Solutions', 'Healthcare', 'Fire & Safety', 'Automation', 'Security Solutions', 'Solar', 'Industrial Solutions'].map(ex => (
              <span key={ex} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-500">{ex}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Step 4: Service Selection
export const Step4ServiceSelection = ({ data, updateData }) => {
  const quickServices = ['Home Appliances', 'Electrical', 'Plumbing', 'IT & Computer', 'Networking', 'Mobile & Gadgets', 'CCTV', 'Telecom', 'Security Devices', 'Office Equipment', 'Banking Devices', 'Audio & Video', 'Automobile'];
  const projectServices = ['Digital Solutions', 'Energy', 'Healthcare', 'Automation', 'Fire & Safety', 'Security Solutions', 'Solar'];
  
  const servicesToDisplay = data.businessType === 'project_partner' ? projectServices : quickServices;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Service Selection</h3>
      <div>
        <label className="block text-sm font-medium mb-1">Primary Services</label>
        <p className="text-xs text-gray-500 mb-4">Select the main categories you operate in.</p>
        <div className="grid grid-cols-2 gap-3">
          {servicesToDisplay.map(srv => (
            <label key={srv} className="flex items-center p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" className="mr-3 w-4 h-4 text-[#0D8A72] focus:ring-[#0D8A72] border-gray-300 rounded" />
              <span className="text-sm font-medium text-gray-700">{srv}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

// Step 5: Geo Mapping
export const Step5GeoMapping = ({ data, updateData }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Service Location</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Working City</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.workingCity || ''} onChange={e => updateData({ workingCity: e.target.value })} placeholder="e.g., Mumbai" />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Service Radius (Km)</label>
      <input type="number" className="w-full p-3 border rounded-xl" value={data.serviceRadiusKm || 10} onChange={e => updateData({ serviceRadiusKm: e.target.value })} />
    </div>
    <div className="p-4 bg-gray-100 rounded-xl flex items-center justify-center h-32 border-2 border-dashed border-gray-300">
      <div className="text-center text-gray-500">
        <FiMapPin className="w-6 h-6 mx-auto mb-2" />
        <span className="text-sm">Map Integration Placeholder<br/>(Auto-detects Lat/Lng)</span>
      </div>
    </div>
  </div>
);

// Step 6: Company Details
export const Step6CompanyDetails = ({ data, updateData }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Business Info</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Company / Business Name</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.companyName || ''} onChange={e => updateData({ companyName: e.target.value })} />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Description</label>
      <textarea className="w-full p-3 border rounded-xl" rows={3} value={data.companyDescription || ''} onChange={e => updateData({ companyDescription: e.target.value })} />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Website (Optional)</label>
      <input type="url" className="w-full p-3 border rounded-xl" value={data.website || ''} onChange={e => updateData({ website: e.target.value })} />
    </div>
  </div>
);

// Step 7: Business Address
export const Step7BusinessAddress = ({ data, updateData }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Business Address</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Full Office Address</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.officeAddress || ''} onChange={e => updateData({ officeAddress: e.target.value })} />
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium mb-1">State</label>
        <input type="text" className="w-full p-3 border rounded-xl" value={data.state || ''} onChange={e => updateData({ state: e.target.value })} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">City</label>
        <input type="text" className="w-full p-3 border rounded-xl" value={data.city || ''} onChange={e => updateData({ city: e.target.value })} />
      </div>
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Pincode</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.pincode || ''} onChange={e => updateData({ pincode: e.target.value })} />
    </div>
  </div>
);

// Step 8: Bank Details
export const Step8BankDetails = ({ data, updateData }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Bank Details (Penny Drop Verification)</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Account Holder Name</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.accountHolderName || ''} onChange={e => updateData({ accountHolderName: e.target.value })} />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Account Number</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.accountNumber || ''} onChange={e => updateData({ accountNumber: e.target.value })} />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">IFSC Code</label>
      <input type="text" className="w-full p-3 border rounded-xl uppercase" value={data.ifscCode || ''} onChange={e => updateData({ ifscCode: e.target.value.toUpperCase() })} />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">UPI ID (Optional)</label>
      <input type="text" className="w-full p-3 border rounded-xl" value={data.upiId || ''} onChange={e => updateData({ upiId: e.target.value })} />
    </div>
  </div>
);

// Step 9: KYC
export const Step9KYC = ({ data, updateData }) => {
  const [uploading, setUploading] = useState({});
  const [error, setError] = useState('');

  const handleUpload = async (docType, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(prev => ({ ...prev, [docType]: true }));
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Need to import api dynamically or assume it's passed or available. 
      // Actually we should use the api instance from src/services/api.js 
      const api = (await import('../../../../services/api')).default;

      const res = await api.post('/vendor/upload', formData);

      if (res.data.success) {
        updateData({ [docType]: res.data.url });
      } else {
        setError('Upload failed. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please check network.');
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }));
    }
  };

  const docs = [
    { label: 'Aadhaar Card', key: 'aadhaarUrl' },
    { label: 'PAN Card', key: 'panUrl' },
    { label: 'GST Certificate (Optional)', key: 'gstCertificateUrl' },
    { label: 'Owner Selfie', key: 'ownerSelfieUrl' }
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">KYC Documents</h3>
      <div className="p-4 bg-blue-50 text-blue-800 rounded-xl text-sm border border-blue-200">
        Integration with DigiLocker will fetch documents automatically. For now, please upload them.
      </div>
      
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {docs.map(doc => (
        <div key={doc.key} className="flex items-center justify-between p-3 border rounded-xl bg-white">
          <div className="flex flex-col">
            <span className="font-medium text-gray-800">{doc.label}</span>
            {data[doc.key] && (
              <a href={data[doc.key]} target="_blank" rel="noreferrer" className="text-xs text-[#0D8A72] hover:underline mt-1">
                View Uploaded File
              </a>
            )}
          </div>
          
          <div className="relative">
            <input
              type="file"
              onChange={(e) => handleUpload(doc.key, e)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept="image/*,.pdf"
              disabled={uploading[doc.key]}
            />
            <button 
              type="button"
              className={`flex items-center text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
                data[doc.key] 
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-teal-50 text-[#0D8A72] hover:bg-teal-100'
              } ${uploading[doc.key] ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploading[doc.key] ? (
                <span className="flex items-center"><span className="animate-spin mr-2 border-2 border-[#0D8A72] border-t-transparent rounded-full w-4 h-4"></span> Uploading...</span>
              ) : data[doc.key] ? (
                <><FiCheckCircle className="mr-1" /> Uploaded</>
              ) : (
                <><FiUpload className="mr-1" /> Upload</>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Step 10: Team
export const Step10Team = ({ data, updateData }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Team Information</h3>
    <div>
      <label className="block text-sm font-medium mb-1">Total Workers</label>
      <input type="number" className="w-full p-3 border rounded-xl" value={data.totalWorkers} onChange={e => updateData({ totalWorkers: parseInt(e.target.value) || 0 })} />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Total Engineers</label>
      <input type="number" className="w-full p-3 border rounded-xl" value={data.totalEngineers} onChange={e => updateData({ totalEngineers: parseInt(e.target.value) || 0 })} />
    </div>
  </div>
);

// Step 11: Hours
export const Step11WorkingHours = ({ data, updateData }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Operational Hours</h3>
    <label className="flex items-center p-3 border rounded-xl cursor-pointer bg-gray-50">
      <input type="checkbox" className="mr-3 w-5 h-5" checked={data.available24x7} onChange={e => updateData({ available24x7: e.target.checked })} />
      <span className="font-bold text-gray-800">Available 24x7</span>
    </label>
    <label className="flex items-center p-3 border rounded-xl cursor-pointer bg-gray-50">
      <input type="checkbox" className="mr-3 w-5 h-5" checked={data.emergencyServiceAvailable} onChange={e => updateData({ emergencyServiceAvailable: e.target.checked })} />
      <span className="font-bold text-gray-800">Emergency Services Available</span>
    </label>
  </div>
);

// Step 12: Payment
export const Step12JoiningFee = ({ data, updateData, config }) => (
  <div className="space-y-4">
    <h3 className="text-xl font-bold">Joining Fee</h3>
    <div className="p-6 border-2 border-[#0D8A72] rounded-2xl bg-teal-50 text-center">
      <FiCreditCard className="w-12 h-12 text-[#0D8A72] mx-auto mb-2" />
      <h4 className="font-bold text-lg text-gray-900 mb-1">One-time Registration Fee</h4>
      <p className="text-3xl font-black text-[#0D8A72]">₹{config?.joiningFeeAmount || 999}</p>
      <p className="text-sm text-gray-600 mt-2">Required to activate your account</p>
    </div>
    <button className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold">
      Pay Now
    </button>
  </div>
);

// Step 13: Review
export const Step13Review = ({ data }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-bold">Review Application</h3>
    <div className="space-y-4 text-sm bg-gray-50 p-6 rounded-2xl border border-gray-100">
      <div className="grid grid-cols-2 gap-y-4">
        <div><p className="text-gray-500">Name</p><p className="font-bold">{data.ownerName || '-'}</p></div>
        <div><p className="text-gray-500">Phone</p><p className="font-bold">{data.mobile || '-'}</p></div>
        <div><p className="text-gray-500">Partner Mode</p><p className="font-bold capitalize">{data.partnerMode || '-'}</p></div>
        <div><p className="text-gray-500">Business Type</p><p className="font-bold capitalize">{data.businessType ? data.businessType.replace('_', ' ') : '-'}</p></div>
        <div><p className="text-gray-500">City</p><p className="font-bold">{data.workingCity || '-'}</p></div>
      </div>
    </div>
    <div className="p-4 bg-green-50 text-green-800 rounded-xl flex items-start gap-3">
      <FiCheckCircle className="w-5 h-5 mt-0.5" />
      <div>
        <p className="font-bold">Ready to submit!</p>
        <p className="text-sm">Click submit to send your application to admin for approval.</p>
      </div>
    </div>
  </div>
);
