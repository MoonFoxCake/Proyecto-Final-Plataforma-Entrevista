import axios from 'axios';
import { auth } from '../config/firebase.js';

/**
 * Shared axios instance for all API calls. Attaches the current user's
 * Firebase ID token as a Bearer Authorization header on every request.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
