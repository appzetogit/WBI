import React from 'react';
import { Link } from 'react-router-dom';
import {
  FilePlus,
  Send,
  Upload,
  Bell,
  CheckCircle2,
  Clock,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { useVendorConfig } from '../../../context/VendorConfigContext';

const QUICK_ACTIONS = [
  { icon: FilePlus, label: 'Create Proposal', path: '/vendor/dynamic/business-intake/proposals' },
  { icon: Send, label: 'Submit Quote', path: '/vendor/dynamic/business-intake/rfq' },
  { icon: Upload, label: 'Upload Document', path: '/vendor/dynamic/compliance' },
];

const ACTIVITY_FEED = [
  { icon: Bell, color: 'bg-blue-100 text-blue-600', text: 'New client request received', time: '2h ago' },
  { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-600', text: 'Bid shortlisted for review', time: '5h ago' },
  { icon: Clock, color: 'bg-amber-100 text-amber-600', text: 'RFQ deadline in 24 hours', time: '1d ago' },
];

const RightPanel = () => {
  const { vendorProfile, pendingOpportunitiesCount = 0 } = useVendorConfig() || {};
  const kycStatus = vendorProfile?.complianceStatus?.kycStatus || vendorProfile?.kycStatus;
  const kycProgress = kycStatus === 'verified' ? 100 : kycStatus === 'pending' ? 75 : 45;

  return (
    <aside className="hidden xl:flex flex-col gap-4 w-72 shrink-0">
      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
        <div className="space-y-1">
          {QUICK_ACTIONS.map(({ icon: Icon, label, path }) => (
            <Link
              key={label}
              to={path}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors group"
            >
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Icon className="h-4 w-4 text-blue-600" />
              </div>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Activity Feed</h3>
        <div className="space-y-3">
          {ACTIVITY_FEED.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${item.color}`}>
                <item.icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{item.text}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
              </div>
            </div>
          ))}
          {pendingOpportunitiesCount > 0 && (
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-violet-100 text-violet-600">
                <Bell className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-sm text-gray-800">{pendingOpportunitiesCount} open opportunities match your services</p>
                <p className="text-xs text-gray-400 mt-0.5">Live</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tips / KYC Widget */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
        <div className="flex items-start gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Complete your profile</h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              Vendors with verified KYC receive 3× more opportunity matches.
            </p>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>KYC Progress</span>
            <span className="font-semibold">{kycProgress}%</span>
          </div>
          <div className="h-2 bg-white/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${kycProgress}%` }}
            />
          </div>
        </div>
        <Link
          to="/vendor/dynamic/compliance"
          className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Complete Now <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
};

export default RightPanel;
