import React from 'react';
import {
  X,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Briefcase,
  CheckCircle2,
  Clock,
  Tag,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { formatINR, statusColors } from '../../../services/financeService';

const TransactionDetailsModal = ({ transaction, onClose }) => {
  if (!transaction) return null;

  const isCredit = ['credit', 'escrow_release', 'refund'].includes(transaction.type);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${isCredit ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {isCredit ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
            </div>
            <div>
              <span className="text-[11px] font-mono text-slate-400 block">{transaction.transactionCode}</span>
              <h3 className="text-lg font-bold text-white capitalize">{transaction.type?.replace(/_/g, ' ')}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Amount Hero */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaction Amount</span>
            <div className={`text-3xl font-black ${isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
              {isCredit ? '+' : '-'}{formatINR(transaction.amount)}
            </div>
            <div className="pt-1 flex items-center justify-center gap-2">
              <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-md border ${statusColors[transaction.status] || 'bg-gray-100'}`}>
                {transaction.status}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                Balance After: {formatINR(transaction.balanceAfter)}
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="divide-y divide-gray-100 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-gray-500">Description</span>
              <span className="font-semibold text-gray-800 text-right max-w-[220px]">{transaction.description || 'Ledger entry'}</span>
            </div>

            {transaction.projectCode && (
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-gray-500">Job / Project Reference</span>
                <span className="font-mono font-bold text-teal-700">{transaction.projectCode}</span>
              </div>
            )}

            {transaction.serviceCategoryCode && (
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-gray-500">Service Category</span>
                <span className="font-semibold text-gray-800">
                  {transaction.serviceCategoryName || transaction.serviceCategoryCode} ({transaction.serviceCategoryCode})
                </span>
              </div>
            )}

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-gray-500">Timestamp</span>
              <span className="font-semibold text-gray-800">
                {new Date(transaction.occurredAt || transaction.createdAt).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <span className="text-gray-500">Origin / Source</span>
              <span className="capitalize font-semibold text-gray-800">{transaction.source || 'system'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400 font-mono">Verified Double-Entry Ledger</span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200/70 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsModal;
