import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../components/admin/AdminSidebar.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

const STATUS_LABELS = { ACTIVE: 'Activo', IN_REVIEW: 'En revisión', READY_TO_PUBLISH: 'Listo para publicar', PUBLISHED: 'Publicado', FINALIZED: 'Finalizado' };
const PARTICIPANT_LABELS = { NO_RESPONSE: 'Sin respuesta', PENDING_REVIEW: 'Pendiente', REVIEWED: 'Revisado' };

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-GT', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

export function AdminProcessDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(() => adminReviewService.getProcess(eventId).then(setProcess).catch((requestError) => setError(requestError.response?.data?.error?.message || 'No se pudo cargar el proceso.')).finally(() => setLoading(false)), [eventId]);
  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    setPublishing(true); setError('');
    try { setProcess(await adminReviewService.publishEvaluations(eventId)); setShowConfirm(false); }
    catch (requestError) { setError(requestError.response?.data?.error?.message || 'No se pudieron publicar las evaluaciones.'); setShowConfirm(false); }
    finally { setPublishing(false); }
  };

  const ready = process && process.summary.totalParticipants > 0 && process.summary.responsesReceived === process.summary.totalParticipants && process.summary.reviewed === process.summary.totalParticipants;
  return <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
    <AdminSidebar activeSection='processes' onSelect={(section) => navigate(section === 'processes' ? '/admin-dashboard?section=processes' : '/admin-dashboard')} />
    <main className='min-w-0 flex-1 p-5 sm:p-8'><div className='mx-auto max-w-6xl'>
      <button type='button' onClick={() => navigate('/admin-dashboard?section=processes')} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver a procesos</button>
      {loading ? <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando proceso...</div> : error && !process ? <p className='mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</p> : process && <>
        <header className='mt-5 border-b border-[#DCE3EA] pb-6'>
          <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-start'><div><div className='flex flex-wrap items-center gap-3'><h1 className='font-display text-2xl font-bold text-[#101828]'>{process.name}</h1><span className='rounded-full bg-[#E8F8F5] px-3 py-1 text-xs font-semibold text-[#087D79]'>{STATUS_LABELS[process.status]}</span></div><p className='mt-2 text-sm text-[#475569]'>{process.company} · {process.position || 'Puesto sin especificar'}</p><p className='mt-2 text-xs text-[#7C8AA0]'>Inicio: {formatDate(process.availableFrom)} · Fin: {formatDate(process.endDate)}</p></div>
            {process.status !== 'PUBLISHED' && <button type='button' disabled={!ready} onClick={() => setShowConfirm(true)} className='rounded-xl bg-[#0AADA8] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#B8C5CF]'>Publicar evaluaciones</button>}
          </div>
          {process.status === 'PUBLISHED' ? <p className='mt-4 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-3 text-sm text-[#087D79]'>Perfiles publicados el {formatDate(process.evaluationsPublishedAt, true)}.</p> : !ready && <p className='mt-4 text-sm text-[#7C8AA0]'>Debes recibir y revisar a todos los participantes antes de publicar.</p>}
        </header>
        {error && <p className='mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700'>{error}</p>}
        <section className='mt-6 grid gap-4 sm:grid-cols-4'>{[['Participantes', process.summary.totalParticipants], ['Respuestas recibidas', process.summary.responsesReceived], ['Pendientes de revisión', process.summary.pendingReview], ['Revisados', process.summary.reviewed]].map(([label, value]) => <div key={label} className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm'><p className='text-xs text-[#64748B]'>{label}</p><p className='mt-2 text-2xl font-bold text-[#10233A]'>{value}</p></div>)}</section>
        <section className='mt-6 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'><div className='border-b border-[#E8EDF2] px-5 py-5'><h2 className='font-display font-bold text-[#101828]'>Participantes anónimos</h2><p className='mt-1 text-xs text-[#64748B]'>La identidad real no está disponible en esta vista administrativa.</p></div><div className='overflow-x-auto'><table className='w-full min-w-[680px] text-left'><thead className='bg-[#FAFBFC] text-[11px] uppercase tracking-wide text-[#718096]'><tr><th className='px-5 py-3'>Participante</th><th className='px-5 py-3'>Fecha de envío</th><th className='px-5 py-3'>Estado</th><th className='px-5 py-3 text-right'>Acción</th></tr></thead><tbody className='divide-y divide-[#E8EDF2]'>{process.participants.map((participant) => <tr key={participant.anonymousId}><td className='px-5 py-4 font-semibold text-[#10233A]'>{participant.anonymousId}</td><td className='px-5 py-4 text-sm text-[#56677B]'>{formatDate(participant.submittedAt, true)}</td><td className='px-5 py-4'><span className='rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-medium text-[#475569]'>{PARTICIPANT_LABELS[participant.status]}</span></td><td className='px-5 py-4 text-right'>{participant.status === 'NO_RESPONSE' ? <span className='text-xs text-[#A0AEC0]'>—</span> : <button type='button' onClick={() => navigate(`/admin/processes/${eventId}/participants/${participant.anonymousId}`)} className='rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] hover:border-[#0AADA8] hover:text-[#087D79]'>{participant.status === 'REVIEWED' ? 'Ver' : 'Revisar'}</button>}</td></tr>)}</tbody></table></div></section>
      </>}
    </div></main>
    {showConfirm && <div className='fixed inset-0 z-50 flex items-center justify-center bg-[#091426]/55 p-5' role='dialog' aria-modal='true' aria-labelledby='publish-title'><div className='w-full max-w-md rounded-2xl bg-white p-6 shadow-xl'><h2 id='publish-title' className='font-display text-xl font-bold text-[#10233A]'>Publicar evaluaciones</h2><p className='mt-3 text-sm leading-6 text-[#56677B]'>Al publicar las evaluaciones, la empresa podrá visualizar los perfiles de los candidatos de este proceso.</p><div className='mt-6 flex justify-end gap-3'><button type='button' onClick={() => setShowConfirm(false)} className='rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569]'>Cancelar</button><button type='button' onClick={publish} disabled={publishing} className='rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60'>{publishing ? 'Publicando...' : 'Publicar evaluaciones'}</button></div></div></div>}
  </div>;
}
