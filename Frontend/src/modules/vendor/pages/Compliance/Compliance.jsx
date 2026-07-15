import React from 'react';
import { motion } from 'framer-motion';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { ShieldAlert, CheckCircle, FileText, UploadCloud, AlertCircle } from 'lucide-react';

const Compliance = () => {
  const { vendorProfile } = useVendorConfig();

  const MOCK_DOCS = [
    { name: 'GST Certificate', status: 'verified', expiry: null },
    { name: 'Company PAN', status: 'verified', expiry: null },
    { name: 'Liability Insurance', status: 'expiring_soon', expiry: '2026-08-01' },
    { name: 'Electrical License', status: 'missing', expiry: null },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Compliance & Docs</h1>
        <p className="text-gray-500">Ensure your business meets all regulatory and platform requirements.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
          <div className="flex items-center">
            {vendorProfile?.complianceStatus?.kycStatus === 'verified' ? (
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mr-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            ) : (
              <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center mr-4">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900">Platform KYC Status</h2>
              <p className="text-sm text-gray-500">
                {vendorProfile?.complianceStatus?.kycStatus === 'verified' 
                  ? 'Your profile is fully verified for all platform activities.'
                  : 'Action required: Complete KYC to receive payouts.'}
              </p>
            </div>
          </div>
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
            View KYC Details
          </button>
        </div>

        <div>
          <h3 className="text-md font-semibold text-gray-900 mb-4">Required Documents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_DOCS.map((doc, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    {doc.expiry && (
                      <p className={`text-xs mt-0.5 ${doc.status === 'expiring_soon' ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                        Expires: {new Date(doc.expiry).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                
                {doc.status === 'verified' ? (
                  <span className="flex items-center text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                    <CheckCircle className="w-3 h-3 mr-1" /> Verified
                  </span>
                ) : doc.status === 'expiring_soon' ? (
                  <button className="flex items-center text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition-colors">
                    <UploadCloud className="w-3 h-3 mr-1" /> Update
                  </button>
                ) : (
                  <button className="flex items-center text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors">
                    <UploadCloud className="w-3 h-3 mr-1" /> Upload
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Compliance;
