import React, { useRef, useState } from 'react';
import { FiUpload, FiLoader, FiCheckCircle, FiRefreshCw, FiEye, FiFileText, FiX } from 'react-icons/fi';

const DEFAULT_ACCEPT = 'image/jpeg,image/jpg,image/png,application/pdf';
const DEFAULT_MAX = 5 * 1024 * 1024;

/**
 * Reusable document upload card — preview, progress, replace.
 */
const DocumentUploadCard = ({
  label = 'Document',
  required = false,
  accept = DEFAULT_ACCEPT,
  maxSizeBytes = DEFAULT_MAX,
  fileUrl = '',
  progress = 0,
  uploading = false,
  disabled = false,
  error = '',
  onSelect,
  onPreview,
  onClear
}) => {
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState('');

  const isPdf = (fileUrl || '').toLowerCase().includes('.pdf') || (fileUrl || '').includes('application/pdf');

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const allowed = String(accept || DEFAULT_ACCEPT)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const typeOk =
      !allowed.length ||
      allowed.some((a) => file.type === a || (a.startsWith('.') && file.name.toLowerCase().endsWith(a)));
    if (!typeOk && file.type && !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(file.type)) {
      setLocalError('Only JPG, JPEG, PNG or PDF allowed');
      return;
    }
    if (file.size > (maxSizeBytes || DEFAULT_MAX)) {
      setLocalError(`Max file size is ${Math.round((maxSizeBytes || DEFAULT_MAX) / (1024 * 1024))}MB`);
      return;
    }
    setLocalError('');
    onSelect?.(file);
  };

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </p>
        {fileUrl ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            <FiCheckCircle /> Uploaded
          </span>
        ) : null}
      </div>

      {fileUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white">
          {isPdf ? (
            <div className="flex h-36 flex-col items-center justify-center gap-2 text-gray-500">
              <FiFileText className="h-8 w-8" />
              <span className="text-xs font-medium">PDF document</span>
            </div>
          ) : (
            <img src={fileUrl} alt={label} className="h-36 w-full object-contain bg-white" />
          )}
          <div className="flex items-center justify-center gap-2 border-t border-gray-100 p-2">
            <button
              type="button"
              onClick={() => onPreview?.(fileUrl)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FiEye /> Preview
            </button>
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FiRefreshCw /> Replace
            </button>
            {onClear ? (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <FiX /> Remove
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <FiLoader className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-xs font-semibold text-blue-600">Uploading {progress || 0}%</span>
              <div className="mt-1 h-1.5 w-2/3 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress || 0}%` }} />
              </div>
            </>
          ) : (
            <>
              <FiUpload className="h-5 w-5" />
              <span className="text-xs font-medium">Click to upload</span>
              <span className="text-[10px] text-gray-400">JPG, PNG, PDF</span>
            </>
          )}
        </button>
      )}

      {(localError || error) && <p className="mt-1.5 text-[11px] font-medium text-red-600">{localError || error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept || DEFAULT_ACCEPT}
        className="hidden"
        disabled={disabled || uploading}
        onChange={handleChange}
      />
    </div>
  );
};

export default DocumentUploadCard;
