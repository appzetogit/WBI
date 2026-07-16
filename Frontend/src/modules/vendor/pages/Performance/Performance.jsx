import React from 'react';
import { motion } from 'framer-motion';
import { useVendorConfig } from '../../context/VendorConfigContext';
import { BarChart3, TrendingUp, AlertTriangle, ShieldCheck, Target, Award } from 'lucide-react';

const Performance = () => {
  const { vendorProfile } = useVendorConfig();

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Performance Metrics</h1>
        <p className="text-gray-500">Track your SLA adherence, ratings, and platform tier status.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Tier Card */}
        <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-xl shadow-lg p-6 text-white flex flex-col justify-center items-center text-center">
          <Award className="w-16 h-16 text-yellow-400 mb-4" />
          <h2 className="text-sm font-medium text-blue-200 uppercase tracking-widest">Current Tier</h2>
          <p className="text-3xl font-bold mt-1">{vendorProfile?.vendorTier?.toUpperCase() || 'BRONZE'}</p>
          <p className="text-sm text-blue-100 mt-4 max-w-xs">
            Maintain &gt;95% SLA and 4.5+ Rating to unlock Silver Tier benefits.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Overall Rating</p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">{vendorProfile?.overallRating || '4.8'}<span className="text-lg text-gray-400">/5</span></h3>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <Target className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-yellow-400 h-2 rounded-full" style={{ width: '96%' }}></div>
            </div>
            <p className="text-xs text-green-600 mt-2 flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> Top 10% of vendors</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500">SLA Adherence</p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">94%</h3>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <ShieldCheck className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full" style={{ width: '94%' }}></div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Target: 95% for next tier</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Quality Rejections</p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">12</h3>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-red-600 mt-2 flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> +2 from last month</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Projects Completed</p>
                <h3 className="text-3xl font-bold text-gray-900 mt-1">142</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Lifetime metrics</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Performance;
