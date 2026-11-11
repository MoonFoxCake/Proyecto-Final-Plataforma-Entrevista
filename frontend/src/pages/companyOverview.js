/**
 * What the company dashboard shows, computed from its processes and their
 * candidates: what needs the company now, the next step of each process,
 * upcoming dates and how candidates move from one phase to the next.
 */
import { isOnsite, modulesOf } from '../utils/eventModality.js';
import { hasCompleted, isOpenIn, isWithdrawn, phaseState } from '../utils/phases.js';

export const PHASES = ['A', 'B', 'C'];
export const PHASE_NAMES = { A: 'Fase A · Cuestionario', B: 'Fase B · Macrocaso', C: 'Fase C · Microcaso' };
const DAY_MS = 864e5;
// A link that closes within this time, with candidates still pending, is flagged.
const CLOSING_SOON_MS = 2 * DAY_MS;

export const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value._seconds != null ? value._seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const eventName = (event) => event.name || event.title || event.eventName || 'Proceso sin nombre';
const delivered = (event, module) => Boolean(event.moduleResults?.[module]?.deliveredAt);
const nextModule = (event, module) => modulesOf(event)[modulesOf(event).indexOf(module) + 1] || null;
const sentAny = (candidates, module) => candidates.some((candidate) => (module === 'B' ? candidate.moduleB : candidate.moduleC?.assignedQuestions?.length));

/** Still in progress: not closed, and not every phase's result delivered yet. */
export const isActiveEvent = (event) => !['CLOSED', 'CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(String(event.status || '').toUpperCase())
  && !modulesOf(event).every((module) => delivered(event, module));

/** Window during which a candidate's current virtual link works, if any. */
function openLink(event, candidate, module) {
  if (isOnsite(event) || !isOpenIn(candidate, module)) return null;
  if (module === 'A') {
    if (candidate.status !== 'INVITATION_SENT') return null;
    return { opensAt: asDate(event.availableFrom), closesAt: asDate(event.availableUntil) };
  }
  const stage = module === 'B' ? candidate.moduleB : candidate.moduleC;
  if (stage?.status !== 'INVITATION_SENT' || !stage.accessWindow) return null;
  return { opensAt: asDate(stage.accessWindow.opensAt), closesAt: asDate(stage.accessWindow.closesAt) };
}

/** The phase a process is in: the last one anybody was invited to. */
function currentPhase(event, candidates) {
  return [...modulesOf(event)].reverse().find((module) => module === 'A' || sentAny(candidates, module)) || 'A';
}

/** One line with what comes next for a process. */
export function nextStep(event, candidates) {
  if (!candidates.length) return { label: 'Agrega a los candidatos', tone: 'action', tab: 'candidatos' };
  if (candidates.some((candidate) => candidate.status === 'INVITED_PENDING')) {
    return { label: isOnsite(event) ? 'Envía las citaciones de la Fase A' : 'Envía las invitaciones de la Fase A', tone: 'action', tab: 'candidatos' };
  }
  const module = currentPhase(event, candidates);
  const state = phaseState(module, candidates);
  if (delivered(event, module)) {
    const next = nextModule(event, module);
    return next
      ? { label: `Elige quién continúa a la Fase ${next}`, tone: 'action', tab: 'resultados' }
      : { label: 'Proceso completo: todos los resultados entregados', tone: 'done', tab: 'resultados' };
  }
  if (state.complete) return { label: `Fase ${module} terminada · esperando su PDF de resultados`, tone: 'waiting', tab: 'resultados' };
  return { label: `Fase ${module} en curso · ${state.completed} de ${state.total - state.withdrawn} respondieron`, tone: 'progress', tab: module === 'A' ? 'candidatos' : 'resultados' };
}

/** What needs the company's attention, most urgent first. */
export function pendingTasks(groups, now = new Date()) {
  const tasks = [];
  groups.filter(({ event }) => isActiveEvent(event)).forEach(({ event, candidates }) => {
    const name = eventName(event);
    const link = (tab) => `/company/events/${event.id}/${tab}`;
    const notInvited = candidates.filter((candidate) => candidate.status === 'INVITED_PENDING').length;
    if (notInvited) tasks.push({ key: `${event.id}-invite`, priority: 2, title: `${name}: ${notInvited} ${notInvited === 1 ? 'candidato sin convocar' : 'candidatos sin convocar'}`, detail: 'Envía la Fase A para que puedan evaluarse.', action: 'Convocar', to: link('candidatos') });

    modulesOf(event).forEach((module) => {
      const next = nextModule(event, module);
      // A received report opens the next phase: the company picks who continues.
      if (delivered(event, module) && next && !sentAny(candidates, next)) {
        tasks.push({ key: `${event.id}-${module}-next`, priority: 1, title: `${name}: recibiste el PDF de la Fase ${module}`, detail: `Elige quién continúa a la Fase ${next}.`, action: 'Elegir', to: link('resultados') });
      }
      // Candidates who have not answered hold the phase back.
      const state = phaseState(module, candidates);
      if (!delivered(event, module) && state.completed > 0 && state.open > 0 && (module !== 'A' || !notInvited)) {
        tasks.push({ key: `${event.id}-${module}-open`, priority: 3, title: `${name}: Fase ${module} con ${state.open} sin responder`, detail: 'Si no se presentarán, puedes cerrar la fase con quienes ya respondieron.', action: 'Revisar', to: link(module === 'A' ? 'candidatos' : 'resultados') });
      }
      // Virtual links about to close with candidates still pending.
      const closing = candidates.map((candidate) => openLink(event, candidate, module)?.closesAt)
        .filter((closesAt) => closesAt && closesAt > now && closesAt - now <= CLOSING_SOON_MS);
      if (closing.length) {
        const soonest = new Date(Math.min(...closing.map((date) => date.getTime())));
        tasks.push({ key: `${event.id}-${module}-closing`, priority: 0, title: `${name}: el enlace de la Fase ${module} cierra pronto`, detail: `${closing.length} ${closing.length === 1 ? 'candidato aún no responde' : 'candidatos aún no responden'}.`, at: soonest, action: 'Ver', to: link(module === 'A' ? 'candidatos' : 'resultados') });
      }
    });
  });
  return tasks.sort((a, b) => a.priority - b.priority || (a.at || 0) - (b.at || 0));
}

/** Reports the company received, newest first. */
export function recentResults(groups, limit = 5) {
  return groups.flatMap(({ event }) => PHASES
    .filter((module) => delivered(event, module))
    .map((module) => ({ key: `${event.id}-${module}`, eventId: event.id, name: eventName(event), module, deliveredAt: asDate(event.moduleResults[module].deliveredAt) })))
    .sort((a, b) => (b.deliveredAt || 0) - (a.deliveredAt || 0))
    .slice(0, limit);
}

/** Onsite sessions and closings of virtual links still to come, soonest first. */
export function upcomingDates(groups, now = new Date(), limit = 6) {
  const dates = new Map();
  const add = (key, item) => { if (item.at && item.at > now && !dates.has(key)) dates.set(key, { key, ...item }); };
  groups.filter(({ event }) => isActiveEvent(event)).forEach(({ event, candidates }) => {
    const name = eventName(event);
    if (isOnsite(event)) {
      add(`${event.id}-A`, { at: asDate(event.onsite?.startsAt), name, module: 'A', kind: 'session', appointment: event.onsite });
      candidates.forEach((candidate) => {
        ['B', 'C'].forEach((module) => {
          const appointment = (module === 'B' ? candidate.moduleB : candidate.moduleC)?.citation?.appointment;
          const at = asDate(appointment?.startsAt);
          if (at) add(`${event.id}-${module}-${at.getTime()}`, { at, name, module, kind: 'session', appointment });
        });
      });
      return;
    }
    modulesOf(event).forEach((module) => {
      const closings = candidates.map((candidate) => openLink(event, candidate, module)?.closesAt).filter(Boolean);
      if (closings.length) {
        const at = new Date(Math.min(...closings.map((date) => date.getTime())));
        add(`${event.id}-${module}-close`, { at, name, module, kind: 'closing', pending: closings.length });
      }
    });
  });
  return [...dates.values()].sort((a, b) => a.at - b.at).slice(0, limit);
}

/** Headline figures across all processes. */
export function overviewFigures(groups, now = new Date()) {
  const candidates = groups.flatMap((group) => group.candidates);
  const openLinks = groups.reduce((total, { event, candidates: list }) => total + list.reduce((count, candidate) => count + PHASES.filter((module) => {
    const window = openLink(event, candidate, module);
    return window && (!window.opensAt || window.opensAt <= now) && (!window.closesAt || window.closesAt > now);
  }).length, 0), 0);
  return {
    activeProcesses: groups.filter(({ event }) => isActiveEvent(event)).length,
    totalProcesses: groups.length,
    evaluated: candidates.filter((candidate) => PHASES.some((module) => hasCompleted(candidate, module))).length,
    totalCandidates: candidates.length,
    reports: groups.reduce((total, { event }) => total + PHASES.filter((module) => delivered(event, module)).length, 0),
    openLinks,
  };
}

/**
 * Candidates who completed each phase, and which share of the previous
 * phase's completed went on (only counting processes that include it).
 */
export function phaseFunnel(groups) {
  return PHASES.map((module, index) => {
    const relevant = groups.filter(({ event }) => modulesOf(event).includes(module));
    const completed = relevant.reduce((total, { candidates }) => total + candidates.filter((candidate) => hasCompleted(candidate, module)).length, 0);
    const invited = relevant.reduce((total, { candidates }) => total + candidates.filter((candidate) => (module === 'A' ? candidate.status !== 'INVITED_PENDING' : !isWithdrawn(candidate, module) && phaseState(module, [candidate]).total > 0)).length, 0);
    if (index === 0) return { module, completed, invited, passRate: null };
    const previous = PHASES[index - 1];
    // Processes that already reached this phase: their completed in the previous one.
    const reached = relevant.filter(({ candidates }) => sentAny(candidates, module));
    const base = reached.reduce((total, { candidates }) => total + candidates.filter((candidate) => hasCompleted(candidate, previous)).length, 0);
    const moved = reached.reduce((total, { candidates }) => total + candidates.filter((candidate) => phaseState(module, [candidate]).total > 0).length, 0);
    return { module, completed, invited, passRate: base ? Math.round((moved / base) * 100) : null };
  }).filter(({ module }) => groups.some(({ event }) => modulesOf(event).includes(module)));
}
