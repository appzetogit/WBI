import React from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, FileText, MessageSquare, Lightbulb, ArrowRight } from 'lucide-react';

const QUICK = [
  { icon: UserPlus, label: 'Add Client', path: '/vendor/dynamic/clients/individual' },
  { icon: FileText, label: 'New Proposal', path: '/vendor/dynamic/clients/proposals' },
  { icon: MessageSquare, label: 'Conversations', path: '/vendor/dynamic/clients/conversations' }
];

const RightPanel = () => (
  <aside className="hidden xl:flex flex-col gap-4 w-72 shrink-0">
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h3>
      <div className="space-y-1">
        {QUICK.map(({ icon: Icon, label, path }) => (
          <Link
            key={label}
            to={path}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors group"
          >
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100">
              <Icon className="h-4 w-4 text-blue-600" />
            </div>
            {label}
          </Link>
        ))}
      </div>
    </div>

    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
      <div className="flex items-start gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Service-driven CRM</h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Clients are filtered by your approved services. New service categories from Admin appear automatically.
          </p>
        </div>
      </div>
      <Link
        to="/vendor/dynamic/compliance"
        className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
      >
        Manage Compliance <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  </aside>
);

export default RightPanel;
