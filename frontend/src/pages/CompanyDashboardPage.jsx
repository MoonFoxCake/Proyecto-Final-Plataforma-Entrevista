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
  const [activeSection, setActiveSection] = useState('events');
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

        {activeSection === 'events' ? (
          <EventsView />
        ) : (
          <CompanyPlaceholderView section={section} />
        )}
      </main>
    </div>
  );
}