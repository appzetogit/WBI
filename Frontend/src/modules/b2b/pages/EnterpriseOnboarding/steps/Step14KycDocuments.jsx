import React from 'react';
import DocumentUploadCard from '../components/DocumentUploadCard';
import StepActions from '../components/StepActions';
import { FiFileText, FiShield, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

const DEFAULT_DOC_TEMPLATES = [
  { key: 'gst_certificate', label: 'GST Registration Certificate', desc: 'Form GST REG-06 showing principal place of business', required: true },
  { key: 'pan_card', label: 'Company PAN Card', desc: 'Clear copy of corporate or firm Permanent Account Number', required: true },
  { key: 'coi', label: 'Certificate of Incorporation / Partnership Deed', desc: 'Issued by Ministry of Corporate Affairs / Registrar', required: true },
  { key: 'cancelled_cheque', label: 'Cancelled Cheque / Bank Statement', desc: 'Latest cheque leaf showing Account Name and IFSC or 3-month statement', required: true },
  { key: 'msme_certificate', label: 'Udyam / MSME Certificate', desc: 'Optional for priority enterprise vendor status', required: false },
  { key: 'board_resolution', label: 'Board Resolution / Power of Attorney', desc: 'Authorizing signatory for service agreements and billing', required: false }
];

export default function Step14KycDocuments({
  data = {},
  config = {},
  documents = [],
  kycFlags = {},
  onUploadDocument,
  onSave,
  onNext,
  onPrevious,
  saving = false
}) {
  const templates = (config.documentTemplates && config.documentTemplates.length > 0)
    ? config.documentTemplates.map((t) => ({
        key: t.key || t.documentType || t.name,
        label: t.label || t.name,
        desc: t.description || 'Enterprise compliance document',
        required: !!t.required
      }))
    : DEFAULT_DOC_TEMPLATES;

  // Find matching document for a template key
  const getDoc = (key) => {
    return documents.find(
      (d) => String(d.documentType).toLowerCase() === String(key).toLowerCase()
    );
  };

  const handleContinue = () => {
    onSave(14, { visited: true }, { advance: true });
  };

  const handleSaveDraft = () => {
    onSave(14, { visited: true }, { advance: false });
  };

  // Quick KYC verification summary
  const gstOk = kycFlags?.gst?.status === 'verified';
  const panOk = kycFlags?.pan?.status === 'verified';
  const bankOk = kycFlags?.bank?.status === 'verified';

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-lg font-bold text-gray-900">KYC & Document Repository</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Upload statutory corporate certificates to complete identity verification.
        </p>
      </div>

      {/* KYC Status Strip */}
      <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <div className="flex items-center gap-2">
          {gstOk ? (
            <FiCheckCircle className="w-4 h-4 text-emerald-600" />
          ) : (
            <FiAlertCircle className="w-4 h-4 text-amber-500" />
          )}
          <div className="text-xs">
            <span className="font-semibold text-gray-800">GST Verification:</span>{' '}
            <span className={gstOk ? 'text-emerald-700 font-bold' : 'text-amber-600'}>
              {gstOk ? 'Verified' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {panOk ? (
            <FiCheckCircle className="w-4 h-4 text-emerald-600" />
          ) : (
            <FiAlertCircle className="w-4 h-4 text-amber-500" />
          )}
          <div className="text-xs">
            <span className="font-semibold text-gray-800">PAN Verification:</span>{' '}
            <span className={panOk ? 'text-emerald-700 font-bold' : 'text-amber-600'}>
              {panOk ? 'Verified' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {bankOk ? (
            <FiCheckCircle className="w-4 h-4 text-emerald-600" />
          ) : (
            <FiAlertCircle className="w-4 h-4 text-amber-500" />
          )}
          <div className="text-xs">
            <span className="font-semibold text-gray-800">Bank Verification:</span>{' '}
            <span className={bankOk ? 'text-emerald-700 font-bold' : 'text-amber-600'}>
              {bankOk ? 'Verified' : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Document Upload Cards */}
      <div className="space-y-4">
        {templates.map((tpl) => (
          <DocumentUploadCard
            key={tpl.key}
            documentKey={tpl.key}
            title={tpl.label}
            description={tpl.desc}
            required={tpl.required}
            document={getDoc(tpl.key)}
            onUpload={onUploadDocument}
          />
        ))}
      </div>

      <StepActions
        currentStep={14}
        onPrevious={onPrevious}
        onSaveDraft={handleSaveDraft}
        onNext={handleContinue}
        saving={saving}
      />
    </div>
  );
}
