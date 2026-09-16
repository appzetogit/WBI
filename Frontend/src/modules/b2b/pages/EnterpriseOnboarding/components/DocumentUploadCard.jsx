import React, { useRef, useState } from 'react';
import { 
  FiUploadCloud, FiFileText, FiCheckCircle, FiAlertCircle, 
  FiEye, FiRefreshCw, FiLoader 
} from 'react-icons/fi';

export default function DocumentUploadCard({
  documentKey,
  title,
  description,
  required = false,
  document = null, // existing B2BDocument object
  onUpload,
  disabled = false
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const status = document?.status || 'missing'; // 'missing' | 'uploaded' | 'verified' | 'rejected'
  const isUploaded = !!document?.fileUrl;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(file);
  };

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      await onUpload(file, documentKey, title);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      status === 'verified'
        ? 'border-emerald-200 bg-emerald-50/20'
        : status === 'rejected'
        ? 'border-rose-200 bg-rose-50/20'
        : isUploaded
        ? 'border-teal-200 bg-teal-50/10'
        : 'border-gray-200 bg-white hover:border-gray-300'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-gray-800">{title}</h4>
            {required && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                Required
              </span>
            )}
          </div>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>

        <div>
          {status === 'verified' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              <FiCheckCircle className="w-3.5 h-3.5" /> Verified
            </span>
          ) : status === 'rejected' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800">
              <FiAlertCircle className="w-3.5 h-3.5" /> Rejected
            </span>
          ) : isUploaded ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
              In Review
            </span>
          ) : (
            <span className="text-xs text-gray-400 font-medium">Pending Upload</span>
          )}
        </div>
      </div>

      {status === 'rejected' && document?.rejectionReason && (
        <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
          <strong>Rejection reason:</strong> {document.rejectionReason}
        </div>
      )}

      {isUploaded ? (
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-[#10AFA5] flex items-center justify-center shrink-0">
              <FiFileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {document.fileName || `${title}.pdf`}
              </p>
              <p className="text-[11px] text-gray-400">
                {document.uploadedAt ? new Date(document.uploadedAt).toLocaleDateString() : 'Uploaded'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {document.fileUrl && (
              <a
                href={document.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-gray-500 hover:text-[#10AFA5] hover:bg-white rounded-md transition-colors"
                title="View Document"
              >
                <FiEye className="w-4 h-4" />
              </a>
            )}
            {status !== 'verified' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || disabled}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer"
              >
                {uploading ? (
                  <FiLoader className="w-3.5 h-3.5 animate-spin text-[#10AFA5]" />
                ) : (
                  <FiRefreshCw className="w-3.5 h-3.5" />
                )}
                Replace
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-[#10AFA5] bg-[#E6F4F2]/30'
              : 'border-gray-200 hover:border-[#10AFA5]/50 hover:bg-gray-50/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled || uploading}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[#10AFA5]">
              <FiLoader className="w-4 h-4 animate-spin" />
              Uploading document...
            </div>
          ) : (
            <div className="space-y-1">
              <FiUploadCloud className="w-6 h-6 text-gray-400 mx-auto" />
              <p className="text-xs font-semibold text-gray-700">
                Click to upload <span className="font-normal text-gray-400">or drag and drop</span>
              </p>
              <p className="text-[10px] text-gray-400">PDF, PNG, JPG up to 10MB</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
