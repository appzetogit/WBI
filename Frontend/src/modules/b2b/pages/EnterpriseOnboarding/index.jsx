import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useOnboarding from './hooks/useOnboarding';
import OnboardingHeader from './components/OnboardingHeader';
import OnboardingSidebar from './components/OnboardingSidebar';

// Step components
import Step1CompanyInfo from './steps/Step1CompanyInfo';
import Step2Addresses from './steps/Step2Addresses';
import Step3PrimaryContact from './steps/Step3PrimaryContact';
import Step4FinanceContact from './steps/Step4FinanceContact';
import Step5Services from './steps/Step5Services';
import Step6Coverage from './steps/Step6Coverage';
import Step7Banking from './steps/Step7Banking';
import Step8Credit from './steps/Step8Credit';
import Step9Payments from './steps/Step9Payments';
import Step10Sla from './steps/Step10Sla';
import Step11Approvals from './steps/Step11Approvals';
import Step12BulkProjects from './steps/Step12BulkProjects';
import Step13Compliance from './steps/Step13Compliance';
import Step14KycDocuments from './steps/Step14KycDocuments';
import Step15Review from './steps/Step15Review';
import Step16Submit from './steps/Step16Submit';

export default function EnterpriseOnboarding() {
  const {
    loading,
    saving,
    currentStep,
    onboarding,
    config,
    company,
    documents,
    branches,
    stepCompletion,
    goToStep,
    saveStep,
    verifyGst,
    verifyPan,
    verifyCin,
    verifyBank,
    sendContactOtp,
    confirmContactOtp,
    uploadDocument,
    addBranch,
    removeBranch,
    signPlatformSla,
    submitApplication
  } = useOnboarding();

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-[#10AFA5]/20 border-t-[#10AFA5] rounded-full animate-spin" />
        <p className="text-xs font-semibold text-gray-500">Loading enterprise onboarding state...</p>
      </div>
    );
  }

  const kycFlags = onboarding?.kycFlags || {};

  const renderActiveStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1CompanyInfo
            data={onboarding?.companyInfo}
            kycFlags={kycFlags}
            onSave={saveStep}
            onNext={() => goToStep(2)}
            onVerifyGst={verifyGst}
            onVerifyPan={verifyPan}
            onVerifyCin={verifyCin}
            saving={saving}
          />
        );
      case 2:
        return (
          <Step2Addresses
            data={onboarding?.addresses}
            onSave={saveStep}
            onNext={() => goToStep(3)}
            onPrevious={() => goToStep(1)}
            saving={saving}
          />
        );
      case 3:
        return (
          <Step3PrimaryContact
            data={onboarding?.primaryContact}
            onSave={saveStep}
            onNext={() => goToStep(4)}
            onPrevious={() => goToStep(2)}
            onSendOtp={sendContactOtp}
            onConfirmOtp={confirmContactOtp}
            saving={saving}
          />
        );
      case 4:
        return (
          <Step4FinanceContact
            data={onboarding?.financeContact}
            primaryContact={onboarding?.primaryContact}
            onSave={saveStep}
            onNext={() => goToStep(5)}
            onPrevious={() => goToStep(3)}
            saving={saving}
          />
        );
      case 5:
        return (
          <Step5Services
            data={onboarding?.serviceRequirements}
            config={config}
            onSave={saveStep}
            onNext={() => goToStep(6)}
            onPrevious={() => goToStep(4)}
            saving={saving}
          />
        );
      case 6:
        return (
          <Step6Coverage
            data={onboarding?.operationalCoverage}
            branches={branches}
            onAddBranch={addBranch}
            onRemoveBranch={removeBranch}
            onSave={saveStep}
            onNext={() => goToStep(7)}
            onPrevious={() => goToStep(5)}
            saving={saving}
          />
        );
      case 7:
        return (
          <Step7Banking
            data={onboarding?.banking}
            kycFlags={kycFlags}
            onSave={saveStep}
            onNext={() => goToStep(8)}
            onPrevious={() => goToStep(6)}
            onVerifyBank={verifyBank}
            saving={saving}
          />
        );
      case 8:
        return (
          <Step8Credit
            data={onboarding?.creditProfile}
            onSave={saveStep}
            onNext={() => goToStep(9)}
            onPrevious={() => goToStep(7)}
            saving={saving}
          />
        );
      case 9:
        return (
          <Step9Payments
            data={onboarding?.escrowPaymentRules}
            onSave={saveStep}
            onNext={() => goToStep(10)}
            onPrevious={() => goToStep(8)}
            saving={saving}
          />
        );
      case 10:
        return (
          <Step10Sla
            data={onboarding?.slaConfig}
            onSave={saveStep}
            onNext={() => goToStep(11)}
            onPrevious={() => goToStep(9)}
            onSignSla={signPlatformSla}
            saving={saving}
          />
        );
      case 11:
        return (
          <Step11Approvals
            data={onboarding?.approvalHierarchy}
            onSave={saveStep}
            onNext={() => goToStep(12)}
            onPrevious={() => goToStep(10)}
            saving={saving}
          />
        );
      case 12:
        return (
          <Step12BulkProjects
            data={onboarding?.bulkProjectSettings}
            onSave={saveStep}
            onNext={() => goToStep(13)}
            onPrevious={() => goToStep(11)}
            saving={saving}
          />
        );
      case 13:
        return (
          <Step13Compliance
            data={onboarding?.compliance}
            onSave={saveStep}
            onNext={() => goToStep(14)}
            onPrevious={() => goToStep(12)}
            saving={saving}
          />
        );
      case 14:
        return (
          <Step14KycDocuments
            data={onboarding}
            config={config}
            documents={documents}
            kycFlags={kycFlags}
            onUploadDocument={uploadDocument}
            onSave={saveStep}
            onNext={() => goToStep(15)}
            onPrevious={() => goToStep(13)}
            saving={saving}
          />
        );
      case 15:
        return (
          <Step15Review
            onboarding={onboarding}
            company={company}
            documents={documents}
            branches={branches}
            onGoToStep={goToStep}
            onSave={saveStep}
            onNext={() => goToStep(16)}
            onPrevious={() => goToStep(14)}
            saving={saving}
          />
        );
      case 16:
        return (
          <Step16Submit
            onboarding={onboarding}
            company={company}
            documents={documents}
            stepCompletion={stepCompletion}
            onSubmit={submitApplication}
            onPrevious={() => goToStep(15)}
            saving={saving}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-[#F8FAFC]">
      {/* Top Header */}
      <OnboardingHeader
        currentStep={currentStep}
        totalSteps={16}
        company={company}
        onboarding={onboarding}
        stepCompletion={stepCompletion}
      />

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Phased Navigation */}
        <OnboardingSidebar
          currentStep={currentStep}
          onSelectStep={goToStep}
          stepCompletion={stepCompletion}
        />

        {/* Right Active Step Form Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 sm:p-8"
              >
                {renderActiveStep()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
