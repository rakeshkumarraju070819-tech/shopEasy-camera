import axios from 'axios';

export const ADMIN_TOKEN_KEY = 'camshield.admin.token';
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE, timeout: 10000 });

const isAdminUrl = (url = '') => url.startsWith('/admin') || url === '/auth/me';

api.interceptors.request.use((cfg) => {
  if (isAdminUrl(cfg.url)) {
    const t = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && isAdminUrl(err.config?.url)) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      if (!window.location.pathname.startsWith('/admin/login')) window.location.assign('/admin/login?expired=1');
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message ||
  (err?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Check that the API is running.' : fallback);

export default api;
