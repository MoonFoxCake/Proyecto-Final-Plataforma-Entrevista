import { isOnsite, modulesOf } from '../../utils/eventModality.js';

/**
 * Derived state of an event detail, shared by its tabs (no extra requests:
 * everything comes from the event and its candidates).
 */

export const eventName = (event) => event?.name || event?.title || event?.eventName || event?.positionName || 'Detalle del evento';

export const eventPosition = (event) => event?.position || event?.positionName || '';

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value._seconds ? value._seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function formatDateTime(value, style = { dateStyle: 'full', timeStyle: 'short' }) {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat('es-GT', style).format(date) : 'Sin fecha configurada';
}

/** Distinct reasons the backend gave for the e-mails that could not be sent. */
export function failureReasons(result) {
  const reasons = [...new Set((result?.failures || []).map((failure) => failure.message).filter(Boolean))];
  return reasons.length ? ` Motivo: ${reasons.join(' · ')}` : '';
}

/** Module B can go to candidates with a published Module A profile who have not answered it yet. */
export function canReceiveModuleB(candidate) {
  return Boolean(candidate.profileAvailable) && candidate.moduleB?.status !== 'COMPLETED';
}

/** Whether `startsAt` is today in the browser's calendar. */
export function isToday(startsAt) {
  const date = toDate(startsAt);
  return Boolean(date) && date.toDateString() === new Date().toDateString();
}

export function summarize(event, candidates) {
  const onsite = isOnsite(event);
  const published = event?.status === 'PUBLISHED' || Boolean(event?.evaluationsPublishedAt);
  return {
    onsite,
    published,
    hasModuleB: modulesOf(event).includes('B'),
    total: candidates.length,
    pending: candidates.filter((candidate) => candidate.status === 'INVITED_PENDING').length,
    contacted: candidates.filter((candidate) => (onsite ? candidate.citation?.status === 'SENT' : candidate.status !== 'INVITED_PENDING')).length,
    completed: candidates.filter((candidate) => candidate.status === 'EVALUATION_COMPLETED' || candidate.profileAvailable).length,
    profiles: candidates.filter((candidate) => candidate.profileAvailable).length,
    moduleBEligible: candidates.filter(canReceiveModuleB).length,
    moduleBSent: candidates.filter((candidate) => candidate.moduleB).length,
    moduleBCompleted: candidates.filter((candidate) => candidate.moduleB?.status === 'COMPLETED').length,
  };
}

/**
 * The single most useful next step for the company, from the event state.
 * `to` is a path relative to the event, or null when there is nothing to do
 * but wait.
 *
 * @param {ReturnType<typeof summarize>} state
 * @param {{ pendingAccesses?: number, onsiteToday?: boolean }} [onsiteInfo]
 * @returns {{ title: string, description: string, label?: string, to?: string }}
 */
export function nextAction(state, { pendingAccesses = 0, onsiteToday = false } = {}) {
  if (!state.published) {
    if (state.total === 0) {
      return { title: 'Agrega a los candidatos', description: 'Registra a las personas que participarán en este evento.', label: 'Agregar candidatos', to: 'candidatos?nuevo=1' };
    }
    if (state.pending > 0) {
      return state.onsite
        ? { title: `Envía las citaciones (${state.pending})`, description: 'Cada candidato recibirá la sede, la fecha y el horario. La citación no incluye accesos.', label: 'Ir a candidatos', to: 'candidatos' }
        : { title: `Publica las invitaciones (${state.pending})`, description: 'Cada candidato recibirá un enlace personal para realizar la evaluación.', label: 'Ir a candidatos', to: 'candidatos' };
    }
    if (state.onsite && pendingAccesses > 0) {
      return { title: `Prepara los accesos (${pendingAccesses})`, description: 'Genera e imprime los accesos temporales antes del día de la evaluación.', label: 'Preparar accesos', to: 'presencial?etapa=preparar' };
    }
    if (state.onsite && onsiteToday) {
      return { title: 'Aplica la evaluación', description: 'Los accesos se activan solos a la hora de inicio. Registra la asistencia y sigue el avance.', label: 'Ir a aplicar', to: 'presencial?etapa=aplicar' };
    }
    return state.completed < state.total
      ? { title: 'Evaluación en curso', description: `${state.completed} de ${state.total} candidatos completaron la evaluación.` }
      : { title: 'En revisión', description: 'El equipo de NexoPerfil está revisando las evaluaciones. Los resultados aparecerán al publicarse.' };
  }
  if (state.hasModuleB && state.moduleBEligible > 0) {
    return { title: 'Elige quiénes continúan al Módulo B', description: 'Revisa los perfiles publicados y selecciona a los candidatos para la segunda etapa.', label: 'Ver resultados', to: 'resultados' };
  }
  return { title: 'Resultados publicados', description: `${state.profiles} perfiles disponibles para consultar.`, label: 'Ver resultados', to: 'resultados' };
}
