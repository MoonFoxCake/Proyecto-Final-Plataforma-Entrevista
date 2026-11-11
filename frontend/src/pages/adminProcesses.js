/** Where the results of a process stand, from the state of each of its phases. */
export const RESULT_STATES = {
  PENDING: 'PDF por entregar',
  IN_PROGRESS: 'En curso',
  DELIVERED: 'Resultados entregados',
  NOT_STARTED: 'Sin respuestas aún',
};

export const PHASE_REPORT_LABELS = {
  DELIVERED: 'PDF entregado',
  PENDING: 'PDF por entregar',
  IN_PROGRESS: 'En curso',
  NOT_STARTED: 'Sin iniciar',
};

export function processDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T00:00:00';
  const date = value.toDate ? value.toDate() : new Date(
    value.seconds != null || value._seconds != null ? (value.seconds ?? value._seconds) * 1000 : value,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function processSummary(process) {
  const count = (value) => Math.max(0, Number(value) || 0);
  const total = count(process.summary?.totalParticipants);
  const responses = Math.min(total, count(process.summary?.responsesReceived));
  const reviewed = Math.min(responses, count(process.summary?.reviewed));
  return { total, responses, reviewed, pending: responses - reviewed, waiting: total - responses };
}

/** Phases of the process with their result state, in order. */
export const phaseReports = (process) => ['A', 'B', 'C']
  .filter((module) => process.reports?.[module])
  .map((module) => ({ module, state: process.reports[module] }));

/** Number of phases finished and waiting for their PDF. */
export const pendingReports = (process) => phaseReports(process).filter((phase) => phase.state === 'PENDING').length;

export function resultState(process) {
  const phases = phaseReports(process);
  if (phases.some((phase) => phase.state === 'PENDING')) return 'PENDING';
  if (phases.length && phases.every((phase) => phase.state === 'DELIVERED')) return 'DELIVERED';
  if (phases.some((phase) => phase.state !== 'NOT_STARTED')) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

export function isClosed(process, now = new Date()) {
  const end = processDate(process.endDate);
  // A closing date without a time includes that whole calendar day.
  if (end && typeof process.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(process.endDate)) end.setHours(23, 59, 59, 999);
  return Boolean(resultState(process) === 'DELIVERED' || process.status === 'FINALIZED' || (end && end < now));
}

export const companyKey = (process) => process.orgId || `name:${process.company || ''}`;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

export function filterProcesses(processes, filters) {
  const from = processDate(filters.from);
  const until = processDate(filters.until);
  if (until) until.setHours(23, 59, 59, 999);
  return processes.filter((process) => {
    const start = processDate(process.availableFrom);
    return normalize([process.name, process.company, process.position].join(' ')).includes(normalize(filters.query.trim()))
      && (filters.company === 'all' || companyKey(process) === filters.company)
      && (filters.period === 'all' || (filters.period === 'current' ? !isClosed(process) : isClosed(process)))
      && (filters.work === 'all' || resultState(process) === filters.work)
      && (!from || (start && start >= from))
      && (!until || (start && start <= until));
  }).sort((a, b) => {
    let comparison = 0;
    if (filters.sort === 'name') comparison = (a.name || '').localeCompare(b.name || '', 'es');
    else if (filters.sort === 'pending') comparison = pendingReports(b) - pendingReports(a);
    if (comparison) return comparison;
    // Most recent / oldest: by creation, then by start date.
    const dateA = processDate(a.createdAt) || processDate(a.availableFrom);
    const dateB = processDate(b.createdAt) || processDate(b.availableFrom);
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;
    return ((dateA?.getTime() || 0) - (dateB?.getTime() || 0)) * (filters.sort === 'oldest' ? 1 : -1)
      || String(a.id).localeCompare(String(b.id));
  });
}
