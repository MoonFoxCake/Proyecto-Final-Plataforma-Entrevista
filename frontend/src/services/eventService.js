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

export async function publishEventInvitations(eventId) {
  const { data } = await api.post(`/events/${eventId}/invitations/publish`);
  return data?.data ?? null;
}
