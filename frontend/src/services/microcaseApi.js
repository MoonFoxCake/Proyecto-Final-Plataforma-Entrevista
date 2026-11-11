import { auth } from '../config/firebase';
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
async function request(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay un usuario autenticado.');
  const token = await user.getIdToken();
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.error?.message || 'No se pudo completar la operación.');
  return data;
}
export const listMicrocases = () => request('/microcasos');
export const createMicrocase = (data) => request('/microcasos', { method: 'POST', body: JSON.stringify(data) });
export const updateMicrocase = (id, data) => request(`/microcasos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const activateMicrocase = (id) => request(`/microcasos/${id}/activate`, { method: 'POST' });
export const deactivateMicrocase = (id) => request(`/microcasos/${id}/deactivate`, { method: 'POST' });
export const deleteMicrocase = (id) => request(`/microcasos/${id}`, { method: 'DELETE' });
export const previewMicrocase = (id, sectionIds) => request(`/microcasos/${id}/preview`, { method: 'POST', body: JSON.stringify({ sectionIds }) });
