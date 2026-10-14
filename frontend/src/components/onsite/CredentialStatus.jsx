import { StatusBadge } from '../ui';

const STATUS = {
  GENERATED: ['Preparado', 'info'],
  ENABLED: ['Habilitado', 'ok'],
  USED: ['En uso', 'ok'],
  REVOKED: ['Revocado', 'error'],
  EXPIRED: ['Vencido', 'warning'],
};

/** State of a candidate's onsite access code (never the code itself). */
export function CredentialStatus({ credential }) {
  if (!credential) return <StatusBadge tone='muted'>Sin acceso</StatusBadge>;
  const [label, tone] = STATUS[credential.status] || [credential.status, 'muted'];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export const LIVE_STATUSES = ['GENERATED', 'ENABLED'];
