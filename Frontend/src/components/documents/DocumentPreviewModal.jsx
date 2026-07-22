import React, { useEffect } from 'react';
import { FiDownload, FiExternalLink, FiMaximize2, FiX } from 'react-icons/fi';

/**
 * Full-screen / modal preview for images and PDFs.
 */
const DocumentPreviewModal = ({ open, url, title = 'Document', onClose }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  const isPdf = String(url).toLowerCase().includes('.pdf') || String(url).includes('application/pdf');

  return (
    <div className="fixed inset-0 z-[120000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{title}</p>
            <p className="text-[11px] text-gray-500 truncate max-w-md">{url}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FiDownload /> Download
            </a>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <FiExternalLink /> Open
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200"
              aria-label="Close preview"
            >
              <FiX />
            </button>
          </div>
        </div>
        <div className="relative flex min-h-[50vh] flex-1 items-center justify-center bg-slate-950/95 p-3">
          {isPdf ? (
            <iframe title={title} src={url} className="h-[70vh] w-full rounded-lg bg-white" />
          ) : (
            <img src={url} alt={title} className="max-h-[75vh] max-w-full object-contain" />
          )}
          <span className="absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white">
            <FiMaximize2 /> Full preview
          </span>
        </div>
      </div>
    </div>
  );
};

export default DocumentPreviewModal;
