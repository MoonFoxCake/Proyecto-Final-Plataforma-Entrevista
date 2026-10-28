import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CompanySidebar,
  COMPANY_SECTIONS,
  CompanyPlaceholderView,
} from '../components/company/CompanySidebar.jsx';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import * as eventService from '../services/eventService.js';
import * as subscriptionService from '../services/subscriptionService.js';
import {
  SUBSCRIPTION_PLANS,
  normalizePlanId,
} from '../utils/subscriptionPlans.js';

function eventName(event) {
  return (
    event.name ||
    event.title ||
    event.eventName ||
    event.positionName ||
    'Evento sin nombre'
  );
}

function eventMeta(event) {
  return (
    event.position ||
    event.positionName ||
    event.module ||
    event.status ||
    'Proceso de evaluación'
  );
}

function formatAvailability(event) {
  const value =
    event.availableFrom ||
    event.fechaHoraCita ||
    event.eventDate ||
    event.date;

  if (!value) return 'Sin fecha configurada';

  const raw = value._seconds ? value._seconds * 1000 : value;
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';

  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function EventsView() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    eventService
      .getEvents()
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError.response?.data?.error?.message ||
              'No se pudieron cargar los eventos.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">
          Portal Empresa
        </p>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#101828]">
              Eventos
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Abre un evento existente para gestionar sus candidatos.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-[#E0F7F6] px-3 py-1 text-xs font-semibold text-[#087D79] sm:inline-flex">
              {events.length} evento{events.length === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              onClick={() => navigate('/company/events/new')}
              className="rounded-xl bg-[#0AADA8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#089490]"
            >
              + Nuevo evento
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-8 flex min-h-52 items-center justify-center text-sm text-[#6A7282]">
            <SpinnerIcon className="mr-2 h-5 w-5 animate-spin text-[#0AADA8]" />
            Cargando eventos...
          </div>
        ) : events.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center">
            <p className="font-semibold text-[#334155]">
              No hay eventos disponibles
            </p>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Los eventos existentes de tu organización aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => navigate(`/company/events/${event.id}`)}
                className="group flex w-full flex-col gap-4 rounded-2xl border border-[#E5EAF0] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#0AADA8]/50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-[#101828]">
                      {eventName(event)}
                    </h2>
                    <span className="rounded-md bg-[#E8F8F5] px-2 py-1 text-[11px] font-semibold text-[#087D79]">
                      Evaluación
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-[#64748B]">
                    {eventMeta(event)} · {formatAvailability(event)}
                  </p>

                  {event.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-[#7C8AA0]">
                      {event.description}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-4 self-end sm:self-auto">
                  <span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-[#087D79]">
                    {event.status === 'PUBLISHED' ? 'Publicado' : 'Activo'}
                  </span>
                  <span className="rounded-lg border border-[#DCE3EA] px-3 py-2 text-xs font-semibold text-[#334155]">
                    Ver detalle
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function isPhaseAInvited(candidate) {
  return ['INVITATION_SENT', 'EVALUATION_COMPLETED'].includes(candidate.status);
}

function isPhaseACompleted(candidate) {
  return Boolean(candidate.submittedAt) || candidate.status === 'EVALUATION_COMPLETED';
}

function isPhaseBInvited(candidate) {
  return ['INVITATION_SENT', 'COMPLETED'].includes(candidate.moduleB?.status);
}

function isPhaseBCompleted(candidate) {
  return candidate.moduleB?.status === 'COMPLETED' || Boolean(candidate.moduleB?.submittedAt);
}

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

function PhaseProgress({ title, completed, invited, description }) {
  const percentage = invited > 0 ? Math.round((completed / invited) * 100) : 0;
  return (
    <article className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-[#101828]">{title}</h3>
          <p className="mt-1 text-xs text-[#64748B]">{description}</p>
        </div>
        <span className="rounded-full bg-[#E8F8F5] px-3 py-1 text-xs font-semibold text-[#087D79]">{percentage}%</span>
      </div>
      <div className="mt-5 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold text-[#101828]">{completed}</span>
        <span className="text-sm text-[#64748B]">de {invited} invitados completaron</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8EEF3]">
        <div className="h-full rounded-full bg-[#0AADA8] transition-all" style={{ width: `${percentage}%` }} />
      </div>
      {invited === 0 && <p className="mt-2 text-xs text-[#94A3B8]">Todavía no hay invitaciones registradas para esta fase.</p>}
    </article>
  );
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
  const phaseAInvited = allCandidates.filter(isPhaseAInvited).length;
  const phaseACompleted = allCandidates.filter(isPhaseACompleted).length;
  const phaseBInvited = allCandidates.filter(isPhaseBInvited).length;
  const phaseBCompleted = allCandidates.filter(isPhaseBCompleted).length;

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
              <StatCard label="Fase 1 completada" value={`${phaseACompleted}/${phaseAInvited}`} helper="Cuestionario de evaluación ética" icon="✓" />
              <StatCard label="Fase 2 completada" value={`${phaseBCompleted}/${phaseBInvited}`} helper="Microcaso o segunda fase" icon="◷" />
            </div>

            <div className="mt-8">
              <h2 className="font-display text-lg font-bold text-[#101828]">Avance de las evaluaciones</h2>
              <p className="mt-1 text-sm text-[#64748B]">Completados en relación con las invitaciones enviadas a cada fase.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <PhaseProgress title="Fase 1 · Cuestionario" completed={phaseACompleted} invited={phaseAInvited} description="Candidatos que completaron el cuestionario inicial." />
                <PhaseProgress title="Fase 2 · Evaluación complementaria" completed={phaseBCompleted} invited={phaseBInvited} description="Candidatos invitados a la segunda fase que la completaron." />
              </div>
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div><h2 className="font-display text-lg font-bold text-[#101828]">Procesos activos</h2><p className="mt-1 text-sm text-[#64748B]">Resumen del avance por proceso.</p></div>
              </div>
              {activeEvents.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center"><p className="font-semibold text-[#334155]">Todavía no hay procesos activos</p><p className="mt-1 text-sm text-[#94A3B8]">Cuando se creen procesos, sus estadísticas aparecerán aquí.</p></div>
              ) : (
                <div className="mt-4 space-y-3">{candidateGroups.filter(({ event }) => activeEvents.some((active) => active.id === event.id)).map(({ event, candidates }) => {
                  const aInvited = candidates.filter(isPhaseAInvited).length;
                  const aDone = candidates.filter(isPhaseACompleted).length;
                  const bInvited = candidates.filter(isPhaseBInvited).length;
                  const bDone = candidates.filter(isPhaseBCompleted).length;
                  return <article key={event.id} className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold text-[#101828]">{eventName(event)}</h3><p className="mt-1 text-xs text-[#64748B]">{event.position || event.positionName || 'Proceso de evaluación'} · {candidates.length} candidatos</p></div><span className="w-fit rounded-full bg-[#E8F8F5] px-3 py-1 text-xs font-semibold text-[#087D79]">{event.status === 'PUBLISHED' ? 'Publicado' : 'Activo'}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#64748B]">Fase 1</p><p className="mt-1 text-sm font-semibold text-[#101828]">{aDone}/{aInvited} completados</p></div><div className="rounded-xl bg-[#F7F9FC] p-3"><p className="text-xs text-[#64748B]">Fase 2</p><p className="mt-1 text-sm font-semibold text-[#101828]">{bDone}/{bInvited} completados</p></div></div></article>;
                })}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceivedResultsView() {
  return (
    <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Documentos entregados</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Resultados recibidos</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Aquí estarán disponibles los informes PDF que el administrador comparta con tu organización, identificados por proceso y fase de evaluación.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Informes recibidos" value="—" helper="Se mostrará al habilitar la entrega de informes" icon="▤" />
        <StatCard label="Procesos con resultados" value="—" helper="Procesos que tienen al menos un informe compartido" icon="▦" />
        <StatCard label="Última entrega" value="—" helper="Fecha del informe más reciente" icon="◷" />
      </div>
      <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center sm:p-14">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E0F7F6] text-2xl text-[#087D79]">PDF</div>
        <h2 className="mt-4 font-display text-lg font-bold text-[#101828]">Tus informes aparecerán aquí</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#64748B]">La recepción y descarga de archivos todavía no está habilitada. Cuando el administrador comparta un resultado, se mostrará su nombre, proceso, fase, fecha de entrega y un botón para abrir o descargar el PDF.</p>
      </div>
    </div></div>
  );
}

function SubscriptionBanner({ subscriptionData, error }) {
  const navigate = useNavigate();

  if (error) {
    return (
      <div className="mx-5 mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:mx-8">
        {error}
      </div>
    );
  }

  if (!subscriptionData) {
    return (
      <div className="mx-5 mt-5 rounded-xl border border-[#E5EAF0] bg-white p-4 text-sm text-[#64748B] sm:mx-8">
        Cargando suscripción...
      </div>
    );
  }

  const subscription = subscriptionData.subscription || {};
  const planId = normalizePlanId(subscription.planId);
  const plan = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS['fase-a'];

  const statusLabel =
    subscription.status === 'pending_simulation'
      ? 'Simulación pendiente'
      : subscription.status === 'active'
        ? 'Activa'
        : subscription.status || 'Sin estado';

  return (
    <section className="mx-5 mt-5 rounded-2xl border border-[#CDEBEA] bg-white p-5 shadow-sm sm:mx-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">
            Mi suscripción
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-[#101828]">
            {plan.name}
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">
            {subscriptionData.companyName || 'Mi empresa'} · Estado: {statusLabel}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <span className="rounded-full bg-[#E0F7F6] px-3 py-1.5 text-xs font-semibold text-[#087D79]">
            {plan.modules.length} de 3 módulos incluidos
          </span>

          <button
            type="button"
            onClick={() => navigate('/planes?mode=manage')}
            className="rounded-xl bg-[#0B1F33] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Actualizar suscripción
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {['A', 'B', 'C'].map((module) => {
          const available = plan.modules.includes(module);

          return (
            <span
              key={module}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                available
                  ? 'bg-[#E8F8F5] text-[#087D79]'
                  : 'bg-[#F1F5F9] text-[#94A3B8]'
              }`}
            >
              {available ? '✓' : '🔒'} Módulo {module}
              {!available
                ? ' · No incluido'
                : module === 'C'
                  ? ' · Función pendiente'
                  : ''}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-5 text-[#64748B]">
        Los módulos disponibles dependen del plan guardado para tu organización.
        La compra y el cobro siguen siendo simulados.
      </p>
    </section>
  );
}

export function CompanyDashboardPage() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [subscriptionError, setSubscriptionError] = useState('');

  useEffect(() => {
    let cancelled = false;

    subscriptionService
      .getSubscription()
      .then((data) => {
        if (!cancelled) setSubscriptionData(data);
      })
      .catch(() => {
        if (!cancelled) {
          setSubscriptionError(
            'No se pudo cargar la información de la suscripción.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const section = COMPANY_SECTIONS.find((item) => item.id === activeSection);

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:flex">
      <CompanySidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
      />

      <main className="min-w-0 flex-1">
        <SubscriptionBanner
          subscriptionData={subscriptionData}
          error={subscriptionError}
        />

        {activeSection === 'dashboard' ? (
          <CompanyOverview />
        ) : activeSection === 'events' ? (
          <EventsView />
        ) : activeSection === 'reports' ? (
          <ReceivedResultsView />
        ) : (
          <CompanyPlaceholderView section={section} />
        )}
      </main>
    </div>
  );
}