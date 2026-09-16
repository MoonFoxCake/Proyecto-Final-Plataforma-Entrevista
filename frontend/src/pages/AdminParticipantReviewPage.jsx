import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../components/admin/AdminSidebar.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

const DEMO_DIMENSIONS = [
  { code: 'HBE', name: 'Habilidades blandas éticas', ideal: 4.0, candidate: 4.3 },
  { code: 'VPE', name: 'Valores profesionales éticos', ideal: 5.0, candidate: 3.3 },
  { code: 'IM', name: 'Identidad moral', ideal: 4.0, candidate: 4.3 },
  { code: 'InM', name: 'Intensidad moral', ideal: 3.0, candidate: 3.6 },
];

function formatDate(value) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ProvisionalProfile() {
  return <section className='rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm'>
    <div className='flex flex-wrap items-start justify-between gap-3'><div><h2 className='font-display text-lg font-bold text-[#10233A]'>Vista provisional del perfil</h2><p className='mt-1 text-sm text-[#64748B]'>Comparación multidimensional demostrativa.</p></div><span className='rounded-full bg-[#FFF7E8] px-3 py-1 text-xs font-semibold text-[#9A651E]'>DEMO</span></div>
    <div className='mt-6 space-y-5'>{DEMO_DIMENSIONS.map((item) => <article key={item.code}><div className='mb-2 flex flex-wrap justify-between gap-2 text-xs'><span className='font-semibold text-[#10233A]'>{item.code} · {item.name}</span><span className='text-[#64748B]'>Ideal {item.ideal.toFixed(1)} · Candidato {item.candidate.toFixed(1)}</span></div><div className='relative h-2.5 rounded-full bg-[#E5E9EE]'><div className='h-full rounded-full bg-[#102033]' style={{ width: `${item.candidate * 20}%` }} /><span className='absolute top-[-4px] h-[18px] w-1 -translate-x-1/2 rounded bg-[#2477E8]' style={{ left: `${item.ideal * 20}%` }} /></div></article>)}</div>
    <p className='mt-6 rounded-xl border border-[#D6E6F7] bg-[#F6FAFF] p-4 text-sm leading-6 text-[#315B88]'><strong>No es una nota.</strong> Esta visualización representa la forma del perfil y permite observar similitudes o diferencias frente al perfil ideal. No determina aprobación ni rechazo.</p>
    <p className='mt-3 text-xs leading-5 text-[#7C8AA0]'>Representación demostrativa del prototipo. La lógica definitiva del perfil será definida con el instrumento validado por la cliente.</p>
  </section>;
}

export function AdminParticipantReviewPage() {
  const { eventId, anonymousId } = useParams();
  const navigate = useNavigate();
  const [participant, setParticipant] = useState(null);
  const [observations, setObservations] = useState('');
  const [dimension, setDimension] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminReviewService.getParticipant(eventId, anonymousId)
      .then((data) => { setParticipant(data); setObservations(data.observations || ''); })
      .catch((requestError) => setError(requestError.response?.data?.error?.message || 'No se pudo cargar la revisión.'))
      .finally(() => setLoading(false));
  }, [anonymousId, eventId]);

  const dimensions = useMemo(() => ['Todas', ...new Set(participant?.answers.map((answer) => answer.dimension) || [])], [participant]);
  const answers = participant?.answers.filter((answer) => dimension === 'Todas' || answer.dimension === dimension) || [];

  const save = async (reviewed) => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const updated = await adminReviewService.saveReview(eventId, anonymousId, { observations, reviewed });
      setParticipant(updated);
      setObservations(updated.observations || '');
      setSuccess(reviewed ? 'Participante marcado como revisado.' : 'Observaciones guardadas.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo guardar la revisión.');
    } finally { setSaving(false); }
  };

  return <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
    <AdminSidebar activeSection='processes' onSelect={() => navigate('/admin-dashboard?section=processes')} />
    <main className='min-w-0 flex-1 p-5 sm:p-8'><div className='mx-auto max-w-6xl'>
      <button type='button' onClick={() => navigate(`/admin/processes/${eventId}`)} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver al proceso</button>
      {loading ? <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando respuestas...</div> : error && !participant ? <p className='mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</p> : participant && <ReviewContent participant={participant} observations={observations} setObservations={setObservations} dimensions={dimensions} dimension={dimension} setDimension={setDimension} answers={answers} error={error} success={success} saving={saving} save={save} />}
    </div></main>
  </div>;
}

function ReviewContent({ participant, observations, setObservations, dimensions, dimension, setDimension, answers, error, success, saving, save }) {
  return <>
    <header className='mt-5 border-b border-[#DCE3EA] pb-6'>
      <div className='flex flex-wrap items-center gap-3'><h1 className='font-display text-2xl font-bold text-[#101828]'>Participante {participant.anonymousId}</h1><span className={`rounded-full px-3 py-1 text-xs font-semibold ${participant.status === 'REVIEWED' ? 'bg-[#E8F8F5] text-[#087D79]' : 'bg-[#FFF7E8] text-[#9A651E]'}`}>{participant.status === 'REVIEWED' ? 'Revisado' : 'Pendiente de revisión'}</span></div>
      <p className='mt-2 text-sm text-[#475569]'>Módulo {participant.module} · Cuestionario Likert</p><p className='mt-1 text-xs text-[#7C8AA0]'>Enviado el {formatDate(participant.submittedAt)}</p>
    </header>
    <div className='mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]'>
      <section className='rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        <div className='border-b border-[#E8EDF2] p-5'><h2 className='font-display text-lg font-bold text-[#10233A]'>Respuestas individuales</h2><p className='mt-1 text-sm text-[#64748B]'>Revisa cada respuesta del instrumento; no se calcula una nota.</p><div className='mt-4 flex flex-wrap gap-2'>{dimensions.map((item) => <button key={item} type='button' onClick={() => setDimension(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${dimension === item ? 'bg-[#0AADA8] text-white' : 'bg-[#F1F5F9] text-[#475569]'}`}>{item}</button>)}</div></div>
        <div className='divide-y divide-[#E8EDF2]'>{answers.map((answer) => <article key={answer.questionId} className='p-5'><div className='flex items-center justify-between gap-3'><span className='text-xs font-bold uppercase tracking-wide text-[#0A8F8A]'>Pregunta {String(answer.number).padStart(2, '0')}</span><span className='rounded bg-[#EEF6FF] px-2 py-1 text-[11px] font-semibold text-[#315B88]'>{answer.dimension}</span></div><p className='mt-3 text-sm leading-6 text-[#10233A]'>“{answer.text}”</p><div className='mt-4 rounded-xl bg-[#F6F9FC] p-4'><p className='text-[11px] uppercase tracking-wide text-[#7C8AA0]'>Respuesta seleccionada</p><p className='mt-1 text-sm font-semibold text-[#334E68]'>{answer.label}</p></div></article>)}</div>
      </section>
      <div className='space-y-6'><ProvisionalProfile /><section className='rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm'><label htmlFor='observations' className='font-display text-lg font-bold text-[#10233A]'>Observaciones del administrador</label><textarea id='observations' value={observations} onChange={(event) => setObservations(event.target.value)} maxLength='2000' rows='7' className='mt-4 w-full resize-y rounded-xl border border-[#D9E2EA] p-3 text-sm text-[#10233A] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20' placeholder='Registra observaciones de la revisión, sin asignar una nota.' />{error && <p className='mt-3 text-sm text-red-700'>{error}</p>}{success && <p className='mt-3 text-sm text-[#087D79]'>{success}</p>}<div className='mt-5 grid gap-3'><button type='button' onClick={() => save(false)} disabled={saving} className='rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569] disabled:opacity-60'>Guardar observaciones</button><button type='button' onClick={() => save(true)} disabled={saving || participant.status === 'REVIEWED'} className='rounded-xl bg-[#0AADA8] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#B8C5CF]'>{participant.status === 'REVIEWED' ? 'Revisión completada' : saving ? 'Guardando...' : 'Marcar como revisado'}</button></div></section></div>
    </div>
  </>;
}
