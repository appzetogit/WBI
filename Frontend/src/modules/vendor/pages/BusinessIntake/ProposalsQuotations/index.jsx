import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Send, Download, Eye, Building2, Calendar, IndianRupee, X
} from 'lucide-react';
import {
  fetchProposals, sendProposal, downloadProposalPdf, formatINR
} from '../../../services/businessIntakeService';
import { useBusinessIntake } from '../context/BusinessIntakeContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
];

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  sent: { label: 'Sent', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  viewed: { label: 'Viewed', color: 'bg-violet-50 text-violet-700 border-violet-100' },
  accepted: { label: 'Accepted', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700 border-red-100' },
  negotiating: { label: 'Negotiating', color: 'bg-amber-50 text-amber-700 border-amber-100' },
};

const getClientName = (proposal) => {
  const ci = proposal.opportunityId?.clientInfo;
  return ci?.company || ci?.name || null;
};

const ProposalDetailDrawer = ({ proposal, onClose, onSend, onDownloadPdf }) => {
  if (!proposal) return null;
  const sc = statusConfig[proposal.status] || statusConfig.draft;
  const client = getClientName(proposal);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-xs font-mono text-gray-400">{proposal.proposalCode}</p>
            <h2 className="text-lg font-bold text-gray-900 mt-0.5">{proposal.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${sc.color}`}>
            {sc.label}
          </span>

          {client && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="font-medium">{client}</span>
            </div>
          )}

          {proposal.opportunityId?.title && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Linked Opportunity</p>
              <p className="text-sm font-medium text-gray-900">{proposal.opportunityId.title}</p>
              {proposal.opportunityId.categoryName && (
                <p className="text-xs text-gray-500 mt-1">{proposal.opportunityId.categoryName}</p>
              )}
            </div>
          )}

          {proposal.coverLetter && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Cover Letter</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{proposal.coverLetter.replace(/\n\n\[wbi-demo-seed\]/gi, '')}</p>
            </div>
          )}

          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">Pricing Summary</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatINR(proposal.pricing?.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST ({proposal.pricing?.gstPercentage || 18}%)</span>
                <span>{formatINR(proposal.pricing?.gstAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-800 border-t border-blue-200 pt-2">
                <span>Total</span>
                <span>{formatINR(proposal.pricing?.totalAmount)}</span>
              </div>
            </div>
          </div>

          {proposal.timeline?.totalDays && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400" />
              Timeline: <strong>{proposal.timeline.totalDays} days</strong>
            </div>
          )}

          {proposal.clientResponse?.message && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-800 mb-1">Client Response</p>
              <p className="text-sm text-amber-900">{proposal.clientResponse.message}</p>
              {proposal.clientResponse.counterOffer && (
                <p className="text-sm font-semibold text-amber-800 mt-2">
                  Counter offer: {formatINR(proposal.clientResponse.counterOffer)}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {proposal.status === 'draft' && (
              <button
                onClick={() => onSend(proposal._id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Send className="h-4 w-4" /> Send to Client
              </button>
            )}
            <button
              onClick={() => onDownloadPdf(proposal._id, proposal.proposalCode)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProposalCard = ({ proposal, onView, onSend, onDownloadPdf }) => {
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const sc = statusConfig[proposal.status] || statusConfig.draft;
  const client = getClientName(proposal);

  const handleSend = async (e) => {
    e.stopPropagation();
    setSending(true);
    try { await onSend(proposal._id); } finally { setSending(false); }
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    setDownloading(true);
    try { await onDownloadPdf(proposal._id, proposal.proposalCode); } finally { setDownloading(false); }
  };

  return (
    <div
      onClick={() => onView(proposal)}
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-5 cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] font-mono text-gray-400">{proposal.proposalCode}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span>
          </div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
            {proposal.title}
          </h3>
          {client && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {client}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-blue-700 leading-tight">
            {formatINR(proposal.pricing?.totalAmount)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {new Date(proposal.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {proposal.timeline?.totalDays && (
        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
          <Calendar className="h-3 w-3" /> {proposal.timeline.totalDays} days delivery
        </p>
      )}

      {proposal.clientResponse?.counterOffer && (
        <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg mb-3">
          Counter offer: {formatINR(proposal.clientResponse.counterOffer)}
        </p>
      )}

      <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onView(proposal)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <Eye className="h-3.5 w-3.5" /> View
        </button>
        {proposal.status === 'draft' && (
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Send className="h-3.5 w-3.5" />{sending ? 'Sending...' : 'Send'}
          </button>
        )}
        <button onClick={handleDownload} disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" />{downloading ? '...' : 'PDF'}
        </button>
      </div>
    </div>
  );
};

const PAGE_SIZE = 8;

const ProposalsQuotations = () => {
  const { refreshKey, openProposalBuilder } = useBusinessIntake();
  const [proposals, setProposals] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [selectedProposal, setSelectedProposal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (activeTab !== 'all') params.status = activeTab;
      const res = await fetchProposals(params);
      setProposals(res.data.data || []);
      setStatusCounts(res.data.statusCounts || {});
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load proposals');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => { setPage(1); }, [activeTab, refreshKey]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const handleSend = async (id) => {
    try {
      await sendProposal(id);
      setSelectedProposal(null);
      load();
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to send proposal');
    }
  };

  const handleDownloadPdf = async (id, code) => {
    try {
      const res = await downloadProposalPdf(id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${code || 'proposal'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to generate PDF. Please try again.');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <IndianRupee className="h-4 w-4" />
          <span>{statusCounts.all || 0} total proposals & quotations</span>
        </div>
        <button onClick={() => openProposalBuilder({})}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> New Proposal
        </button>
      </div>

      {/* Status tabs with counts */}
      <div className="flex gap-1 overflow-x-auto mb-5 pb-1 border-b border-gray-100">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {(statusCounts[tab.key] ?? 0) > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {statusCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-44 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals yet"
          description={activeTab === 'all' ? 'Create your first proposal or run demo seed to populate sample quotations.' : `No ${activeTab} proposals found.`}
          action={{ label: '+ Create Proposal', onClick: () => openProposalBuilder({}) }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {proposals.map(p => (
              <ProposalCard
                key={p._id}
                proposal={p}
                onView={setSelectedProposal}
                onSend={handleSend}
                onDownloadPdf={handleDownloadPdf}
              />
            ))}
          </div>
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={setPage}
            loading={loading}
            itemLabel="proposals"
          />
        </>
      )}

      {selectedProposal && (
        <ProposalDetailDrawer
          proposal={selectedProposal}
          onClose={() => setSelectedProposal(null)}
          onSend={handleSend}
          onDownloadPdf={handleDownloadPdf}
        />
      )}
    </>
  );
};

export default ProposalsQuotations;
