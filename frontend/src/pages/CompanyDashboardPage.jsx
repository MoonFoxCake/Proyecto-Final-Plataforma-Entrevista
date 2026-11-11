import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { formatSession, isOnsite, modulesOf } from '../utils/eventModality.js';
import { hasCompleted, inPhase, isWithdrawn } from '../utils/phases.js';

const PHASES = [['A', 'Fase A · Cuestionario'], ['B', 'Fase B · Macrocaso'], ['C', 'Fase C · Microcaso']];

function eventName(event) {
  return event.name || event.title || event.eventName || event.positionName || 'Evento sin nombre';
}

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value._seconds != null ? value._seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Reached by the phase: invited or cited (Module A also counts whoever is registered but not contacted as not invited). */
function isInvited(candidate, module) {
  if (isWithdrawn(candidate, module)) return false;
  if (module === 'A') return candidate.status !== 'INVITED_PENDING';
  return inPhase(candidate, module);
}

const phaseCounts = (candidates, module) => ({
  invited: candidates.filter((candidate) => isInvited(candidate, module)).length,
  completed: candidates.filter((candidate) => hasCompleted(candidate, module)).length,
});

function StatCard({ label, value, helper, icon }) {
  return (
    <article className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#64748B]">{label}</p>
          <p className="mt-3 font-display text-3xl font-bold text-[#101828]">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F7F6] text-lg text-[#087D79]">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-[#94A3B8]">{helper}</p>
    </article>
  );
}

function PhaseProgress({ title, completed, invited }) {
  const percentage = invited > 0 ? Math.round((completed / invited) * 100) : 0;
  return (
    <article className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display font-bold text-[#101828]">{title}</h3>
        <span className="text-xs font-semibold text-[#334E68]">{percentage}%</span>
      </div>
      <div className="mt-5 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold text-[#101828]">{completed}</span>
        <span className="text-sm text-[#64748B]">de {invited} convocados completaron</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8EEF3]">
        <div className="h-full rounded-full bg-[#0A8F8A] transition-all" style={{ width: `${percentage}%` }} />
      </div>
      {invited === 0 && <p className="mt-2 text-xs text-[#94A3B8]">Todavía no hay convocados en esta fase.</p>}
    </article>
  );
}

/** Upcoming onsite sessions: each process's Module A session and every later citation. */
function upcomingSessions(groups, now = new Date()) {
  const sessions = new Map();
  groups.filter(({ event }) => isOnsite(event)).forEach(({ event, candidates }) => {
    const add = (module, appointment) => {
      const startsAt = asDate(appointment?.startsAt);
      if (!startsAt || startsAt < now) return;
      sessions.set(`${event.id}-${module}-${startsAt.getTime()}`, { key: `${event.id}-${module}-${startsAt.getTime()}`, event, module, appointment, startsAt });
    };
    add('A', event.onsite);
    candidates.forEach((candidate) => {
      add('B', candidate.moduleB?.citation?.appointment);
      add('C', candidate.moduleC?.citation?.appointment);
    });
  });
  return [...sessions.values()].sort((a, b) => a.startsAt - b.startsAt).slice(0, 5);
}

function CompanyOverview() {
  const [events, setEvents] = useState([]);
  const [candidateGroups, setCandidateGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      try {
        const loadedEvents = await eventService.getEvents();
        const groups = await Promise.all(loadedEvents.map(async (event) => ({
          event,
          candidates: await eventService.getEventCandidates(event.id),
        })));
        if (!cancelled) {
          setEvents(loadedEvents);
          setCandidateGroups(groups);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.response?.data?.error?.message || 'No se pudieron cargar las estadísticas de los procesos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadOverview();
    return () => { cancelled = true; };
  }, []);

  const allCandidates = candidateGroups.flatMap((group) => group.candidates);
  const activeEvents = events.filter((event) => !['CLOSED', 'CANCELLED', 'COMPLETED', 'ARCHIVED'].includes(String(event.status || '').toUpperCase()));
  const totals = Object.fromEntries(PHASES.map(([module]) => [module, phaseCounts(allCandidates, module)]));
  const funnel = PHASES.map(([module, label]) => ({ label, value: totals[module].completed, hint: `${totals[module].invited} convocados` }));
  const onsiteCandidates = candidateGroups.filter(({ event }) => isOnsite(event)).flatMap((group) => group.candidates);
  const attendance = [
    { label: 'Convocados', value: onsiteCandidates.filter((candidate) => isInvited(candidate, 'A')).length },
    { label: 'Presentes', value: onsiteCandidates.filter((candidate) => candidate.attendance?.A?.status === 'PRESENT').length },
    { label: 'Completaron', value: onsiteCandidates.filter((candidate) => hasCompleted(candidate, 'A')).length },
  ];
  const sessions = upcomingSessions(candidateGroups);

  return (
    <div className="p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Resumen de actividad</p>
        <div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#101828]">Dashboard</h1>
            <p className="mt-1 text-sm text-[#64748B]">Seguimiento de tus procesos de reclutamiento universitario.</p>
          </div>
          <span className="text-xs text-[#94A3B8]">Datos actualizados al cargar el panel</span>
        </div>

        {error && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {loading ? (
          <div className="mt-8 flex min-h-40 items-center justify-center text-sm text-[#64748B]"><SpinnerIcon className="mr-2 h-5 w-5 animate-spin text-[#0AADA8]" />Cargando estadísticas...</div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Procesos activos" value={activeEvents.length} helper={`${events.length} procesos registrados en total`} icon="▦" />
              <StatCard label="Candidatos totales" value={allCandidates.length} helper="Candidatos asociados a tus procesos" icon="♙" />
              <StatCard label="Fase A completada" value={`${totals.A.completed}/${totals.A.invited}`} helper="Cuestionario" icon="✓" />
              <StatCard label="Fases B y C completadas" value={`${totals.B.completed + totals.C.completed}/${totals.B.invited + totals.C.invited}`} helper="Macrocaso y microcaso" icon="◷" />
            </div>

            <div className="mt-8">
              <h2 className="font-display text-lg font-bold text-[#101828]">Avance de las evaluaciones</h2>
              <p className="mt-1 text-sm text-[#64748B]">Completados en relación con los convocados a cada fase.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {PHASES.map(([module, label]) => <PhaseProgress key={module} title={label} completed={totals[module].completed} invited={totals[module].invited} />)}
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <ChartCard title="Embudo de candidatos" description="Candidatos que completaron cada fase."><BarChart caption="Candidatos que completaron cada fase" items={funnel} /></ChartCard>
              <ChartCard title="Asistencia presencial" description="Fase A de tus procesos presenciales."><BarChart caption="Asistencia presencial" items={attendance} /></ChartCard>
            </div>

            {sessions.length > 0 && (
              <section className="mt-8 rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
                <h2 className="font-display text-lg font-bold text-[#101828]">Próximas sesiones presenciales</h2>
                <ul className="mt-3 divide-y divide-[#EEF2F6]">{sessions.map((session) => <li key={session.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><span className="font-medium text-[#10233A]">{eventName(session.event)} · Fase {session.module}</span><span className="text-xs text-[#64748B]">{formatSession(session.appointment)}</span></li>)}</ul>
              </section>
            )}

            <div className="mt-8">
              <h2 className="font-display text-lg font-bold text-[#101828]">Procesos activos</h2>
              <p className="mt-1 text-sm text-[#64748B]">Resumen del avance por proceso.</p>
              {activeEvents.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center"><p className="font-semibold text-[#334155]">Todavía no hay procesos activos</p><p className="mt-1 text-sm text-[#94A3B8]">Cuando se creen procesos, sus estadísticas aparecerán aquí.</p></div>
              ) : (
                <div className="mt-4 space-y-3">{candidateGroups.filter(({ event }) => activeEvents.some((active) => active.id === event.id)).map(({ event, candidates }) => {
                  const included = PHASES.filter(([module]) => modulesOf(event).includes(module));
                  return <article key={event.id} className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold text-[#101828]">{eventName(event)}</h3><p className="mt-1 text-xs text-[#64748B]">{event.position || event.positionName || 'Proceso de evaluación'} · {candidates.length} candidatos · {isOnsite(event) ? 'Presencial' : 'Virtual'}</p></div><span className="w-fit rounded-full bg-[#E8F8F5] px-3 py-1 text-xs font-semibold text-[#087D79]">{event.status === 'PUBLISHED' ? 'Con resultados' : 'Activo'}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{included.map(([module]) => { const counts = phaseCounts(candidates, module); return <div key={module} className="rounded-xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#64748B]">Fase {module}</p><p className="mt-1 text-sm font-semibold text-[#101828]">{counts.completed}/{counts.invited} completados</p></div>; })}</div></article>;
                })}</div>
              )}
            </div>
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
    <div className="min-h-screen bg-[#F7F9FC] lg:flex">
      <CompanySidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
      />

      <main className="min-w-0 flex-1">
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
