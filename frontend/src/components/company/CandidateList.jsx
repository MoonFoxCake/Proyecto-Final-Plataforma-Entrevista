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

function CandidateStatus({ status }) {
  if (status === 'EVALUATION_COMPLETED') {
    return <span className='inline-flex items-center gap-1.5 rounded-md bg-[#E8F8F5] px-2.5 py-1 text-xs font-medium text-[#087D79]'><span className='h-1.5 w-1.5 rounded-full bg-[#0AADA8]' /> Evaluación completada</span>;
  }
  if (status === 'INVITATION_SENT') {
    return <span className='inline-flex items-center gap-1.5 rounded-md bg-[#EEF6FF] px-2.5 py-1 text-xs font-medium text-[#315B88]'><span className='h-1.5 w-1.5 rounded-full bg-[#4F8CC9]' /> Invitación enviada</span>;
  }
  return <span className='inline-flex items-center gap-1.5 rounded-md bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#475569]'><span className='h-1.5 w-1.5 rounded-full bg-[#94A3B8]' /> Pendiente de envío</span>;
}

export function CandidateList({ candidates, loading }) {
  if (loading) {
    return <div className='flex min-h-52 items-center justify-center text-sm text-[#64748B]'>Cargando candidatos...</div>;
  }
  if (candidates.length === 0) {
    return (
      <div className='m-5 flex min-h-44 items-center justify-center rounded-xl border border-dashed border-[#CBD5E1] text-center'>
        <div><p className='font-semibold text-[#334155]'>Aún no hay candidatos</p><p className='mt-1 text-sm text-[#94A3B8]'>Agrega el primero para comenzar.</p></div>
      </div>
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-[860px] text-left'>
        <thead className='border-y border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
          <tr><th className='px-5 py-3'>Candidato</th><th className='px-5 py-3'>Cédula</th><th className='px-5 py-3'>Estado</th><th className='px-5 py-3'>Cita</th><th className='px-5 py-3 text-right'>Acciones</th></tr>
        </thead>
        <tbody className='divide-y divide-[#E8EDF2]'>
          {candidates.map((candidate) => (
            <tr key={candidate.id} className='bg-white'>
              <td className='px-5 py-4'><div className='flex items-center gap-3'>
                <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7F7F6] text-xs font-bold text-[#087D79]'>{initials(candidate.nombreCompleto)}</span>
                <div className='min-w-0'><p className='truncate text-sm font-semibold text-[#101828]'>{candidate.nombreCompleto}</p><p className='truncate text-xs text-[#64748B]'>{candidate.correo}</p></div>
              </div></td>
              <td className='px-5 py-4 text-sm text-[#475569]'>{candidate.cedula}</td>
              <td className='px-5 py-4'><CandidateStatus status={candidate.status} /></td>
              <td className='px-5 py-4 text-sm text-[#475569]'>{formatAppointment(candidate.fechaHoraCita)}</td>
              <td className='px-5 py-4 text-right'>
                {candidate.status === 'EVALUATION_COMPLETED' ? (
                  <Link to={`/company/events/${candidate.eventId}/candidates/${candidate.id}/result`} className='inline-flex rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] transition hover:border-[#13A9A4] hover:text-[#087D79]'>Ver resultado</Link>
                ) : <span className='text-xs text-[#A0AEC0]'>No disponible</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
import { Link } from 'react-router-dom';
