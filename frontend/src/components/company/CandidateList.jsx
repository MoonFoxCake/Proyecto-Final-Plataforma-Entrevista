import { StatusBadge } from '../ui';
import { citationState } from '../../utils/eventModality.js';

function initials(name = '') {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'CA';
}

function formatAppointment(value) {
  if (!value) return 'Sin cita';
  const raw = value._seconds ? value._seconds * 1000 : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** General status of the candidate's evaluation (onsite: the citation has its own column). */
export function EvaluationStatus({ status, profileAvailable, onsite }) {
  if (profileAvailable) return <StatusBadge tone='ok'>Perfil disponible</StatusBadge>;
  if (status === 'EVALUATION_COMPLETED') return <StatusBadge tone='warning'>En revisión</StatusBadge>;
  if (onsite) return <StatusBadge tone='muted'>Por evaluar</StatusBadge>;
  if (status === 'INVITATION_SENT') return <StatusBadge tone='info'>Invitación enviada</StatusBadge>;
  return <StatusBadge tone='muted'>Pendiente de envío</StatusBadge>;
}

/** Onsite: whether the citation e-mail went out and its last known delivery status. */
function CitationStatus({ citation }) {
  const { label, tone, detail } = citationState(citation);
  return <StatusBadge tone={tone} title={detail}>{label}</StatusBadge>;
}

/**
 * Candidates of an event: identity, citation (onsite), appointment and
 * general evaluation status. `citationAction` is rendered next to the
 * citation column title (e.g. refresh the delivery status).
 */
export function CandidateList({ candidates, onsite = false, citationAction = null }) {
  return (
    <table className='w-full text-left'>
      <thead className='border-y border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
        <tr>
          <th scope='col' className='px-5 py-3'>Candidato</th>
          <th scope='col' className='hidden px-5 py-3 xl:table-cell'>Cédula</th>
          {onsite && (
            <th scope='col' className='px-5 py-3'>
              <span className='inline-flex items-center gap-2'>Citación {citationAction}</span>
            </th>
          )}
          <th scope='col' className='px-5 py-3'>{onsite ? 'Evaluación' : 'Estado'}</th>
          <th scope='col' className='hidden px-5 py-3 xl:table-cell'>Cita</th>
        </tr>
      </thead>
      <tbody className='divide-y divide-[#E8EDF2]'>
        {candidates.map((candidate) => (
          <tr key={candidate.id} className='bg-white'>
            <td className='max-w-[18rem] px-5 py-4'>
              <div className='flex items-center gap-3'>
                <span aria-hidden='true' className='hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7F7F6] text-xs font-bold text-[#087D79] sm:flex'>{initials(candidate.nombreCompleto)}</span>
                <div className='min-w-0'>
                  <p className='text-sm font-semibold text-[#101828]'>{candidate.nombreCompleto}</p>
                  <p className='truncate text-xs text-[#64748B]' title={candidate.correo}>{candidate.correo}</p>
                  <p className='text-xs text-[#64748B] xl:hidden'>Cédula {candidate.cedula} · {formatAppointment(candidate.fechaHoraCita)}</p>
                </div>
              </div>
            </td>
            <td className='hidden px-5 py-4 text-sm text-[#475569] xl:table-cell'>{candidate.cedula}</td>
            {onsite && <td className='px-5 py-4'><CitationStatus citation={candidate.citation} /></td>}
            <td className='px-5 py-4'><EvaluationStatus status={candidate.status} profileAvailable={candidate.profileAvailable} onsite={onsite} /></td>
            <td className='hidden whitespace-nowrap px-5 py-4 text-sm text-[#475569] xl:table-cell'>{formatAppointment(candidate.fechaHoraCita)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
