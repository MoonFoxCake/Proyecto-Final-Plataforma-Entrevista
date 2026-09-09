import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompanySidebar, COMPANY_SECTIONS, CompanyPlaceholderView } from '../components/company/CompanySidebar.jsx';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import * as eventService from '../services/eventService.js';

function eventName(event) {
  return event.name || event.title || event.eventName || event.positionName || 'Evento sin nombre';
}

function eventMeta(event) {
  return event.position || event.positionName || event.module || event.status || 'Proceso de evaluación';
}

function formatAvailability(event) {
  const value = event.availableFrom || event.fechaHoraCita || event.eventDate || event.date;
  if (!value) return 'Sin fecha configurada';
  const raw = value._seconds ? value._seconds * 1000 : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function EventsView() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    eventService.getEvents()
      .then(setEvents)
      .catch((requestError) => setError(requestError.response?.data?.error?.message || 'No se pudieron cargar los eventos.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className='p-5 sm:p-8'>
      <div className='mx-auto max-w-6xl'>
        <p className='text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]'>Portal Empresa</p>
        <div className='mt-2 flex items-start justify-between gap-4'>
          <div>
            <h1 className='font-display text-2xl font-bold text-[#101828]'>Eventos</h1>
            <p className='mt-1 text-sm text-[#64748B]'>Abre un evento existente para gestionar sus candidatos.</p>
          </div>
          <div className='flex items-center gap-3'>
            <span className='hidden rounded-full bg-[#E0F7F6] px-3 py-1 text-xs font-semibold text-[#087D79] sm:inline-flex'>{events.length} evento{events.length === 1 ? '' : 's'}</span>
            <button type='button' onClick={() => navigate('/company/events/new')} className='rounded-xl bg-[#0AADA8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#089490]'>+ Nuevo evento</button>
          </div>
        </div>

        {error && <p className='mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>{error}</p>}

        {loading ? (
          <div className='mt-8 flex min-h-52 items-center justify-center text-sm text-[#6A7282]'>
            <SpinnerIcon className='mr-2 h-5 w-5 animate-spin text-[#0AADA8]' /> Cargando eventos...
          </div>
        ) : events.length === 0 ? (
          <div className='mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center'>
            <p className='font-semibold text-[#334155]'>No hay eventos disponibles</p>
            <p className='mt-1 text-sm text-[#94A3B8]'>Los eventos existentes de tu organización aparecerán aquí.</p>
          </div>
        ) : (
          <div className='mt-8 space-y-4'>
            {events.map((event) => (
              <button
                key={event.id}
                type='button'
                onClick={() => navigate(`/company/events/${event.id}`)}
                className='group flex w-full flex-col gap-4 rounded-2xl border border-[#E5EAF0] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#0AADA8]/50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'><h2 className='font-display text-base font-bold text-[#101828]'>{eventName(event)}</h2><span className='rounded-md bg-[#E8F8F5] px-2 py-1 text-[11px] font-semibold text-[#087D79]'>Plan A</span></div>
                  <p className='mt-1 text-sm text-[#64748B]'>{eventMeta(event)} · {formatAvailability(event)}</p>
                  {event.description && <p className='mt-3 line-clamp-2 text-sm text-[#7C8AA0]'>{event.description}</p>}
                </div>
                <div className='flex shrink-0 items-center gap-4 self-end sm:self-auto'><span className='rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-medium text-[#087D79]'>Activo</span><span className='rounded-lg border border-[#DCE3EA] px-3 py-2 text-xs font-semibold text-[#334155]'>Ver detalle</span></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompanyDashboardPage() {
  const [activeSection, setActiveSection] = useState('events');
  const section = COMPANY_SECTIONS.find((item) => item.id === activeSection);
  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar activeSection={activeSection} onSelect={setActiveSection} />
      <main className='min-w-0 flex-1'>
        {activeSection === 'events' ? <EventsView /> : <CompanyPlaceholderView section={section} />}
      </main>
    </div>
  );
}
