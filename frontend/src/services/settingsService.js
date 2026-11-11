import api from './api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

/** Public content (landing, plans, form defaults). Needs no session. */
export async function getPublicSettings() {
  const response = await fetch(`${API_BASE}/public/settings`);
  if (!response.ok) throw new Error('No se pudo cargar la configuración.');
  const body = await response.json();
  return body?.data ?? null;
}

export async function getSettings() {
  const { data } = await api.get('/admin/settings');
  return data?.data ?? null;
}

export async function updateSettings(settings) {
  const { data } = await api.put('/admin/settings', settings);
  return data?.data ?? null;
}
