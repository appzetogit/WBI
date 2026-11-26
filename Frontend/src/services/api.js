import axios from 'axios';
import { toast } from 'sonner';
import { apiCache } from '../utils/apiCache';

// API Base URL
// On local Vite, always use same-origin `/api` so the vite proxy hits the instrumented backend.
const isLocalHost =
  typeof window !== 'undefined' &&
  (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(window.location.hostname));
let rawBaseUrl = isLocalHost
  ? '/api'
  : (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://app.wbinfs.com/api');
if (rawBaseUrl && !rawBaseUrl.endsWith('/api') && !rawBaseUrl.endsWith('/api/')) {
  rawBaseUrl = rawBaseUrl.replace(/\/$/, '') + '/api';
}
const API_BASE_URL = rawBaseUrl;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15-second timeout as temporary safety net for OTP slowness
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // For cookies
});

// Helper to get token keys based on role/path
const getTokenKeys = (url) => {
  // 1. Prioritize current page context for role-based tokens
  if (window.location.pathname.startsWith('/admin')) {
    return { access: 'adminAccessToken', refresh: 'adminRefreshToken', role: 'admin' };
  }
  if (window.location.pathname.startsWith('/vendor')) {
    return { access: 'vendorAccessToken', refresh: 'vendorRefreshToken', role: 'vendor' };
  }
  if (window.location.pathname.startsWith('/engineer')) {
    return { access: 'engineerAccessToken', refresh: 'engineerRefreshToken', role: 'engineer' };
  }
  if (window.location.pathname.startsWith('/worker')) {
    return { access: 'workerAccessToken', refresh: 'workerRefreshToken', role: 'worker' };
  }

  // 2. Explicitly detect auth routes regardless of current page (for cross-role login/actions)
  if (url?.includes('/admin/auth')) return { access: 'adminAccessToken', refresh: 'adminRefreshToken', role: 'admin' };
  if (url?.includes('/vendors/auth')) return { access: 'vendorAccessToken', refresh: 'vendorRefreshToken', role: 'vendor' };
  if (url?.includes('/engineers/auth')) return { access: 'engineerAccessToken', refresh: 'engineerRefreshToken', role: 'engineer' };
  if (url?.includes('/workers/auth')) return { access: 'workerAccessToken', refresh: 'workerRefreshToken', role: 'worker' };
  if (url?.includes('/b2b')) return { access: 'b2bAccessToken', refresh: 'b2bRefreshToken', role: 'b2b' };

  // 3. Instead of fallback to user, check for exact match
  if (window.location.pathname.startsWith('/user')) {
    return { access: 'accessToken', refresh: 'refreshToken', role: 'user' };
  }
  if (window.location.pathname.startsWith('/b2b')) {
    return { access: 'b2bAccessToken', refresh: 'b2bRefreshToken', role: 'b2b' };
  }
  
  // Return null or default structure if no match
  return { access: 'accessToken', refresh: 'refreshToken', role: null };
};

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const { access } = getTokenKeys(config.url);
    const token = sessionStorage.getItem(access) || localStorage.getItem(access);

    // For debugging
    // console.log(`Request to ${config.url}, using token key: ${access}, token exists: ${!!token}`);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Vendor onboarding runs before a vendor session exists (unapproved vendors
    // are rejected by `authenticate`). These endpoints authorise via a scoped
    // onboarding token instead, issued at /vendor/onboarding/submit.
    if (config.url?.includes('/vendor/onboarding') ||
        config.url?.includes('/vendor/verify-kyc') ||
        config.url?.includes('/vendor/verify-bank-penny-drop') ||
        config.url?.includes('/vendor/complete-induction')) {
      const onboardingToken = localStorage.getItem('vendorOnboardingToken');
      if (onboardingToken) {
        config.headers['x-onboarding-token'] = onboardingToken;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track if we're currently refreshing
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor - Handle token refresh
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Do not attempt to refresh token for auth/login endpoints
    const isAuthEndpoint = originalRequest.url?.includes('/auth/') || originalRequest.url?.includes('/login');

    // If error is 401, we haven't tried to refresh yet, and it's NOT an auth endpoint
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const { access, refresh, role } = getTokenKeys(originalRequest.url);
      const refreshToken = sessionStorage.getItem(refresh) || localStorage.getItem(refresh);

      if (!refreshToken) {
        // No refresh token, logout
        handleLogout(role);
        return Promise.reject(error);
      }

      try {
        // Determine correct refresh endpoint dynamically
        const refreshEndpoints = {
          vendor: '/vendors/auth/refresh-token',
          engineer: '/engineers/auth/refresh-token',
          worker: '/workers/auth/refresh-token',
          admin: '/admin/auth/refresh-token',
          b2b: '/b2b/refresh-token'
        };
        const refreshEndpoint = refreshEndpoints[role] || '/users/auth/refresh-token';

        // Try to refresh the token
        const response = await axios.post(`${API_BASE_URL}${refreshEndpoint}`, {
          refreshToken
        });

        const { accessToken } = response.data;

        // Save new access token - Try session first, then local (update where it was found)
        if (sessionStorage.getItem(access)) {
          sessionStorage.setItem(access, accessToken);
        } else {
          localStorage.setItem(access, accessToken);
        }

        // Update authorization header
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Process queued requests
        processQueue(null, accessToken);
        isRefreshing = false;

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        console.error('RefreshToken failed:', refreshError);
        // Refresh failed, logout
        processQueue(refreshError, null);
        isRefreshing = false;
        toast.error('Session expired. Please log in again.');
        handleLogout(role);
        return Promise.reject(refreshError);
      }
    }

    // Determine role from request URL to handle logout if needed
    const { role } = getTokenKeys(originalRequest.url);

    // Global Error Handling via Sonner Toasts
    if (originalRequest?.skipErrorToast) {
      return Promise.reject(error);
    }

    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message?.toLowerCase() || '';

      switch (status) {
        case 401:
          // If it's a 401 on an auth endpoint (like wrong password), don't trigger global logout
          if (!isAuthEndpoint) {
            toast.error('Session expired. Please log in again.');
            handleLogout(role);
          }
          break;
        case 403:
          {
            console.error('Access Denied (403):', error.response.data?.message);
            const isPendingApproval = message.includes('pending') || message.includes('rejected') || message.includes('suspended');
            const path = window.location.pathname;
            
            if (!path.includes('/login') && !isPendingApproval) {
              toast.error("Access denied. You don't have permission.");
              handleLogout(role);
            }
          }
          break;
        case 429:
          toast.warning("Please slow down. You're making too many requests.");
          break;
        case 500:
          toast.error("Server error. We're looking into it, please try again later.");
          break;
        default:
          // Fallback for 400s (Bad Request, Conflict, etc) to show the exact backend message
          if (status >= 400 && status < 500 && error.response.data?.message) {
            toast.error(error.response.data.message);
          }
          break;
      }
    } else if (error.request) {
      // Network Error / No Response
      if (!axios.isCancel(error)) {
        toast.error("Network error. Please check your internet connection.");
      }
    }

    return Promise.reject(error);
  }
);

// Handle logout
export const handleLogout = (role = null) => {
  if (!role) {
    // Determine role from path if not provided
    const path = window.location.pathname;
    if (path.startsWith('/admin')) role = 'admin';
    else if (path.startsWith('/vendor')) role = 'vendor';
    else if (path.startsWith('/engineer')) role = 'engineer';
    else if (path.startsWith('/worker')) role = 'worker';
    else if (path.startsWith('/b2b')) role = 'b2b';
    else if (path.startsWith('/user')) role = 'user';
    else role = null; // No default role
  }

  if (!role) {
    // If we still don't know the role, we can't properly clear tokens.
    // We could clear all, but it's safer to just let the specific route handle it.
    return;
  }

  // Clear role-specific tokens selectively
  const clearTokens = (prefix) => {
    // Clear both sessionStorage and localStorage to prevent state mismatch
    sessionStorage.removeItem(`${prefix}AccessToken`);
    sessionStorage.removeItem(`${prefix}RefreshToken`);
    sessionStorage.removeItem(`${prefix}Data`);

    localStorage.removeItem(`${prefix}AccessToken`);
    localStorage.removeItem(`${prefix}RefreshToken`);
    localStorage.removeItem(`${prefix}Data`);
  };

  if (['vendor', 'engineer', 'worker', 'admin', 'b2b'].includes(role)) {
    clearTokens(role);
    const loginPath = `/${role}/login`;
    if (window.location.pathname !== loginPath) {
      window.dispatchEvent(new CustomEvent('auth:redirect', { detail: { path: loginPath } }));
    }
  } else {
    // User
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('userData');
    if (!window.location.pathname.includes('/login')) {
      window.dispatchEvent(new CustomEvent('auth:redirect', { detail: { path: '/user/login' } }));
    }
  }
};

export { apiCache };
export default api;
