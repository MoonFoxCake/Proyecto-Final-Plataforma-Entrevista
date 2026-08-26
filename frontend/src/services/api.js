import axios from 'axios';

/**
 * Shared axios instance for all API calls. Attaches the current user's
 * Firebase ID token as a Bearer Authorization header on every request.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  // TODO: fetch the current Firebase user's ID token and attach it, e.g.
  // const token = await auth.currentUser?.getIdToken();
  // if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
