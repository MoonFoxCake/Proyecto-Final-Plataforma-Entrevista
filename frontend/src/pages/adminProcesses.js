export const PROCESS_STATUSES = {
  ACTIVE: 'Activo',
  IN_REVIEW: 'En revisión',
  READY_TO_PUBLISH: 'Listo para publicar',
  PUBLISHED: 'Publicado',
  FINALIZED: 'Finalizado',
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

export function isClosed(process, now = new Date()) {
  const end = processDate(process.endDate);
  // A closing date without a time includes that whole calendar day.
  if (end && typeof process.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(process.endDate)) end.setHours(23, 59, 59, 999);
  return Boolean(process.evaluationsPublishedAt || ['PUBLISHED', 'FINALIZED'].includes(process.status) || (end && end < now));
}

export const companyKey = (process) => process.orgId || `name:${process.company || ''}`;
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export function filterProcesses(processes, filters) {
  const from = processDate(filters.from);
  const until = processDate(filters.until);
  if (until) until.setHours(23, 59, 59, 999);
  return processes.filter((process) => {
    const summary = processSummary(process);
    const start = processDate(process.availableFrom);
    return normalize([process.name, process.company, process.position].join(' ')).includes(normalize(filters.query.trim()))
      && (filters.company === 'all' || companyKey(process) === filters.company)
      && (filters.status === 'all' || process.status === filters.status)
      && (filters.period === 'all' || (filters.period === 'current' ? !isClosed(process) : isClosed(process)))
      && (filters.work === 'all'
        || (filters.work === 'pending' && summary.pending > 0 && process.status !== 'PUBLISHED')
        || (filters.work === 'ready' && process.status === 'READY_TO_PUBLISH')
        || (filters.work === 'published' && process.status === 'PUBLISHED'))
      && (!from || (start && start >= from))
      && (!until || (start && start <= until));
  }).sort((a, b) => {
    let comparison = 0;
    if (filters.sort === 'name') comparison = (a.name || '').localeCompare(b.name || '', 'es');
    else if (filters.sort === 'pending') comparison = processSummary(b).pending - processSummary(a).pending;
    if (comparison) return comparison;
    const dateA = processDate(a.availableFrom);
    const dateB = processDate(b.availableFrom);
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;
    return ((dateA?.getTime() || 0) - (dateB?.getTime() || 0)) * (filters.sort === 'oldest' ? 1 : -1)
      || String(a.id).localeCompare(String(b.id));
  });
}
