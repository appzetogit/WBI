/**
 * Client-side view of the admin's permissions (from login / profile). Only used
 * to hide what the API would refuse anyway — the backend is the real control.
 */
export const getAdminPermissions = () => {
  try {
    const raw = sessionStorage.getItem('adminData') || localStorage.getItem('adminData');
    const data = JSON.parse(raw || '{}');
    if (Array.isArray(data.permissions)) return data.permissions;
    // Sessions from before RBAC: super admins keep everything, others fall back to the API's answer
    return data.role === 'super_admin' ? ['*'] : null;
  } catch {
    return null;
  }
};

export const hasAdminPermission = (perm) => {
  if (!perm) return true;
  const granted = getAdminPermissions();
  if (granted === null) return true;
  return granted.includes('*') || granted.includes(perm);
};
