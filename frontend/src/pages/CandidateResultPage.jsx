import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CompanySidebar } from '../components/company/CompanySidebar.jsx';
import * as eventService from '../services/eventService.js';

function formatSubmission(value) {
  if (!value) return 'Fecha no disponible';
  const raw = value._seconds ? value._seconds * 1000 : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

const DEMO_DIMENSIONS = [
  { abbreviation: 'HBE', name: 'Habilidades blandas éticas', ideal: 4.0, candidate: 4.3 },
  { abbreviation: 'VPE', name: 'Valores profesionales éticos', ideal: 5.0, candidate: 3.3 },
  { abbreviation: 'IM', name: 'Identidad moral', ideal: 4.0, candidate: 4.3 },
  { abbreviation: 'InM', name: 'Intensidad moral', ideal: 3.0, candidate: 3.6 },
];

function ProfileComparison() {
  return (
    <div className='mt-7'>
      <div className='space-y-7'>
        {DEMO_DIMENSIONS.map((dimension) => (
          <article key={dimension.abbreviation}>
            <div className='mb-2 flex flex-col justify-between gap-1 sm:flex-row sm:items-center'>
              <div className='flex items-center gap-2'><span className='rounded bg-[#E8F7F6] px-2 py-1 text-[10px] font-bold text-[#087D79]'>{dimension.abbreviation}</span><h3 className='text-sm font-semibold text-[#10233A]'>{dimension.name}</h3></div>
              <div className='flex gap-4 text-xs'><span className='text-[#64748B]'>Ideal <strong className='text-[#315B88]'>{dimension.ideal.toFixed(1)}</strong></span><span className='text-[#64748B]'>Candidato <strong className='text-[#10233A]'>{dimension.candidate.toFixed(1)}</strong></span></div>
            </div>
            <div className='relative h-3 overflow-visible rounded-full bg-[#E5E9EE]' aria-label={`${dimension.name}: perfil ideal ${dimension.ideal.toFixed(1)}, perfil candidato ${dimension.candidate.toFixed(1)}`}>
              <div className='h-full rounded-full bg-[#102033]' style={{ width: `${(dimension.candidate / 5) * 100}%` }} />
              <span className='absolute top-[-4px] h-5 w-1 -translate-x-1/2 rounded-full bg-[#2477E8] shadow-[0_0_0_2px_white]' style={{ left: `${(dimension.ideal / 5) * 100}%` }} />
            </div>
          </article>
        ))}
      </div>
      <div className='mt-7 flex justify-between text-[11px] text-[#94A3B8]'>{[1, 2, 3, 4, 5].map((value) => <span key={value}>{value.toFixed(1)}</span>)}</div>
      <div className='mt-5 flex flex-wrap gap-5 border-t border-[#E8EDF2] pt-4 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]'><span className='inline-flex items-center gap-2'><span className='h-2.5 w-4 bg-[#102033]' /> Perfil candidato</span><span className='inline-flex items-center gap-2'><span className='h-4 w-1 bg-[#2477E8]' /> Perfil ideal</span></div>
    </div>
  );
}

export function CandidateResultPage() {
  const { eventId, candidateId } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadCandidate() {
      try {
        const candidates = await eventService.getEventCandidates(eventId);
        if (!active) return;
        const match = candidates.find((item) => item.id === candidateId);
        if (!match) {
          setError('El candidato no existe o no pertenece a este evento.');
          return;
        }
        setCandidate(match);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.error?.message || 'No se pudo validar el acceso al resultado.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCandidate();
    return () => { active = false; };
  }, [candidateId, eventId]);

  const goBack = () => navigate(`/company/events/${eventId}`);

  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar activeSection='events' onSelect={() => navigate('/company-dashboard')} />
      <main className='min-w-0 flex-1 p-5 sm:p-8'>
        <div className='mx-auto max-w-6xl'>
          <button type='button' onClick={goBack} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver al evento</button>
          {loading ? (
            <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando resultado...</div>
          ) : error ? (
            <section className='mt-6 rounded-2xl border border-red-200 bg-white p-7 shadow-sm'>
              <h1 className='font-display text-xl font-bold text-[#10233A]'>Resultado no disponible</h1>
              <p className='mt-3 text-sm text-red-600'>{error}</p>
            </section>
          ) : candidate.status !== 'EVALUATION_COMPLETED' ? (
            <section className='mt-6 rounded-2xl border border-[#DDE5EC] bg-white p-7 shadow-sm'>
              <h1 className='font-display text-xl font-bold text-[#10233A]'>Resultado no disponible</h1>
              <p className='mt-3 text-sm text-[#64748B]'>La evaluación de este candidato aún no ha sido completada.</p>
            </section>
          ) : (
            <>
              <header className='mt-6 border-b border-[#DCE3EA] pb-6'>
                <div className='flex flex-col justify-between gap-5 sm:flex-row sm:items-end'>
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-[0.12em] text-[#0A8F8A]'>Perfil del candidato</p>
                    <h1 className='mt-2 font-display text-2xl font-bold text-[#101828]'>{candidate.nombreCompleto}</h1>
                    <p className='mt-2 text-sm text-[#64748B]'>{candidate.correo}</p>
                  </div>
                  <button type='button' disabled className='cursor-not-allowed rounded-xl border border-[#D9E2EA] bg-white px-4 py-2.5 text-sm font-semibold text-[#94A3B8]'>Descargar reporte · Demo</button>
                </div>
              </header>
              <section className='mt-6 rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm sm:p-7'>
                <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-center'>
                  <div><span className='inline-flex items-center gap-1.5 rounded-md bg-[#E8F8F5] px-2.5 py-1 text-xs font-medium text-[#087D79]'><span className='h-1.5 w-1.5 rounded-full bg-[#0AADA8]' /> Evaluación completada</span><p className='mt-3 text-sm text-[#56677B]'>Enviada el {formatSubmission(candidate.submittedAt)}</p></div>
                  <span className='w-fit rounded-full bg-[#FFF7E8] px-3 py-1.5 text-xs font-semibold text-[#9A651E]'>Mockup · Datos ilustrativos</span>
                </div>
              </section>

              <section className='mt-6 rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm sm:p-7'>
                <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-start'>
                  <div><h2 className='font-display text-lg font-bold text-[#10233A]'>Comparación con el perfil ideal</h2><p className='mt-2 max-w-3xl text-sm leading-6 text-[#64748B]'>Contrasta el perfil ilustrativo del candidato con el perfil ideal definido para esta demostración.</p></div>
                  <span className='w-fit shrink-0 rounded-lg bg-[#EEF6FF] px-3 py-2 text-xs font-semibold text-[#315B88]'>Escala descriptiva 1–5</span>
                </div>
                <ProfileComparison />
                <p className='mt-6 rounded-xl border border-[#D6E6F7] bg-[#F6FAFF] p-4 text-sm leading-6 text-[#315B88]'><strong>No es una nota.</strong> La visualización presenta la forma del perfil y permite observar cercanías o diferencias frente al perfil ideal; no establece aprobación ni rechazo.</p>
              </section>

              <section className='mt-6 rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm sm:p-7'>
                <h2 className='font-display text-lg font-bold text-[#10233A]'>Descripción general del perfil</h2>
                <p className='mt-3 text-sm leading-7 text-[#56677B]'>Este texto ejemplifica cómo podría presentarse una síntesis del perfil ético del candidato, integrando habilidades blandas éticas, valores profesionales, identidad moral e intensidad moral.</p>
                <div className='mt-5 rounded-xl border border-[#BFE5E2] bg-[#F0FFFE] p-4 text-sm leading-6 text-[#27625F]'><strong>Datos ilustrativos del prototipo.</strong> Este perfil no fue calculado a partir de las respuestas demo. El resultado definitivo dependerá del instrumento validado por los expertos.</div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
