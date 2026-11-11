import api from './api';

export async function getEvents() {
  const { data } = await api.get('/events');
  return data?.data ?? [];
}

export async function createEvent(event) {
  const { data } = await api.post('/events', event);
  return data?.data ?? null;
}

export async function getEvent(eventId) {
  const { data } = await api.get(`/events/${eventId}`);
  return data?.data ?? null;
}

export async function getEventCandidates(eventId) {
  const { data } = await api.get(`/events/${eventId}/candidates`);
  return data?.data ?? [];
}

export async function createEventCandidate(eventId, candidate) {
  const { data } = await api.post(`/events/${eventId}/candidates`, candidate);
  return data?.data ?? null;
}

/**
 * Module B (second stage): sends the macrocase link to the selected
 * candidates, or — onsite events — cites them to the `citacion` session.
 */
export async function sendModuleBInvitations(eventId, candidateIds, citacion) {
  const { data } = await api.post(`/events/${eventId}/module-b/invitations`, { candidateIds, ...(citacion ? { citacion } : {}) });
  return data?.data ?? null;
}

/** Onsite events: asks the e-mail provider for the delivery status of the citations. */
export async function refreshCitationStatus(eventId) {
  const { data } = await api.post(`/events/${eventId}/citations/status`);
  return data?.data ?? null;
}

export async function publishEventInvitations(eventId) {
  const { data } = await api.post(`/events/${eventId}/invitations/publish`);
  return data?.data ?? null;
}

/** Processes created before the draw moved to creation: assigns their microcase. */
export async function assignModuleC(eventId) { const { data } = await api.post(`/events/${eventId}/module-c/assign`); return data?.data ?? null; }

/** Module C: which skills of the process's microcase are evaluated. */
export async function configureModuleC(eventId, sectionIds) { const { data } = await api.put(`/events/${eventId}/module-c/configure`, { sectionIds }); return data?.data ?? null; }
export async function sendModuleCInvitations(eventId, candidateIds, citacion) { const { data } = await api.post(`/events/${eventId}/module-c/invitations`, { candidateIds, ...(citacion ? { citacion } : {}) }); return data?.data ?? null; }

/** Module A: a new link or citation for someone who has not answered. */
export async function resendCandidate(eventId, candidateId) { const { data } = await api.post(`/events/${eventId}/candidates/${candidateId}/resend`); return data?.data ?? null; }
export async function withdrawCandidate(eventId, candidateId, modulo) { const { data } = await api.post(`/events/${eventId}/candidates/${candidateId}/withdraw`, { modulo }); return data?.data ?? null; }
export async function closePhase(eventId, module) { const { data } = await api.post(`/events/${eventId}/phases/${module}/close`); return data?.data ?? null; }

export async function getResultDownloadUrl(eventId, module) { const { data } = await api.get(`/events/${eventId}/results/${module}/download`); return data?.data ?? null; }

