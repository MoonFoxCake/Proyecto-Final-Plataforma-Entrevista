import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CompanyPlanView } from '../components/company/CompanyPlanView.jsx';
import { CompanyResultsView } from '../components/company/CompanyResultsView.jsx';
import { CompanyCandidatesView } from './CompanyCandidatesView.jsx';
import { CompanyEventsView } from './CompanyEventsView.jsx';
import {
  CompanySidebar,
  COMPANY_SECTIONS,
  CompanyPlaceholderView,
} from '../components/company/CompanySidebar.jsx';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import { BarChart, ChartCard } from '../components/ui/Charts.jsx';
import * as eventService from '../services/eventService.js';
import { formatSession, isOnsite } from '../utils/eventModality.js';
import { hasCompleted } from '../utils/phases.js';
import {
  PHASE_NAMES, eventName, isActiveEvent, nextStep, overviewFigures, pendingTasks, phaseFunnel, recentResults, upcomingDates,
} from './companyOverview.js';

const DATE_TIME = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium' });
const STEP_TONES = {
  action: 'bg-amber-50 text-amber-800',
  waiting: 'bg-[#EEF6FF] text-[#315B88]',
  progress: 'bg-[#E8F8F5] text-[#087D79]',
  done: 'bg-emerald-50 text-emerald-800',
};

function StatCard({ label, value, helper, icon }) {
  return (
    <article className='rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-sm font-medium text-[#64748B]'>{label}</p>
          <p className='mt-3 font-display text-3xl font-bold tabular-nums text-[#101828]'>{value}</p>
        </div>
        <span aria-hidden='true' className='flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F7F6] text-lg text-[#087D79]'>{icon}</span>
      </div>
      <p className='mt-3 text-xs text-[#94A3B8]'>{helper}</p>
    </article>
  );
}

function SectionTitle({ id, title, description }) {
  return (
    <div>
      <h2 id={id} className='font-display text-lg font-bold text-[#101828]'>{title}</h2>
      {description && <p className='mt-1 text-sm text-[#64748B]'>{description}</p>}
    </div>
  );
}

/** What needs the company now, each with a button to where it is done. */
function PendingTasks({ tasks }) {
  return (
    <section aria-labelledby='pending-title' className='rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm sm:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <SectionTitle id='pending-title' title='Pendientes' description='Lo que tus procesos necesitan de ti.' />
        {tasks.length > 0 && <span className='rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800'>{tasks.length} {tasks.length === 1 ? 'pendiente' : 'pendientes'}</span>}
      </div>
      {tasks.length === 0 ? (
        <p className='mt-4 rounded-xl bg-[#F6FAFC] p-4 text-sm text-[#64748B]'>Todo al día. No hay acciones pendientes en tus procesos.</p>
      ) : (
        <ul className='mt-4 divide-y divide-[#EEF2F6]'>
          {tasks.slice(0, 6).map((task) => (
            <li key={task.key} className='flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0'>
                <p className='break-words text-sm font-semibold text-[#10233A]'>{task.title}</p>
                <p className='mt-0.5 text-xs text-[#64748B]'>{task.detail}{task.at ? ` Cierra el ${DATE_TIME.format(task.at)}.` : ''}</p>
              </div>
              <Link to={task.to} className='inline-flex shrink-0 items-center justify-center rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#087D79] hover:border-[#0AADA8]'>{task.action} →</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The latest reports received, ready to download. */
function RecentResults({ results }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const download = async (item) => {
    setBusy(item.key);
    setError('');
    try {
      const { url } = await eventService.getResultDownloadUrl(item.eventId, item.module);
      window.location.assign(url);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo descargar el resultado.');
    } finally {
      setBusy('');
    }
  };
  return (
    <section aria-labelledby='recent-results-title' className='rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm sm:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <SectionTitle id='recent-results-title' title='Resultados recientes' description='Últimos informes PDF que recibiste.' />
        <Link to='/company-dashboard?section=reports' className='text-xs font-semibold text-[#087D79] hover:underline'>Ver todos</Link>
      </div>
      {results.length === 0 ? (
        <p className='mt-4 rounded-xl bg-[#F6FAFC] p-4 text-sm text-[#64748B]'>Aún no has recibido informes. Aparecerán aquí cuando NexoPerfil entregue el resultado de una fase.</p>
      ) : (
        <ul className='mt-4 divide-y divide-[#EEF2F6]'>
          {results.map((item) => (
            <li key={item.key} className='flex flex-wrap items-center justify-between gap-3 py-3'>
              <div className='min-w-0'>
                <p className='break-words text-sm font-semibold text-[#10233A]'>{item.name}</p>
                <p className='mt-0.5 text-xs text-[#64748B]'>{PHASE_NAMES[item.module]}{item.deliveredAt ? ` · recibido el ${DATE.format(item.deliveredAt)}` : ''}</p>
              </div>
              <button type='button' onClick={() => download(item)} disabled={Boolean(busy)} className='shrink-0 rounded-lg bg-[#0AADA8] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#089490] disabled:opacity-50'>{busy === item.key ? 'Preparando…' : 'Descargar PDF'}</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role='alert' className='mt-3 text-sm text-red-700'>{error}</p>}
    </section>
  );
}

/** Onsite sessions and closings of virtual links still to come. */
function UpcomingDates({ dates }) {
  if (!dates.length) return null;
  return (
    <section aria-labelledby='upcoming-title' className='rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm sm:p-6'>
      <SectionTitle id='upcoming-title' title='Próximas fechas' description='Sesiones presenciales y cierres de enlaces virtuales.' />
      <ul className='mt-4 divide-y divide-[#EEF2F6]'>
        {dates.map((item) => (
          <li key={item.key} className='flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm'>
            <span className='min-w-0 break-words font-medium text-[#10233A]'>{item.name} · Fase {item.module}</span>
            <span className='text-xs text-[#64748B]'>
              {item.kind === 'session'
                ? `Sesión presencial · ${formatSession(item.appointment)}`
                : `Cierra el enlace · ${DATE_TIME.format(item.at)} · ${item.pending} sin responder`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompanyOverview() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      try {
        const loadedEvents = await eventService.getEvents();
        const loaded = await Promise.all(loadedEvents.map(async (event) => ({
          event,
          candidates: await eventService.getEventCandidates(event.id),
        })));
        if (!cancelled) setGroups(loaded);
      } catch (requestError) {
        if (!cancelled) setError(requestError.response?.data?.error?.message || 'No se pudieron cargar las estadísticas de los procesos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadOverview();
    return () => { cancelled = true; };
  }, []);

  const figures = overviewFigures(groups);
  const tasks = pendingTasks(groups);
  const funnel = phaseFunnel(groups);
  const onsiteCandidates = groups.filter(({ event }) => isOnsite(event)).flatMap((group) => group.candidates);
  const attendance = [
    { label: 'Convocados', value: onsiteCandidates.filter((candidate) => candidate.status !== 'INVITED_PENDING').length },
    { label: 'Presentes', value: onsiteCandidates.filter((candidate) => candidate.attendance?.A?.status === 'PRESENT').length },
    { label: 'Completaron', value: onsiteCandidates.filter((candidate) => hasCompleted(candidate, 'A')).length },
  ];
  const active = groups.filter(({ event }) => isActiveEvent(event));

  return (
    <div className='p-5 sm:p-8'>
      <div className='mx-auto max-w-6xl'>
        <p className='text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]'>Resumen de actividad</p>
        <div className='mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-end'>
          <div>
            <h1 className='font-display text-2xl font-bold text-[#101828]'>Dashboard</h1>
            <p className='mt-1 text-sm text-[#64748B]'>Seguimiento de tus procesos de reclutamiento universitario.</p>
          </div>
          <span className='text-xs text-[#94A3B8]'>Datos actualizados al cargar el panel</span>
        </div>

        {error && <p className='mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}
        {loading ? (
          <div role='status' className='mt-8 flex min-h-40 items-center justify-center text-sm text-[#64748B]'><SpinnerIcon className='mr-2 h-5 w-5 animate-spin text-[#0AADA8]' />Cargando estadísticas...</div>
        ) : !error && (
          <>
            <section aria-label='Indicadores' className='mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard label='Procesos activos' value={figures.activeProcesses} helper={`${figures.totalProcesses} procesos registrados en total`} icon='▦' />
              <StatCard label='Candidatos evaluados' value={figures.evaluated} helper={`De ${figures.totalCandidates} candidatos registrados`} icon='♙' />
              <StatCard label='Informes recibidos' value={figures.reports} helper='PDF de resultados entregados por fase' icon='▤' />
              <StatCard label='Enlaces abiertos ahora' value={figures.openLinks} helper='Evaluaciones virtuales disponibles sin responder' icon='◷' />
            </section>

            <div className='mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
              <PendingTasks tasks={tasks} />
              <RecentResults results={recentResults(groups)} />
            </div>

            <div className={`mt-8 grid gap-4 ${onsiteCandidates.length ? 'lg:grid-cols-2' : ''}`}>
              <ChartCard title='Avance entre fases' description='Candidatos que completaron cada fase y qué porcentaje de la fase anterior continuó.'>
                <BarChart caption='Candidatos que completaron cada fase' items={funnel.map((phase) => ({ label: PHASE_NAMES[phase.module], value: phase.completed, hint: phase.passRate === null ? `${phase.invited} convocados` : `${phase.passRate} % de la fase anterior continuó` }))} />
                <ul className='mt-4 grid gap-2 sm:grid-cols-3'>
                  {funnel.map((phase) => (
                    <li key={phase.module} className='rounded-xl bg-[#F7F9FC] p-3'>
                      <p className='text-xs text-[#64748B]'>Fase {phase.module}</p>
                      <p className='mt-1 text-sm font-semibold text-[#101828]'>{phase.completed} de {phase.invited} completaron</p>
                      {phase.passRate !== null && <p className='mt-0.5 text-xs text-[#087D79]'>{phase.passRate} % pasó desde la Fase {phase.module === 'B' ? 'A' : 'B'}</p>}
                    </li>
                  ))}
                </ul>
              </ChartCard>
              {onsiteCandidates.length > 0 && (
                <ChartCard title='Asistencia presencial' description='Fase A de tus procesos presenciales.'><BarChart caption='Asistencia presencial' items={attendance} /></ChartCard>
              )}
            </div>

            <div className='mt-8'><UpcomingDates dates={upcomingDates(groups)} /></div>

            <section aria-labelledby='active-title' className='mt-8'>
              <SectionTitle id='active-title' title='Procesos activos' description='En qué paso está cada proceso.' />
              {active.length === 0 ? (
                <div className='mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center'><p className='font-semibold text-[#334155]'>Todavía no hay procesos activos</p><p className='mt-1 text-sm text-[#94A3B8]'>Cuando crees un proceso, su avance aparecerá aquí.</p></div>
              ) : (
                <ul className='mt-4 space-y-3'>
                  {active.map(({ event, candidates }) => {
                    const step = nextStep(event, candidates);
                    return (
                      <li key={event.id} className='rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm'>
                        <div className='flex flex-col justify-between gap-3 sm:flex-row sm:items-center'>
                          <div className='min-w-0'>
                            <h3 className='break-words font-semibold text-[#101828]'>{eventName(event)}</h3>
                            <p className='mt-1 text-xs text-[#64748B]'>{event.position || event.positionName || 'Proceso de evaluación'} · {candidates.length} candidatos · {isOnsite(event) ? 'Presencial' : 'Virtual'}</p>
                          </div>
                          <Link to={`/company/events/${event.id}/${step.tab}`} className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold hover:underline ${STEP_TONES[step.tone]}`}>{step.label}</Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export function CompanyDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') || 'dashboard';
  const activeSection = COMPANY_SECTIONS.some((item) => item.id === requestedSection) ? requestedSection : 'dashboard';
  const setActiveSection = (id) => setSearchParams({ section: id });

  const section = COMPANY_SECTIONS.find((item) => item.id === activeSection);

  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
      />

      <main className='min-w-0 flex-1'>
        {activeSection === 'dashboard' ? (
          <CompanyOverview />
        ) : activeSection === 'events' ? (
          <CompanyEventsView />
        ) : activeSection === 'candidates' ? (
          <CompanyCandidatesView />
        ) : activeSection === 'subscription' ? (
          <CompanyPlanView />
        ) : activeSection === 'reports' ? (
          <CompanyResultsView />
        ) : (
          <CompanyPlaceholderView section={section} />
        )}
      </main>
    </div>
  );
}
