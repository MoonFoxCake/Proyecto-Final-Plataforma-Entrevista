import { isOnsite, modulesOf } from '../utils/eventModality.js';

export const CANDIDATE_STATES = {
  pending: { label: 'Pendiente de invitación', tone: 'muted' },
  invited: { label: 'Invitación enviada', tone: 'info' },
  review: { label: 'En revisión', tone: 'warning' },
  published: { label: 'Perfil disponible', tone: 'ok' },
  completed: { label: 'Completado', tone: 'ok' },
  failed: { label: 'Error de envío', tone: 'error' },
  unknown: { label: 'Estado por confirmar', tone: 'muted' },
};
export const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
export const eventName = (event) => event.name || event.title || event.eventName || event.positionName || 'Evento sin nombre';
export const positionName = (event) => event.position || event.positionName || '';

export function asDate(value) {
  if (!value) return null;
  const raw = typeof value.toDate === 'function' ? value.toDate() : value._seconds != null || value.seconds != null ? (value._seconds ?? value.seconds) * 1000 : value;
  const date = new Date(typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function moduleIncluded(row, module) {
  return module === 'A' || modulesOf(row.event).includes(module) || Boolean(row.candidate[`module${module}`]);
}

export function candidateState(row, module = 'A') {
  const { candidate } = row;
  const stage = module === 'A' ? candidate : candidate[`module${module}`];
  if (module === 'A' && candidate.profileAvailable) return 'published';
  if (stage?.status === 'COMPLETED' || stage?.status === 'EVALUATION_COMPLETED' || stage?.submittedAt) return module === 'A' ? 'review' : 'completed';
  if (stage?.status === 'INVITATION_FAILED' || stage?.citation?.status === 'FAILED' || ['bounced', 'failed', 'complained', 'canceled'].includes(stage?.citation?.delivery?.status)) return 'failed';
  if (['INVITATION_SENT', 'CITED'].includes(stage?.status) || stage?.citation?.status === 'SENT') return 'invited';
  if (!stage || !stage.status || ['INVITED_PENDING', 'PENDING_CITATION'].includes(stage.status)) return 'pending';
  return 'unknown';
}

export function stateLabel(row, module = 'A') {
  const state = candidateState(row, module);
  if (state === 'invited' && isOnsite(row.event)) return 'Citación enviada';
  if (state === 'pending' && isOnsite(row.event)) return 'Pendiente de citación';
  return CANDIDATE_STATES[state].label;
}

export function appointmentOf(row, module = 'A') {
  const stage = module === 'A' ? row.candidate : row.candidate[`module${module}`];
  // Later modules have their own appointment; never substitute Module A's date.
  if (module !== 'A') return stage?.citation?.appointment?.startsAt || stage?.appointment?.startsAt || stage?.fechaHoraCita || null;
  return row.candidate.citation?.appointment?.startsAt || row.candidate.fechaHoraCita || row.event.onsite?.startsAt || row.event.availableFrom || null;
}

export function filterCandidateRows(rows, filters) {
  const query = normalize(filters.query);
  const idQuery = /^[\d\s-]+$/.test(query) ? query.replace(/\D/g, '') : '';
  const result = rows.filter((row) => {
    const { candidate, event } = row;
    if (!moduleIncluded(row, filters.module)) return false;
    if (filters.event !== 'all' && event.id !== filters.event) return false;
    if (filters.modality !== 'all' && (isOnsite(event) ? 'onsite' : 'online') !== filters.modality) return false;
    if (filters.status !== 'all' && candidateState(row, filters.module) !== filters.status) return false;
    const haystack = normalize(`${candidate.nombreCompleto || ''} ${candidate.correo || ''} ${candidate.cedula || ''} ${eventName(event)} ${positionName(event)}`);
    return !query || query.split(/\s+/).every((word) => haystack.includes(word)) || (idQuery && String(candidate.cedula || '').replace(/\D/g, '').includes(idQuery));
  });
  return result.sort((a, b) => {
    if (filters.sort === 'appointment') {
      const first = asDate(appointmentOf(a, filters.module))?.getTime() ?? Infinity;
      const second = asDate(appointmentOf(b, filters.module))?.getTime() ?? Infinity;
      if (first !== second) return first < second ? -1 : 1;
    }
    if (filters.sort === 'recent') {
      const first = asDate(a.candidate.createdAt || a.event.createdAt)?.getTime() ?? -Infinity;
      const second = asDate(b.candidate.createdAt || b.event.createdAt)?.getTime() ?? -Infinity;
      if (first !== second) return first > second ? -1 : 1;
    }
    return String(a.candidate.nombreCompleto || '').localeCompare(String(b.candidate.nombreCompleto || ''), 'es') || eventName(a.event).localeCompare(eventName(b.event), 'es') || a.key.localeCompare(b.key);
  });
}
