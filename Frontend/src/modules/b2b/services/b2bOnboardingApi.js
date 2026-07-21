import api from '../../../../services/api';

const base = '/b2b/onboarding';

export const fetchOnboardingConfig = () => api.get(`${base}/config`);
export const fetchMyOnboarding = () => api.get(`${base}/me`);
export const saveOnboardingStep = (step, payload) => api.patch(`${base}/steps/${step}`, payload);
export const submitOnboarding = () => api.post(`${base}/submit`);
export const fetchActivationStatus = () => api.get(`${base}/activation-status`);
export const registerDocument = (body) => api.post(`${base}/documents`, body);
export const verifyGst = (gstNumber) => api.post(`${base}/verify/gst`, { gstNumber });
export const verifyPan = (panNumber) => api.post(`${base}/verify/pan`, { panNumber });
export const verifyCin = (cinNumber) => api.post(`${base}/verify/cin`, { cinNumber });
export const verifyBank = (accountNumber, ifsc) => api.post(`${base}/verify/bank`, { accountNumber, ifsc });
export const sendContactOtp = (body) => api.post(`${base}/verify/contact-otp/send`, body);
export const confirmContactOtp = (body) => api.post(`${base}/verify/contact-otp/confirm`, body);
export const signSla = (body) => api.post(`${base}/sla/sign`, body);
export const uploadB2BFile = (formData) => api.post('/b2b/documents/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});

export const adminOnboardingDashboard = (params) => api.get('/admin/b2b-onboarding/dashboard', { params });
export const adminOnboardingDetail = (companyId) => api.get(`/admin/b2b-onboarding/companies/${companyId}`);
export const adminOnboardingReview = (companyId, body) => api.post(`/admin/b2b-onboarding/companies/${companyId}/review`, body);
export const adminOnboardingConfig = () => api.get('/admin/b2b-onboarding/config');
export const adminUpdateOnboardingConfig = (body) => api.put('/admin/b2b-onboarding/config', body);
export const fetchOnboardingBranches = () => api.get(`${base}/branches`);
export const createOnboardingBranch = (body) => api.post(`${base}/branches`, body);
export const deleteOnboardingBranch = (branchId) => api.delete(`${base}/branches/${branchId}`);
export const fetchActivityTimeline = () => api.get(`${base}/activity-timeline`);

export const adminSyncCatalog = () => api.post('/admin/b2b-onboarding/config/sync-catalog');
export const adminOnboardingActivity = (companyId) => api.get(`/admin/b2b-onboarding/companies/${companyId}/activity`);
