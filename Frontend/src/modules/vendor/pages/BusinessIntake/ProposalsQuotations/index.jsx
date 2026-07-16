import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Send, Edit, Download, Eye, RefreshCw } from 'lucide-react';
import {
  fetchProposals, createProposal, updateProposal, sendProposal, downloadProposalPdf
} from '../../../services/businessIntakeService';
import EmptyState from '../components/EmptyState';
import KYCBanner from '../components/KYCBanner';

const STATUS_TABS = ['all', 'draft', 'sent', 'viewed', 'accepted', 'rejected'];

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  viewed: { label: 'Viewed', color: 'bg-purple-100 text-purple-700' },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  negotiating: { label: 'Negotiating', color: 'bg-amber-100 text-amber-700' }
};

const ProposalCard = ({ proposal, onSend, onDownloadPdf }) => {
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const sc = statusConfig[proposal.status] || statusConfig.draft;

  const handleSend = async () => {
    setSending(true);
    try { await onSend(proposal._id); } finally { setSending(false); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try { await onDownloadPdf(proposal._id, proposal.proposalCode); } finally { setDownloading(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-400">{proposal.proposalCode}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{proposal.title}</h3>
          {proposal.opportunityId?.clientInfo?.company && (
            <p className="text-xs text-gray-500 mt-0.5">{proposal.opportunityId.clientInfo.company}</p>
          )}
        </div>
        <div className="text-right ml-3">
          <p className="text-lg font-bold text-blue-700">
            ₹{(proposal.pricing?.totalAmount || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-gray-400">{new Date(proposal.createdAt).toLocaleDateString('en-IN')}</p>
        </div>
      </div>

      {proposal.timeline?.totalDays && (
        <p className="text-xs text-gray-500 mb-3">Timeline: {proposal.timeline.totalDays} days</p>
      )}

      <div className="flex gap-2 flex-wrap">
        {proposal.status === 'draft' && (
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Send className="h-3.5 w-3.5" />{sending ? 'Sending...' : 'Send'}
          </button>
        )}
        <button onClick={handleDownload} disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" />{downloading ? 'Generating...' : 'Download PDF'}
        </button>
      </div>
    </div>
  );
};

const ProposalBuilder = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({
    title: '',
    coverLetter: '',
    subtotal: '',
    gstPercentage: 18,
    totalDays: 30
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) { setError('Title is required'); return; }
    setLoading(true);
    try {
      const subtotal = parseFloat(form.subtotal) || 0;
      const gstAmt = subtotal * (form.gstPercentage / 100);
      const payload = {
        title: form.title,
        coverLetter: form.coverLetter,
        pricing: {
          subtotal,
          gstPercentage: form.gstPercentage,
          gstAmount: gstAmt,
          totalAmount: subtotal + gstAmt
        },
        timeline: { totalDays: parseInt(form.totalDays) }
      };
      await createProposal(payload);
      onCreated?.();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create proposal');
    } finally {
      setLoading(false);
    }
  };

  const subtotal = parseFloat(form.subtotal) || 0;
  const gstAmount = subtotal * (form.gstPercentage / 100);
  const totalAmount = subtotal + gstAmount;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">Create New Proposal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Proposal Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. CCTV Installation Proposal for ABC Corp" required />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Cover Letter</label>
            <textarea value={form.coverLetter} onChange={e => setForm(p => ({ ...p, coverLetter: e.target.value }))}
              rows={5} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="Introduce your company, describe your approach, highlight relevant experience..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Project Value (₹)</label>
              <input type="number" value={form.subtotal} onChange={e => setForm(p => ({ ...p, subtotal: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. 500000" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">GST %</label>
              <select value={form.gstPercentage} onChange={e => setForm(p => ({ ...p, gstPercentage: Number(e.target.value) }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value={0}>0% (Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            </div>
          </div>

          {/* Pricing summary */}
          {subtotal > 0 && (
            <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST ({form.gstPercentage}%)</span><span>₹{gstAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-800 border-t border-blue-200 pt-2 mt-2">
                <span>Total</span><span>₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Project Timeline (days)</label>
            <input type="number" value={form.totalDays} onChange={e => setForm(p => ({ ...p, totalDays: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="30" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60">
              {loading ? 'Saving...' : 'Save as Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ProposalsQuotations = () => {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showBuilder, setShowBuilder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeTab !== 'all' ? { status: activeTab } : {};
      const res = await fetchProposals(params);
      setProposals(res.data.data || []);
    } catch {}
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { load(); }, [activeTab]);

  const handleSend = async (id) => {
    try {
      await sendProposal(id);
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to send proposal');
    }
  };

  const handleDownloadPdf = async (id, code) => {
    try {
      const res = await downloadProposalPdf(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `${code}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate PDF. Please try again.');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <KYCBanner />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-600" /> Proposals & Quotations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Create, manage, and track all your formal proposals</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => setShowBuilder(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors">
            <Plus className="h-4 w-4" /> New Proposal
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-colors ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals yet"
          description={activeTab === 'all' ? 'Create your first proposal to start winning clients.' : `No ${activeTab} proposals found.`}
          action={{ label: '+ Create Proposal', onClick: () => setShowBuilder(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proposals.map(p => (
            <ProposalCard key={p._id} proposal={p} onSend={handleSend} onDownloadPdf={handleDownloadPdf} />
          ))}
        </div>
      )}

      {showBuilder && (
        <ProposalBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={() => { setShowBuilder(false); load(); }}
        />
      )}
    </div>
  );
};

export default ProposalsQuotations;
