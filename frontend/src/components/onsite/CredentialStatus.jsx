import { StatusBadge } from '../ui';

const STATUS = {
  GENERATED: ['Preparado', 'info'],
  // Older credentials, from when each code was enabled by hand: they work like a prepared one.
  ENABLED: ['Preparado', 'info'],
  USED: ['En uso', 'ok'],
  REVOKED: ['Revocado', 'error'],
  EXPIRED: ['Vencido', 'warning'],
};

const formatTime = (value) => new Intl.DateTimeFormat('es-GT', { timeStyle: 'short' }).format(new Date(value));

/**
 * State of a candidate's onsite access code (never the code itself). With
 * `accessWindow`, an unused code reads as what it does right now: it
 * activates at the start of the appointment, is active during the entry
 * window, and lets nobody begin after it (a recovery code is not limited).
 */
export function CredentialStatus({ credential, accessWindow = null }) {
  if (!credential) return <StatusBadge tone='muted'>Sin acceso</StatusBadge>;
  if (LIVE_STATUSES.includes(credential.status)) {
    if (credential.recovery) return <StatusBadge tone='info' title='Funciona solo en la computadora donde comenzó'>Recuperación</StatusBadge>;
    if (accessWindow?.state === 'PENDING') return <StatusBadge tone='muted'>Se activa a las {formatTime(accessWindow.opensAt)}</StatusBadge>;
    if (accessWindow?.state === 'OPEN') return <StatusBadge tone='ok'>Activo hasta las {formatTime(accessWindow.closesAt)}</StatusBadge>;
    if (accessWindow?.state === 'CLOSED') return <StatusBadge tone='warning'>Sin usar · ventana cerrada</StatusBadge>;
  }
  const [label, tone] = STATUS[credential.status] || [credential.status, 'muted'];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export const LIVE_STATUSES = ['GENERATED', 'ENABLED'];
