import api from './api';

export async function getProcesses() {
  const { data } = await api.get('/admin/processes');
  return data?.data ?? [];
}

export async function getProcess(eventId) {
  const { data } = await api.get(`/admin/processes/${eventId}`);
  return data?.data ?? null;
}

export async function getParticipant(eventId, anonymousId) {
  const { data } = await api.get(`/admin/processes/${eventId}/participants/${anonymousId}`);
  return data?.data ?? null;
}

export async function saveReview(eventId, anonymousId, payload) {
  const { data } = await api.patch(`/admin/processes/${eventId}/participants/${anonymousId}`, payload);
  return data?.data ?? null;
}

export async function publishEvaluations(eventId) {
  const { data } = await api.post(`/admin/processes/${eventId}/publish`);
  return data?.data ?? null;
}
