import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Building2,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  FileText,
  DollarSign,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  Phone,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { fetchRequestById } from '../../../services/requestsService';

const RequestDetailsModal = ({
  requestId,
  initialData,
  onClose,
  onAccept,
  onReject,
  onAssign
}) => {
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchRequestById(requestId);
        if (!cancelled && res.data?.success) {
          setData(res.data.data);
        }
      } catch (err) {
        console.warn('Failed to load full request details', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (!data && loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#0D8A72]" />
          <p className="text-sm font-semibold text-gray-700">Loading request details...</p>
        </div>
      </div>
    );
  }

  const isUserProject = data?.source === 'USER PROJECT' || data?.sourceType === 'user';
  const isNew = data?.status === 'new' || data?.status === 'open' || data?.status === 'Pending';
  const isAccepted = data?.status === 'accepted' || data?.status === 'Assigned';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col my-auto border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider ${
                isUserProject
                  ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              {isUserProject ? 'USER PROJECT' : 'B2B JOB'}
            </span>
            <span className="font-mono text-xs font-bold text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
              {data?.requestId || data?.id}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Title & Service Domain */}
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">{data?.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs font-semibold text-[#0D8A72] bg-[#0D8A72]/10 px-2.5 py-0.5 rounded-md">
                {data?.categoryName || 'Service'}
              </span>
              {data?.priority && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                  Priority: {data.priority}
                </span>
              )}
              <span className="text-xs text-gray-400">
                Created: {new Date(data?.createdAt || Date.now()).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Key Metric Snapshot Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80">
              <span className="text-[11px] font-medium text-gray-500">Estimated Budget / Amount</span>
              <p className="text-base font-bold text-gray-900 mt-0.5">
                ₹{Number(data?.estimatedAmount || data?.budget || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80">
              <span className="text-[11px] font-medium text-gray-500">Location / City</span>
              <p className="text-base font-bold text-gray-900 mt-0.5 truncate">
                {data?.city || 'Local Area'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 col-span-2 sm:col-span-1">
              <span className="text-[11px] font-medium text-gray-500">Requested Schedule</span>
              <p className="text-base font-bold text-gray-900 mt-0.5 truncate">
                {data?.requestedDate ? new Date(data.requestedDate).toLocaleDateString() : 'Immediate'}
              </p>
            </div>
          </div>

          {/* Client / Customer Info */}
          <div className="p-4 rounded-xl bg-white border border-gray-200 space-y-2.5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              {isUserProject ? <User className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
              {isUserProject ? 'Customer Details' : 'Enterprise Client Details'}
            </h4>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
              <div className="font-semibold text-gray-900">
                {data?.customerName || data?.companyName || 'Verified Client'}
                {data?.companyName && isUserProject && (
                  <span className="text-xs text-gray-500 font-normal ml-2">({data.companyName})</span>
                )}
              </div>
              {data?.customerPhone && (
                <div className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <Phone className="h-3 w-3 text-gray-400" />
                  {data.customerPhone}
                </div>
              )}
            </div>
            {data?.address && (
              <p className="text-xs text-gray-500 flex items-start gap-1">
                <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                <span>{data.address}, {data.city}</span>
              </p>
            )}
          </div>

          {/* Requirements & Description */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Project Scope & Requirements
            </h4>
            <div className="p-4 bg-gray-50 rounded-xl text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-line border border-gray-200/80">
              {data?.description || data?.specialRequirements || 'Standard maintenance and service as requested by client.'}
            </div>
          </div>

          {/* Assigned Engineer (if any) */}
          {(data?.assignedEngineer || data?.assignedEngineers?.length > 0) && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Assigned Workforce Engineer
              </h4>
              <p className="text-sm font-bold text-gray-900">
                {data?.assignedEngineer?.name || data?.assignedEngineers?.[0]?.name}
              </p>
              {data?.assignedEngineer?.phone && (
                <p className="text-xs text-gray-600 mt-0.5">Phone: {data.assignedEngineer.phone}</p>
              )}
            </div>
          )}

          {/* Attachments / RFQ Docs */}
          {data?.attachments?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Attached Documents & Specs</h4>
              <div className="flex flex-wrap gap-2">
                {data.attachments.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>View Document #{i + 1}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {isNew && (
              <>
                <button
                  onClick={() => onReject?.(data)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Reject Request</span>
                </button>
                <button
                  onClick={() => onAccept?.(data)}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0D8A72] hover:bg-[#0b735f] shadow-xs transition-all"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Accept Request</span>
                </button>
              </>
            )}

            {isAccepted && !data?.assignedEngineer && (
              <button
                onClick={() => onAssign?.(data)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-all"
              >
                <UserPlus className="h-4 w-4" />
                <span>Assign Engineer Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestDetailsModal;
