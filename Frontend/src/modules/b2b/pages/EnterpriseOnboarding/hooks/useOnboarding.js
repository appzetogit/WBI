import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  fetchMyOnboarding,
  fetchOnboardingConfig,
  saveOnboardingStep as apiSaveStep,
  submitOnboarding as apiSubmitOnboarding,
  fetchActivationStatus as apiFetchActivationStatus,
  verifyGst as apiVerifyGst,
  verifyPan as apiVerifyPan,
  verifyCin as apiVerifyCin,
  verifyBank as apiVerifyBank,
  sendContactOtp as apiSendContactOtp,
  confirmContactOtp as apiConfirmContactOtp,
  signSla as apiSignSla,
  uploadOnboardingDocument,
  registerDocument,
  fetchOnboardingBranches,
  createOnboardingBranch,
  updateOnboardingBranch,
  deleteOnboardingBranch,
  fetchOnboardingContacts,
  saveOnboardingContact,
  deleteOnboardingContact,
  fetchActivityTimeline
} from '../../../services/b2bOnboardingApi';

export default function useOnboarding() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [onboarding, setOnboarding] = useState(null);
  const [config, setConfig] = useState(null);
  const [company, setCompany] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [activation, setActivation] = useState(null);
  const [stepCompletion, setStepCompletion] = useState({});

  // Fetch complete initial state
  const refreshState = useCallback(async () => {
    try {
      const [stateRes, cfgRes] = await Promise.all([
        fetchMyOnboarding(),
        fetchOnboardingConfig()
      ]);

      const stateData = stateRes.data?.data || {};
      const ob = stateData.onboarding || {};
      setOnboarding(ob);
      setConfig(stateData.config || cfgRes.data?.data || {});
      setCompany(stateData.company || {});
      setDocuments(stateData.documents || []);

      // If stepCompletion exists as map or object
      if (ob.stepCompletion) {
        setStepCompletion(
          ob.stepCompletion instanceof Map 
            ? Object.fromEntries(ob.stepCompletion) 
            : ob.stepCompletion
        );
      }

      if (ob.currentStep && ob.currentStep >= 1 && ob.currentStep <= 16) {
        setCurrentStep(ob.currentStep);
      }
    } catch (err) {
      console.error('Error loading onboarding state:', err);
      toast.error(err.response?.data?.message || 'Failed to load onboarding state');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch branches, contacts, timeline in background
  const loadSubData = useCallback(async () => {
    try {
      const [brRes, ctRes] = await Promise.allSettled([
        fetchOnboardingBranches(),
        fetchOnboardingContacts()
      ]);
      if (brRes.status === 'fulfilled') setBranches(brRes.value.data?.data || []);
      if (ctRes.status === 'fulfilled') setContacts(ctRes.value.data?.data || []);
    } catch (e) {
      console.error('Subdata load error:', e);
    }
  }, []);

  useEffect(() => {
    refreshState();
    loadSubData();
  }, [refreshState, loadSubData]);

  // Save current step payload
  const saveStep = async (step, payload, options = { advance: false, silent: false }) => {
    setSaving(true);
    try {
      const res = await apiSaveStep(step, payload);
      const updatedOnboarding = res.data?.data || res.data;
      setOnboarding(updatedOnboarding);

      if (updatedOnboarding?.stepCompletion) {
        setStepCompletion(
          updatedOnboarding.stepCompletion instanceof Map
            ? Object.fromEntries(updatedOnboarding.stepCompletion)
            : updatedOnboarding.stepCompletion
        );
      }

      if (res.data?.validationErrors && res.data.validationErrors.length > 0) {
        if (!options.silent) {
          toast(res.data.validationErrors[0], { icon: '⚠️' });
        }
      } else if (!options.silent) {
        toast.success('Step saved successfully');
      }

      if (options.advance && step < 16) {
        setCurrentStep(step + 1);
      }
      return { success: true, onboarding: updatedOnboarding };
    } catch (err) {
      console.error('saveStep error:', err);
      const msg = err.response?.data?.message || 'Failed to save step';
      toast.error(msg);
      return { success: false, message: msg };
    } finally {
      setSaving(false);
    }
  };

  // Move to a specific step
  const goToStep = (stepNumber) => {
    if (stepNumber >= 1 && stepNumber <= 16) {
      setCurrentStep(stepNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Instant KYC verifications
  const verifyGst = async (gstNumber) => {
    try {
      const res = await apiVerifyGst(gstNumber);
      toast.success('GST verified successfully!');
      await refreshState();
      return { success: true, data: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'GST verification failed';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const verifyPan = async (panNumber) => {
    try {
      const res = await apiVerifyPan(panNumber);
      toast.success('PAN verified successfully!');
      await refreshState();
      return { success: true, data: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'PAN verification failed';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const verifyCin = async (cinNumber) => {
    try {
      const res = await apiVerifyCin(cinNumber);
      toast.success('CIN verified successfully!');
      await refreshState();
      return { success: true, data: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'CIN verification failed';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const verifyBank = async (accountNumber, ifsc) => {
    try {
      const res = await apiVerifyBank(accountNumber, ifsc);
      toast.success('Bank account verified!');
      await refreshState();
      return { success: true, data: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Bank verification failed';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  // OTP Verification for contact
  const sendContactOtp = async (channel, target, contactRole = 'primary') => {
    try {
      const res = await apiSendContactOtp({ channel, target, contactRole });
      toast.success(`OTP sent to ${target}`);
      return { success: true, token: res.data?.token };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send OTP';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const confirmContactOtp = async (channel, target, otp, token, contactRole = 'primary') => {
    try {
      const res = await apiConfirmContactOtp({ channel, target, otp, token, contactRole });
      toast.success('Contact verified successfully!');
      await refreshState();
      return { success: true, data: res.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid or expired OTP';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  // Document upload
  const uploadDocument = async (file, documentKey, documentLabel) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentKey);
      if (documentLabel) formData.append('documentLabel', documentLabel);

      const res = await uploadOnboardingDocument(formData);
      const uploadedDoc = res.data?.document || res.data?.data;

      // Also register meta if needed
      if (uploadedDoc?.fileUrl) {
        await registerDocument({
          documentKey,
          documentLabel: documentLabel || documentKey,
          fileUrl: uploadedDoc.fileUrl,
          fileKey: uploadedDoc.fileKey
        });
      }

      toast.success(`${documentLabel || 'Document'} uploaded successfully`);
      await refreshState();
      return { success: true, document: uploadedDoc };
    } catch (err) {
      const msg = err.response?.data?.message || 'Document upload failed';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  // Branch management
  const addBranch = async (branchData) => {
    try {
      const res = await createOnboardingBranch(branchData);
      toast.success('Branch added');
      await loadSubData();
      return { success: true, branch: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add branch';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const updateBranch = async (branchId, branchData) => {
    try {
      const res = await updateOnboardingBranch(branchId, branchData);
      toast.success('Branch updated');
      await loadSubData();
      return { success: true, branch: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update branch';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const removeBranch = async (branchId) => {
    try {
      await deleteOnboardingBranch(branchId);
      toast.success('Branch removed');
      await loadSubData();
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete branch';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  // Contact management
  const addOrUpdateContact = async (contactData) => {
    try {
      const res = await saveOnboardingContact(contactData);
      toast.success('Contact saved');
      await loadSubData();
      return { success: true, contact: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to save contact';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const removeContact = async (contactId) => {
    try {
      await deleteOnboardingContact(contactId);
      toast.success('Contact removed');
      await loadSubData();
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remove contact';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  // SLA Sign
  const signPlatformSla = async (signerName, signerDesignation) => {
    try {
      const res = await apiSignSla({ signerName, signerDesignation });
      toast.success('SLA signed successfully');
      await refreshState();
      return { success: true, data: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to sign SLA';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  // Submit onboarding
  const submitApplication = async () => {
    setSaving(true);
    try {
      const res = await apiSubmitOnboarding();
      toast.success('Enterprise onboarding application submitted successfully!');
      await refreshState();
      return { success: true, onboarding: res.data?.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Application submission failed';
      toast.error(msg);
      return { success: false, message: msg };
    } finally {
      setSaving(false);
    }
  };

  // Activation status
  const checkActivation = async () => {
    try {
      const res = await apiFetchActivationStatus();
      setActivation(res.data?.data);
      return res.data?.data;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  return {
    loading,
    saving,
    currentStep,
    onboarding,
    config,
    company,
    documents,
    branches,
    contacts,
    stepCompletion,
    activation,
    goToStep,
    saveStep,
    refreshState,
    verifyGst,
    verifyPan,
    verifyCin,
    verifyBank,
    sendContactOtp,
    confirmContactOtp,
    uploadDocument,
    addBranch,
    updateBranch,
    removeBranch,
    addOrUpdateContact,
    removeContact,
    signPlatformSla,
    submitApplication,
    checkActivation
  };
}
