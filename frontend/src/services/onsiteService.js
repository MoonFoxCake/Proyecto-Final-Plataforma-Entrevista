import api from './api';

/** Applicator panel: cited candidates of a module with attendance, access and evaluation status. */
export async function getRoster(eventId, modulo) {
  const { data } = await api.get(`/events/${eventId}/onsite`, { params: { modulo } });
  return data?.data ?? null;
}

/** Marks a candidate present (after checking their identity) or undoes it. */
export async function setAttendance(eventId, modulo, candidateId, presente) {
  const { data } = await api.post(`/events/${eventId}/onsite/attendance`, { modulo, candidateId, presente });
  return data?.data ?? null;
}

/** Enables the access codes of present candidates; the rest come back in `skipped` with the reason. */
export async function enableCredentials(eventId, modulo, candidateIds) {
  const { data } = await api.post(`/events/${eventId}/onsite/enable`, { modulo, candidateIds });
  return data?.data ?? null;
}
