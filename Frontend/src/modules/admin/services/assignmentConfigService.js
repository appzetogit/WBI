import api from '../../../services/api';

export const listAssignmentConfigs = async () => {
  const { data } = await api.get('/admin/assignment-configs');
  return data;
};

export const upsertAssignmentConfig = async (categoryCode, payload) => {
  const code = String(categoryCode || 'DEFAULT').toUpperCase();
  const { data } = await api.put(`/admin/assignment-configs/${encodeURIComponent(code)}`, payload);
  return data;
};
