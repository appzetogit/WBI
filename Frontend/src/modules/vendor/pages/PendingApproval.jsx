import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiClock, FiCheckCircle, FiFileText, FiShield, FiDollarSign } from 'react-icons/fi';
import { themeColors } from '../../../theme';
import Logo from '../../../components/common/Logo';

const PendingApproval = () => {
  const navigate = useNavigate();
  const brandColor = themeColors.brand?.teal || '#0D8A72';

  const checklist = [
    { title: 'Mobile Verification', status: 'verified', icon: <FiCheckCircle /> },
    { title: 'KYC Document Verification', status: 'pending', icon: <FiFileText /> },
    { title: 'Bank/UPI Details', status: 'pending', icon: <FiDollarSign /> },
    { title: 'Admin Final Approval', status: 'pending', icon: <FiShield /> }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <Logo className="h-12 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">WBI Vendor Portal</h1>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-lg w-full text-center">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FiClock className="w-10 h-10 text-orange-500" />
          </div>
          
          <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Application Under Review</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Thank you for registering with WBI. Your application is currently being reviewed by our administrative team.
          </p>

          <div className="bg-gray-50 rounded-2xl p-5 mb-8 text-left border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wider">Approval Checklist</h3>
            <div className="space-y-4">
              {checklist.map((item, index) => (
                <div key={index} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.status === 'verified' ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                    {item.icon}
                  </div>
                  <span className={`ml-3 font-medium ${item.status === 'verified' ? 'text-gray-900' : 'text-gray-500'}`}>
                    {item.title}
                  </span>
                  {item.status === 'verified' && <FiCheckCircle className="ml-auto text-green-500 w-5 h-5" />}
                  {item.status === 'pending' && <span className="ml-auto text-xs font-bold px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">Pending</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/vendor/login')}
              className="w-full py-3.5 px-4 rounded-xl text-white font-bold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              style={{ backgroundColor: brandColor }}
            >
              Back to Login
            </button>
            <p className="text-sm text-gray-500">
              Need help? <a href="mailto:support@wbi.com" className="font-bold text-[#0D8A72] hover:underline">Contact Support</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
