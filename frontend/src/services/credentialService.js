import api from './api';

/** Onsite access credentials of an event: one row per candidate and module, without codes. */
export async function getCredentials(eventId) {
  const { data } = await api.get(`/events/${eventId}/credentials`);
  return data?.data ?? { modules: [] };
}

/**
 * Issues codes for the selected candidates. The codes, and the printable
 * cards PDF (`cardsPdf`, on `papel` paper), come back only in this
 * response; candidates who already have one are in `skipped`.
 */
export async function issueCredentials(eventId, modulo, candidateIds, papel) {
  const { data } = await api.post(`/events/${eventId}/credentials`, { modulo, candidateIds, ...(papel ? { papel } : {}) });
  return data?.data ?? null;
}

export async function revokeCredential(eventId, credentialId, motivo) {
  const { data } = await api.post(`/events/${eventId}/credentials/${credentialId}/revoke`, motivo ? { motivo } : {});
  return data?.data ?? null;
}

/** Revokes the credential and issues a new code (and its card) for the same candidate, returned once. */
export async function reissueCredential(eventId, credentialId, motivo, papel) {
  const { data } = await api.post(`/events/${eventId}/credentials/${credentialId}/reissue`, {
    ...(motivo ? { motivo } : {}),
    ...(papel ? { papel } : {}),
  });
  return data?.data ?? null;
}

/** Attendance sheet PDF (no codes) of the candidates cited to a module. */
export async function getAttendanceSheet(eventId, modulo, papel) {
  const response = await api.get(`/events/${eventId}/credentials/attendance.pdf`, { params: { modulo, papel }, responseType: 'blob' });
  const disposition = response.headers?.['content-disposition'] || '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] || `lista-asistencia-modulo-${modulo.toLowerCase()}.pdf`;
  return { blob: response.data, fileName };
}
