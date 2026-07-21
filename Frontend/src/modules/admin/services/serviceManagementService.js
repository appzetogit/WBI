import api from '../../../services/api';

export const listManagedServices = async (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.append(k, v);
  });
  const res = await api.get(`/admin/service-management?${qs.toString()}`);
  return res.data;
};

export const getManagedService = async (categoryCode) => {
  const res = await api.get(`/admin/service-management/${encodeURIComponent(categoryCode)}`);
  return res.data;
};

export const createManagedService = async (payload) => {
  const res = await api.post('/admin/service-management', payload);
  return res.data;
};

export const updateManagedService = async (categoryCode, payload) => {
  const res = await api.put(`/admin/service-management/${encodeURIComponent(categoryCode)}`, payload);
  return res.data;
};

export const setManagedServiceStatus = async (categoryCode, status) => {
  const res = await api.patch(`/admin/service-management/${encodeURIComponent(categoryCode)}/status`, {
    status
  });
  return res.data;
};

export const archiveManagedService = async (categoryCode) => {
  const res = await api.delete(`/admin/service-management/${encodeURIComponent(categoryCode)}`);
  return res.data;
};

export const publishManagedService = async (categoryCode) => {
  const res = await api.post(`/admin/service-management/${encodeURIComponent(categoryCode)}/publish`);
  return res.data;
};

export const upsertSubcategories = async (categoryCode, subCategories) => {
  const res = await api.put(
    `/admin/service-management/${encodeURIComponent(categoryCode)}/subcategories`,
    { subCategories }
  );
  return res.data;
};

export const upsertFormSchema = async (subCatCode, payload) => {
  const res = await api.put(
    `/admin/service-management/forms/${encodeURIComponent(subCatCode)}`,
    payload
  );
  return res.data;
};

export const upsertRegistrationTemplate = async (categoryCode, payload) => {
  const res = await api.put(
    `/admin/service-management/${encodeURIComponent(categoryCode)}/registration`,
    payload
  );
  return res.data;
};

export const upsertDashboardConfiguration = async (categoryCode, payload) => {
  const res = await api.put(
    `/admin/service-management/${encodeURIComponent(categoryCode)}/dashboard`,
    payload
  );
  return res.data;
};

export const rollbackManagedService = async (categoryCode, auditId) => {
  const res = await api.post(`/admin/service-management/${encodeURIComponent(categoryCode)}/rollback`, {
    auditId
  });
  return res.data;
};
