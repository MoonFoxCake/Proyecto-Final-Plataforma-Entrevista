import { auth } from '../config/firebase';
const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
async function token() { if (!auth.currentUser) throw new Error('Inicia sesión nuevamente.'); return auth.currentUser.getIdToken(); }
export async function getPendingResults() { const t = await token(); const r = await fetch(`${API}/admin/results/pending`, { headers: { Authorization: `Bearer ${t}` } }); const j = await r.json(); if (!r.ok) throw new Error(j.message || 'No se pudieron cargar los resultados.'); return j.data || []; }
export async function uploadResult(eventId, module, file) { const t = await token(); const body = new FormData(); body.append('pdf', file); const r = await fetch(`${API}/admin/results/${eventId}/${module}`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body }); const j = await r.json(); if (!r.ok) throw new Error(j.message || 'No se pudo entregar el resultado.'); return j.data; }
