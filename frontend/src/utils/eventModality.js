/**
 * Event modality helpers. Mirrors backend/src/utils/eventModality.js: events
 * created before modalities existed are online and include both modules.
 */

export const isOnsite = (event) => event?.modality === 'onsite';

export function modulesOf(event) {
  return Array.isArray(event?.modules) && event.modules.length ? event.modules : ['A', 'B'];
}

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value._seconds ? value._seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "jueves, 5 de noviembre de 2026 · 8:00 a. m. – 10:00 a. m." */
export function formatSession(session) {
  const startsAt = toDate(session?.startsAt);
  const endsAt = toDate(session?.endsAt);
  if (!startsAt) return 'Sin fecha configurada';
  const date = new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' }).format(startsAt);
  const time = (value) => new Intl.DateTimeFormat('es-GT', { timeStyle: 'short' }).format(value);
  return endsAt ? `${date} · ${time(startsAt)} – ${time(endsAt)}` : `${date} · ${time(startsAt)}`;
}

// Resend `last_event` values.
const DELIVERY_LABELS = {
  sent: ['Enviada', 'info'],
  delivered: ['Entregada', 'ok'],
  opened: ['Entregada · abierta', 'ok'],
  clicked: ['Entregada · abierta', 'ok'],
  delivery_delayed: ['Entrega demorada', 'warning'],
  bounced: ['Rebotada', 'error'],
  complained: ['Marcada como spam', 'error'],
  failed: ['No entregada', 'error'],
  canceled: ['Cancelada', 'error'],
  queued: ['En cola', 'info'],
  scheduled: ['Programada', 'info'],
};

/**
 * Label and tone of a citation for the company: not sent, failed, or the
 * last delivery status known (once refreshed).
 *
 * @returns {{ label: string, tone: 'muted'|'info'|'ok'|'warning'|'error', detail?: string }}
 */
export function citationState(citation) {
  if (!citation) return { label: 'Sin enviar', tone: 'muted' };
  if (citation.status === 'FAILED') return { label: 'Error al enviar', tone: 'error', detail: citation.error };
  const [label, tone] = DELIVERY_LABELS[citation.delivery?.status] || ['Enviada', 'info'];
  return { label, tone };
}
