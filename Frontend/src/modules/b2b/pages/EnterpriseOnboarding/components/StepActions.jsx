import React from 'react';
import { FiChevronLeft, FiChevronRight, FiSave, FiCheckCircle, FiLoader } from 'react-icons/fi';

export default function StepActions({
  currentStep,
  onPrevious,
  onSaveDraft,
  onNext,
  onSubmit,
  saving = false,
  isLastStep = false,
  isFirstStep = false,
  canContinue = true
}) {
  return (
    <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between gap-4">
      {/* Previous button */}
      <div>
        {!isFirstStep && (
          <button
            type="button"
            onClick={onPrevious}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <FiChevronLeft className="w-4 h-4" /> Previous
          </button>
        )}
      </div>

      {/* Right actions: Save draft + Next / Submit */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <FiSave className="w-4 h-4 text-gray-500" /> Save Draft
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !canContinue}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? (
              <FiLoader className="w-4 h-4 animate-spin" />
            ) : (
              <FiCheckCircle className="w-4 h-4" />
            )}
            {saving ? 'Submitting...' : 'Submit Application'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={saving || !canContinue}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#10AFA5] hover:bg-[#0d8f87] transition-all shadow-lg shadow-[#10AFA5]/20 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? (
              <FiLoader className="w-4 h-4 animate-spin" />
            ) : (
              <FiChevronRight className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        )}
      </div>
    </div>
  );
}
