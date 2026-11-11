import { isOnsite, modulesOf } from '../utils/eventModality.js';

export const EVENT_STATES = {
  active: { label: 'Activo', tone: 'info' },
  review: { label: 'En revisión', tone: 'warning' },
  ready: { label: 'Listo para publicar', tone: 'warning' },
  published: { label: 'Con resultados', tone: 'ok' },
  finished: { label: 'Finalizado', tone: 'muted' },
  draft: { label: 'Borrador', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'error' },
  archived: { label: 'Archivado', tone: 'muted' },
  unknown: { label: 'Estado por confirmar', tone: 'muted' },
};
export const nameOf = (event) => event.name || event.title || event.eventName || event.positionName || 'Evento sin nombre';
export const positionOf = (event) => event.position || event.positionName || '';
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function dateOf(value) {
  if (!value) return null;
  const raw = typeof value.toDate === 'function' ? value.toDate() : value.seconds != null || value._seconds != null ? (value.seconds ?? value._seconds) * 1000 : value;
  const date = new Date(typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
export const availabilityOf = (event) => dateOf(event.onsite?.startsAt || event.availableFrom || event.fechaHoraCita || event.eventDate || event.date);
export function stateOf(event) {
  if (event.evaluationsPublishedAt) return 'published';
  return ({ ACTIVE: 'active', IN_REVIEW: 'review', READY_TO_PUBLISH: 'ready', PUBLISHED: 'published', FINALIZED: 'finished', CLOSED: 'finished', COMPLETED: 'finished', DRAFT: 'draft', CANCELLED: 'cancelled', ARCHIVED: 'archived' })[String(event.status || '').toUpperCase()] || 'unknown';
}
const dayStart = (value) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; };
const dayEnd = (value) => { const date = new Date(value); date.setHours(23, 59, 59, 999); return date; };
export function rangeOf(filters, now = new Date()) {
  const from = dayStart(now);
  const until = dayEnd(now);
  if (filters.period === 'today') return { from, until };
  if (filters.period === 'next7') { until.setDate(until.getDate() + 6); return { from, until }; }
  if (filters.period === 'last30') { from.setDate(from.getDate() - 29); return { from, until }; }
  if (filters.period === 'custom') return { from: dateOf(filters.from), until: dateOf(filters.until) ? dayEnd(dateOf(filters.until)) : null };
  return { from: null, until: null };
}
export function invalidRange(filters) {
  const range = rangeOf(filters);
  return Boolean(range.from && range.until && range.from > range.until);
}

export function filterCompanyEvents(events, filters, now = new Date()) {
  const query = normalize(filters.query);
  const { from, until } = rangeOf(filters, now);
  if (from && until && from > until) return [];
  return events.filter((event) => {
    const text = normalize([nameOf(event), positionOf(event), event.description, event.onsite?.venue, event.onsite?.room].join(' '));
    const date = availabilityOf(event);
    return (!query || query.split(/\s+/).every((word) => text.includes(word)))
      && (filters.modality === 'all' || (isOnsite(event) ? 'onsite' : 'online') === filters.modality)
      && (filters.status === 'all' || stateOf(event) === filters.status)
      && (filters.module === 'all' || modulesOf(event).includes(filters.module))
      && (filters.period !== 'undated' || !date)
      && (!from || (date && date >= from)) && (!until || (date && date <= until));
  }).sort((a, b) => {
    if (filters.sort === 'name') return nameOf(a).localeCompare(nameOf(b), 'es') || String(a.id).localeCompare(String(b.id));
    const first = availabilityOf(a)?.getTime();
    const second = availabilityOf(b)?.getTime();
    if (first == null && second != null) return 1;
    if (first != null && second == null) return -1;
    return ((first ?? 0) - (second ?? 0)) * (filters.sort === 'upcoming' ? 1 : -1) || nameOf(a).localeCompare(nameOf(b), 'es') || String(a.id).localeCompare(String(b.id));
  });
}
