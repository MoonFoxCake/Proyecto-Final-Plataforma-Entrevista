import { useAuth } from '../hooks/useAuth.js';
import { can } from '../utils/adminPermissions.js';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../components/admin/AdminSidebar.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

function formatDate(value) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const MODULE_B_STATUS = { INVITATION_SENT: 'Invitación enviada · sin respuesta', CITED: 'Citado (presencial) · sin respuesta', COMPLETED: 'Respondido', WITHDRAWN: 'Retirado de la fase' };

/** Third stage: the story and the candidate's answer to each skill's question. */
function ModuleCAnswers({ moduleC }) {
  if (!moduleC) return null;
  const answered = moduleC.status === 'COMPLETED' && moduleC.answers.length > 0;
  return <section className='rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
    <div className='border-b border-[#E8EDF2] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'><h2 className='font-display text-lg font-bold text-[#10233A]'>Módulo C · {moduleC.microcaseName}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${answered ? 'bg-[#E8F8F5] text-[#087D79]' : 'bg-[#EEF6FF] text-[#315B88]'}`}>{MODULE_B_STATUS[moduleC.status] || 'Pendiente'}</span></div>
      <p className='mt-1 text-sm text-[#64748B]'>{answered ? `Respuestas registradas · enviadas el ${formatDate(moduleC.submittedAt)}` : `Enviado el ${formatDate(moduleC.invitedAt)}`}</p>
    </div>
    {answered && <div className='divide-y divide-[#E8EDF2]'>{moduleC.answers.map((answer) => <article key={answer.questionId} className='p-5'><div className='flex items-center justify-between gap-3'><span className='text-xs font-bold uppercase tracking-wide text-[#0A8F8A]'>Pregunta {String(answer.number).padStart(2, '0')}</span><span className='rounded bg-[#EEF6FF] px-2 py-1 text-[11px] font-semibold text-[#315B88]'>{answer.skill}</span></div><p className='mt-3 text-sm leading-6 text-[#10233A]'>“{answer.question}”</p><div className='mt-4 rounded-xl bg-[#F6F9FC] p-4'><p className='text-[11px] uppercase tracking-wide text-[#7C8AA0]'>Respuesta del candidato</p><p className={`mt-1 text-sm ${answer.label ? 'font-semibold text-[#334E68]' : 'italic text-[#94A3B8]'}`}>{answer.label ? `${answer.value} / 5 · ${answer.label}` : 'Sin respuesta: el tiempo se agotó.'}</p></div></article>)}</div>}
  </section>;
}

function ModuleBAnswer({ answer }) {
  const timedOutTag = answer.timedOut && <span className='rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700'>Enviada al agotarse el tiempo</span>;
  // Multiple choice: the four options offered, with the one the candidate marked.
  if (answer.options?.length) {
    return <article className='p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'><span className='text-xs font-bold uppercase tracking-wide text-[#0A8F8A]'>Pregunta {String(answer.number).padStart(2, '0')}</span>{timedOutTag}</div>
      <p className='mt-3 text-sm leading-6 text-[#10233A]'>“{answer.question}”</p>
      <ul className='mt-4 grid gap-2' aria-label='Opciones de respuesta'>{answer.options.map((option) => {
        const chosen = option === answer.label;
        return <li key={option} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${chosen ? 'border-[#18A9A4] bg-[#F0FBFA] font-semibold text-[#10233A]' : 'border-[#E8EDF2] text-[#56677B]'}`}><span aria-hidden='true' className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-sm font-bold ${chosen ? 'border-[#18A9A4] bg-[#18A9A4] text-white' : 'border-[#CBD5E1] text-transparent'}`}>✕</span><span>{option}{chosen && <span className='sr-only'> (respuesta del candidato)</span>}</span></li>;
      })}</ul>
      {!answer.label && <p className='mt-3 text-sm italic text-[#94A3B8]'>Sin respuesta: el tiempo se agotó.</p>}
    </article>;
  }
  return <article className='p-5'><span className='text-xs font-bold uppercase tracking-wide text-[#0A8F8A]'>Pregunta {String(answer.number).padStart(2, '0')}</span><p className='mt-3 text-sm leading-6 text-[#10233A]'>“{answer.question}”</p><div className='mt-4 rounded-xl bg-[#F6F9FC] p-4'><div className='flex flex-wrap items-center justify-between gap-2'><p className='text-[11px] uppercase tracking-wide text-[#7C8AA0]'>Respuesta del candidato</p>{timedOutTag}</div><p className={`mt-1 whitespace-pre-line text-sm leading-6 ${answer.label || answer.text ? 'text-[#334E68]' : 'italic text-[#94A3B8]'}`}>{answer.label ? `${answer.value} / 5 · ${answer.label}` : answer.text || 'Sin respuesta: el tiempo se agotó.'}</p></div></article>;
}

/**
 * Second stage: the candidate's written answers to the macrocase questions,
 * grouped by section when the macrocase has more than one.
 */
function ModuleBAnswers({ moduleB }) {
  if (!moduleB) return null;
  const answered = moduleB.status === 'COMPLETED' && moduleB.answers.length > 0;
  const sections = moduleB.sections?.length ? moduleB.sections : [{ sectionId: 'section-1', number: 1, title: '', answers: moduleB.answers }];
  const grouped = sections.length > 1 || Boolean(sections[0]?.title);
  return <section className='rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
    <div className='border-b border-[#E8EDF2] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'><h2 className='font-display text-lg font-bold text-[#10233A]'>Módulo B · {moduleB.macrocaseName}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${answered ? 'bg-[#E8F8F5] text-[#087D79]' : 'bg-[#EEF6FF] text-[#315B88]'}`}>{MODULE_B_STATUS[moduleB.status] || moduleB.status}</span></div>
      <p className='mt-1 text-sm text-[#64748B]'>{answered ? `Respuestas registradas · enviadas el ${formatDate(moduleB.submittedAt)}` : `Enviado el ${formatDate(moduleB.invitedAt)}`}</p>
    </div>
    {answered && sections.map((section) => <div key={section.sectionId} className='border-b border-[#E8EDF2] last:border-b-0'>
      {grouped && <h3 className='bg-[#F8FAFC] px-5 py-3 text-sm font-semibold text-[#334E68]'>Sección {section.number}{section.title ? ` · ${section.title}` : ''}</h3>}
      <div className='divide-y divide-[#E8EDF2]'>{section.answers.map((answer) => <ModuleBAnswer key={answer.questionId} answer={answer} />)}</div>
    </div>)}
  </section>;
}

export function AdminParticipantReviewPage() {
  const { profile } = useAuth();
  const canReview = can(profile, 'results.deliver');
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
    <AdminSidebar activeSection='results' onSelect={(section) => navigate(`/admin-dashboard?section=${encodeURIComponent(section)}`)} />
    <main className='min-w-0 flex-1 p-5 sm:p-8'><div className='mx-auto max-w-6xl'>
      <button type='button' onClick={() => navigate(`/admin/processes/${eventId}`)} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver al proceso</button>
      {loading ? <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando respuestas...</div> : error && !participant ? <p className='mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</p> : participant && <ReviewContent canReview={canReview} participant={participant} observations={observations} setObservations={setObservations} dimensions={dimensions} dimension={dimension} setDimension={setDimension} answers={answers} error={error} success={success} saving={saving} save={save} />}
    </div></main>
  </div>;
}

function ReviewContent({ canReview, participant, observations, setObservations, dimensions, dimension, setDimension, answers, error, success, saving, save }) {
  return <>
    <header className='mt-5 border-b border-[#DCE3EA] pb-6'>
      <div className='flex flex-wrap items-center gap-3'><h1 className='font-display text-2xl font-bold text-[#101828]'>Participante {participant.anonymousId}</h1><span className={`rounded-full px-3 py-1 text-xs font-semibold ${participant.status === 'REVIEWED' ? 'bg-[#E8F8F5] text-[#087D79]' : 'bg-[#FFF7E8] text-[#9A651E]'}`}>{participant.status === 'REVIEWED' ? 'Revisado' : 'Pendiente de revisión'}</span></div>
      <p className='mt-2 text-sm text-[#475569]'>Módulo {participant.module} · Cuestionario Likert{participant.moduleB ? ' · Módulo B · Macrocaso' : ''}{participant.moduleC ? ' · Módulo C · Microcaso' : ''}</p><p className='mt-1 text-xs text-[#7C8AA0]'>Enviado el {formatDate(participant.submittedAt)}</p>
    </header>
    <div className='mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]'>
      <div className='space-y-6'><section className='rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        <div className='border-b border-[#E8EDF2] p-5'><h2 className='font-display text-lg font-bold text-[#10233A]'>Respuestas individuales</h2><p className='mt-1 text-sm text-[#64748B]'>Revisa cada respuesta del instrumento; no se calcula una nota.</p><div className='mt-4 flex flex-wrap gap-2'>{dimensions.map((item) => <button key={item} type='button' onClick={() => setDimension(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${dimension === item ? 'bg-[#0AADA8] text-white' : 'bg-[#F1F5F9] text-[#475569]'}`}>{item}</button>)}</div></div>
        <div className='divide-y divide-[#E8EDF2]'>{answers.map((answer) => <article key={answer.questionId} className='p-5'><div className='flex items-center justify-between gap-3'><span className='text-xs font-bold uppercase tracking-wide text-[#0A8F8A]'>Pregunta {String(answer.number).padStart(2, '0')}</span><span className='rounded bg-[#EEF6FF] px-2 py-1 text-[11px] font-semibold text-[#315B88]'>{answer.dimension}</span></div><p className='mt-3 text-sm leading-6 text-[#10233A]'>“{answer.text}”</p><div className='mt-4 rounded-xl bg-[#F6F9FC] p-4'><p className='text-[11px] uppercase tracking-wide text-[#7C8AA0]'>Respuesta seleccionada</p><p className='mt-1 text-sm font-semibold text-[#334E68]'>{answer.label}</p></div></article>)}</div>
      </section><ModuleBAnswers moduleB={participant.moduleB} /><ModuleCAnswers moduleC={participant.moduleC} /></div>
      <div className='space-y-6'><section className='rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm'><label htmlFor='observations' className='font-display text-lg font-bold text-[#10233A]'>Observaciones del administrador</label><textarea disabled={!canReview} id='observations' value={observations} onChange={(event) => setObservations(event.target.value)} maxLength='2000' rows='7' className='mt-4 w-full resize-y rounded-xl border border-[#D9E2EA] p-3 text-sm text-[#10233A] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20' placeholder='Registra observaciones de la revisión, sin asignar una nota.' />{error && <p className='mt-3 text-sm text-red-700'>{error}</p>}{success && <p className='mt-3 text-sm text-[#087D79]'>{success}</p>}<div className='mt-5 grid gap-3'><button type='button' onClick={() => save(false)} disabled={saving || !canReview} className='rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569] disabled:opacity-60'>Guardar observaciones</button><button type='button' onClick={() => save(true)} disabled={saving || !canReview || participant.status === 'REVIEWED'} className='rounded-xl bg-[#0AADA8] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#B8C5CF]'>{participant.status === 'REVIEWED' ? 'Revisión completada' : saving ? 'Guardando...' : 'Marcar como revisado'}</button></div></section></div>
    </div>
  </>;
}
