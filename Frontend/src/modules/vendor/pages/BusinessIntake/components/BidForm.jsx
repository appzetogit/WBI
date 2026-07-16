import React, { useState } from 'react';
import { submitBid } from '../../../services/businessIntakeService';

const BidForm = ({ opportunityId, type, onSuccess, onCancel }) => {
  const [form, setForm] = useState({
    amount: '',
    proposalText: '',
    timeline: '30',
    teamSize: '2',
    technicalBid: '',
    financialBid: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRfq = type === 'bid_quote_request';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      setError('Please enter a valid bid amount');
      return;
    }
    setLoading(true);
    try {
      const res = await submitBid(opportunityId, {
        amount: Number(form.amount),
        proposalText: form.proposalText,
        timeline: Number(form.timeline),
        teamSize: Number(form.teamSize),
        technicalBid: form.technicalBid,
        financialBid: form.financialBid
      });
      onSuccess?.(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit bid. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900 border-b pb-2">Submit Your Bid</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Bid Amount (₹) *</label>
          <input
            type="number"
            value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g. 500000"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Timeline (days) *</label>
          <input
            type="number"
            value={form.timeline}
            onChange={e => setForm(p => ({ ...p, timeline: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="30"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Team Size</label>
        <input
          type="number"
          value={form.teamSize}
          onChange={e => setForm(p => ({ ...p, teamSize: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="2"
        />
      </div>

      {isRfq ? (
        <>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Technical Bid</label>
            <textarea
              value={form.technicalBid}
              onChange={e => setForm(p => ({ ...p, technicalBid: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="Describe your technical approach, methodology, team expertise..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Financial Bid</label>
            <textarea
              value={form.financialBid}
              onChange={e => setForm(p => ({ ...p, financialBid: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="Break down your pricing: materials, labor, overheads, GST..."
            />
          </div>
        </>
      ) : (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Proposal / Cover Note</label>
          <textarea
            value={form.proposalText}
            onChange={e => setForm(p => ({ ...p, proposalText: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            placeholder="Briefly describe your approach, experience, and why you're the best fit..."
          />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Submitting...' : 'Submit Bid'}
        </button>
      </div>
    </form>
  );
};

export default BidForm;
