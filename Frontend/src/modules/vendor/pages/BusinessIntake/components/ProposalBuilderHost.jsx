import React, { useState, useEffect } from 'react';
import { Edit3 } from 'lucide-react';
import { createProposal, formatINR } from '../../../services/businessIntakeService';
import { useBusinessIntake } from '../context/BusinessIntakeContext';

/**
 * Global proposal builder modal hosted by Business Intake layout.
 * Opens from Quick Actions or "Create Proposal" on an opportunity.
 */
const ProposalBuilderHost = () => {
  const { proposalSeed, clearProposalSeed, triggerRefresh } = useBusinessIntake();
  const open = proposalSeed !== null && proposalSeed !== undefined;

  const [form, setForm] = useState({
    title: '',
    coverLetter: '',
    subtotal: '',
    gstPercentage: 18,
    totalDays: 30,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const seed = proposalSeed || {};
    setForm({
      title: seed.title
        ? `Proposal: ${seed.title}`
        : '',
      coverLetter: '',
      subtotal: seed.budget?.max || seed.budget?.min || '',
      gstPercentage: 18,
      totalDays: seed.timelineDays || 30,
    });
    setError('');
  }, [open, proposalSeed]);

  if (!open) return null;

  const handleClose = () => clearProposalSeed();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const subtotal = parseFloat(form.subtotal) || 0;
      const gstAmt = subtotal * (form.gstPercentage / 100);
      await createProposal({
        opportunityId: proposalSeed?._id || proposalSeed?.opportunityId || undefined,
        title: form.title.trim(),
        coverLetter: form.coverLetter,
        pricing: {
          subtotal,
          gstPercentage: form.gstPercentage,
          gstAmount: gstAmt,
          totalAmount: subtotal + gstAmt,
        },
        timeline: { totalDays: parseInt(form.totalDays, 10) || 30 },
      });
      clearProposalSeed();
      triggerRefresh();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create proposal');
    } finally {
      setLoading(false);
    }
  };

  const subtotal = parseFloat(form.subtotal) || 0;
  const gstAmount = subtotal * (form.gstPercentage / 100);
  const totalAmount = subtotal + gstAmount;
  const linkedTitle = proposalSeed?.title;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Create New Proposal</h2>
              {linkedTitle && (
                <p className="text-xs text-gray-500 mt-0.5">Linked to: {linkedTitle}</p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 p-1">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Proposal Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. CCTV Installation Proposal for ABC Corp"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Cover Letter</label>
            <textarea
              value={form.coverLetter}
              onChange={(e) => setForm((p) => ({ ...p, coverLetter: e.target.value }))}
              rows={5}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="Introduce your company, describe your approach, highlight relevant experience..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Project Value (₹)</label>
              <input
                type="number"
                min="0"
                value={form.subtotal}
                onChange={(e) => setForm((p) => ({ ...p, subtotal: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="500000"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">GST %</label>
              <select
                value={form.gstPercentage}
                onChange={(e) => setForm((p) => ({ ...p, gstPercentage: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value={0}>0% (Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>
          </div>

          {subtotal > 0 && (
            <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1 border border-blue-100">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST ({form.gstPercentage}%)</span>
                <span>{formatINR(gstAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-800 border-t border-blue-200 pt-2 mt-2">
                <span>Total</span>
                <span>{formatINR(totalAmount)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Project Timeline (days)</label>
            <input
              type="number"
              min="1"
              value={form.totalDays}
              onChange={(e) => setForm((p) => ({ ...p, totalDays: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Save as Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProposalBuilderHost;
