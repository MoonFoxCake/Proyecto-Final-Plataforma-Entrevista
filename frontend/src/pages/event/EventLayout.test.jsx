
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';

import { CompanySidebar } from '../../components/company/CompanySidebar.jsx';
import { StatusBadge, useToast } from '../../components/ui';
import * as eventService from '../../services/eventService.js';
import * as subscriptionService from '../../services/subscriptionService.js';

import {
  canUseModule,
  normalizePlanId,
  SUBSCRIPTION_PLANS,
} from '../../utils/subscriptionPlans.js';

import { formatSession } from '../../utils/eventModality.js';
import {
  eventName,
  eventPosition,
  formatDateTime,
  summarize,
} from './eventState.js';

export function EventLayout() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { notify, toast } = useToast();

  const [event, setEvent] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Suscripción de la organización
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(false);

  // Cargar evento y candidatos
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [eventData, candidatesData] = await Promise.all([
        eventService.getEvent(eventId),
        eventService.getEventCandidates(eventId),
      ]);

      setEvent(eventData);
      setCandidates(candidatesData ?? []);
    } catch (err) {
      console.error('Error al cargar el evento:', err);
      setError(
        err?.response?.data?.message ||
        'No se pudo cargar la información del evento.'
      );
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Cargar suscripción de la organización autenticada
  useEffect(() => {
    let active = true;

    async function loadSubscription() {
      setSubscriptionLoading(true);
      setSubscriptionError(false);

      try {
        const data = await subscriptionService.getSubscription();

        if (active) {
          setSubscription(data);
        }
      } catch (err) {
        console.error('No se pudo cargar la suscripción:', err);

        if (active) {
          setSubscriptionError(true);
        }
      } finally {
        if (active) {
          setSubscriptionLoading(false);
        }
      }
    }

    loadSubscription();

    return () => {
      active = false;
    };
  }, []);

  // Recargar evento al entrar y cuando se recupera el foco
  useEffect(() => {
    reload();

    const handleFocus = () => reload();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reload();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [reload]);

  // Estado calculado del evento
  const state = useMemo(
    () => summarize(event, candidates),
    [event, candidates]
  );

  // Normalizar el identificador del plan.
  // Si la suscripción no pudo verificarse, no concedemos permisos.
  const rawPlanId =
    subscription?.subscription?.planId ??
    subscription?.planId ??
    null;

  const planId = rawPlanId
    ? normalizePlanId(rawPlanId)
    : null;

  const currentPlan = planId
    ? SUBSCRIPTION_PLANS[planId] ?? null
    : null;

  const hasModuleA = Boolean(
    !subscriptionError &&
    planId &&
    canUseModule(planId, 'A')
  );

  const hasModuleB = Boolean(
    !subscriptionError &&
    planId &&
    canUseModule(planId, 'B')
  );

  const hasModuleC = Boolean(
    !subscriptionError &&
    planId &&
    canUseModule(planId, 'C')
  );

  // Contexto compartido con las pestañas del evento
  const context = useMemo(
    () => ({
      eventId,
      event,
      candidates,
      setCandidates,
      reload,
      notify,
      state,

      // Información de suscripción
      subscription,
      subscriptionLoading,
      subscriptionError,
      planId,
      currentPlan,

      // Permisos de módulos
      hasModuleA,
      hasModuleB,
      hasModuleC,
    }),
    [
      eventId,
      event,
      candidates,
      reload,
      notify,
      state,
      subscription,
      subscriptionLoading,
      subscriptionError,
      planId,
      currentPlan,
      hasModuleA,
      hasModuleB,
      hasModuleC,
    ]
  );

  const isOnsite = event?.modality === 'onsite' ||
    event?.modality === 'presencial';

  const tabs = [
    {
      label: 'Resumen',
      to: '',
      end: true,
      show: true,
    },
    {
      label: `Candidatos ${candidates.length}`,
      to: 'candidatos',
      show: true,
    },
    {
      label: 'Aplicación presencial',
      to: 'presencial',
      show: isOnsite,
    },
    {
      label: 'Resultados',
      to: 'resultados',
      show: true,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <CompanySidebar />
        <main className="ml-64 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-96 rounded bg-gray-200" />
            <div className="h-32 rounded-2xl bg-gray-200" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <CompanySidebar />
        <main className="ml-64 p-8">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-800">
              No se pudo abrir el evento
            </h2>
            <p className="mt-2 text-sm text-red-700">
              {error || 'El evento solicitado no existe.'}
            </p>
            <button
              type="button"
              onClick={() => navigate('/company/events')}
              className="mt-4 rounded-lg bg-[#087D79] px-4 py-2 text-sm font-semibold text-white"
            >
              Volver a eventos
            </button>
          </div>
        </main>
      </div>
    );
  }

  const modalityLabel = isOnsite ? 'Presencial' : 'Virtual';

  const modulesLabel = (event.modules ?? ['A'])
    .map((module) => `Módulo ${module}`)
    .join(' y ');

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <CompanySidebar />

      <main className="ml-64 min-h-screen px-8 py-8">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Encabezado del evento */}
          <header className="space-y-4">
            <button
              type="button"
              onClick={() => navigate('/company/events')}
              className="text-sm font-medium text-gray-500 hover:text-[#087D79]"
            >
              ← Volver a eventos
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={event.status} />
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {modalityLabel}
                  </span>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                    {modulesLabel}
                  </span>
                </div>

                <h1 className="font-display text-3xl font-bold text-[#101828]">
                  {eventName(event)}
                </h1>

                <p className="mt-2 text-sm text-gray-500">
                  {formatDateTime(event.availableFrom)}
                  {event.availableTo
                    ? ` – ${formatDateTime(event.availableTo)}`
                    : ''}
                </p>
              </div>
            </div>
          </header>

          {/* Información de suscripción */}
          {!subscriptionLoading && (
            <section className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              {subscriptionError || !currentPlan ? (
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    No se pudo verificar tu suscripción.
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    No se habilitarán módulos adicionales hasta verificar el plan.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/planes')}
                    className="mt-2 text-sm font-semibold text-[#087D79] hover:underline"
                  >
                    Revisar planes
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Plan de suscripción
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-800">
                      {currentPlan.name}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/planes')}
                    className="text-sm font-semibold text-[#087D79] hover:underline"
                  >
                    Administrar plan
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Pestañas */}
          <nav
            aria-label="Secciones del evento"
            className="flex flex-wrap gap-2 border-b border-gray-200"
          >
            {tabs
              .filter((tab) => tab.show)
              .map((tab) => (
                <NavLink
                  key={tab.to || 'resumen'}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-[#087D79] text-[#087D79]'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
          </nav>

          {/* Contenido de la pestaña activa */}
          <Outlet context={context} />

          {toast}
        </div>
      </main>
    </div>
  );
}

