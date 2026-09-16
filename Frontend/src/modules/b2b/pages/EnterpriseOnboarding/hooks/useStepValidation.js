import { useMemo } from 'react';

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[6-9]\d{9}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const PINCODE_RE = /^\d{6}$/;

export function validateStep(step, data = {}) {
  const errors = {};

  switch (Number(step)) {
    case 1: { // Company Info
      if (!data.legalName?.trim()) errors.legalName = 'Legal company name is required';
      if (!data.gstNumber?.trim()) {
        errors.gstNumber = 'GSTIN is required';
      } else if (!GSTIN_RE.test(String(data.gstNumber).trim().toUpperCase())) {
        errors.gstNumber = 'Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)';
      }
      if (!data.panNumber?.trim()) {
        errors.panNumber = 'PAN is required';
      } else if (!PAN_RE.test(String(data.panNumber).trim().toUpperCase())) {
        errors.panNumber = 'Invalid PAN format (e.g., ABCDE1234F)';
      }
      break;
    }
    case 2: { // Addresses
      if (!data.registered?.trim() && !data.registeredAddress?.trim()) {
        errors.registered = 'Registered office address is required';
      }
      break;
    }
    case 3: { // Primary Contact
      if (!data.name?.trim()) errors.name = 'Contact person name is required';
      if (!data.email?.trim()) {
        errors.email = 'Email address is required';
      } else if (!EMAIL_RE.test(data.email.trim())) {
        errors.email = 'Invalid email address';
      }
      const phoneDigits = String(data.phone || data.mobile || '').replace(/\D/g, '').slice(-10);
      if (!phoneDigits) {
        errors.phone = 'Mobile number is required';
      } else if (!PHONE_RE.test(phoneDigits)) {
        errors.phone = 'Enter a valid 10-digit Indian mobile number';
      }
      break;
    }
    case 4: { // Finance Contact
      if (!data.name?.trim()) errors.name = 'Finance contact name is required';
      if (!data.email?.trim()) {
        errors.email = 'Finance email is required';
      } else if (!EMAIL_RE.test(data.email.trim())) {
        errors.email = 'Invalid email address';
      }
      break;
    }
    case 5: { // Services
      const services = data.selectedServices || [];
      if (!services.length) {
        errors.selectedServices = 'Please select at least one primary service category';
      }
      break;
    }
    case 6: { // Coverage
      // Optional configuration
      break;
    }
    case 7: { // Banking
      if (!data.accountHolderName?.trim() && !data.accountNumber?.trim()) {
        errors.accountNumber = 'Bank account number is required';
      }
      if (data.ifsc && !IFSC_RE.test(String(data.ifsc).trim().toUpperCase())) {
        errors.ifsc = 'Invalid IFSC code (e.g., HDFC0001234)';
      }
      break;
    }
    case 8: // Credit Profile - optional
    case 9: // Payment rules - optional
    case 10: // SLA - optional
    case 11: // Approval Hierarchy - optional
    case 12: // Bulk Projects - optional
    case 13: // Compliance - optional
      break;
    case 14: { // KYC & Documents
      // Validated dynamically based on required document templates & KYC statuses
      break;
    }
    case 15: // Review - read-only
    case 16: // Submit
      break;
    default:
      break;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export default function useStepValidation(step, stepData) {
  return useMemo(() => validateStep(step, stepData), [step, stepData]);
}
