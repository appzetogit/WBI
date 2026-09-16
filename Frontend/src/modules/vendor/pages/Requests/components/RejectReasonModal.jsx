import React, { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

const COMMON_REASONS = [
  'Team capacity full / No available engineers',
  'Location outside operational radius',
  'Budget / pricing mismatch',
  'Skill / specialized equipment unavailable',
  'Timeline cannot be met',
  'Other'
];

const RejectReasonModal = ({ request, onClose, onConfirm }) => {
  const [selectedReason, setSelectedReason] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalReason = selectedReason === 'Other' ? customReason.trim() : selectedReason;
    if (!finalReason) return;

    setSubmitting(true);
    try {
      await onConfirm?.(request?.id, finalReason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-red-50/50">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-base font-bold">Reject Request</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs sm:text-sm text-gray-600">
            Are you sure you want to decline{' '}
            <strong className="text-gray-900">{request?.title || 'this request'}</strong>? Please select a reason for auditing and re-routing.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Reason for Declining</label>
            <div className="space-y-1.5">
              {COMMON_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs sm:text-sm cursor-pointer transition-all ${
                    selectedReason === r
                      ? 'border-red-500 bg-red-50/40 text-red-900 font-semibold'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reject_reason"
                    checked={selectedReason === r}
                    onChange={() => setSelectedReason(r)}
                    className="accent-red-600"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedReason === 'Other' && (
            <div>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Specify your reason for rejection..."
                rows={3}
                required
                className="w-full p-3 text-xs sm:text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (selectedReason === 'Other' && !customReason.trim())}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-xs"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RejectReasonModal;
