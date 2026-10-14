import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { CompanySidebar } from '../../components/company/CompanySidebar.jsx';
import { StatusBadge, useToast } from '../../components/ui';
import * as eventService from '../../services/eventService.js';
import { formatSession } from '../../utils/eventModality.js';
import { eventName, eventPosition, formatDateTime, summarize } from './eventState.js';

const tabClass = ({ isActive }) => `inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition-colors focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 ${isActive ? 'border-[#0AADA8] text-[#087D79]' : 'border-transparent text-[#64748B] hover:text-[#10233A]'}`;

/**
 * Event detail shell (`/company/events/:eventId/*`): one title, the
 * event's status and modality as secondary information, and a tab per
 * working context. The event and its candidates are loaded here once and
 * shared with the tabs through the outlet context, so switching tabs does
 * not refetch or lose state.
 */
export function EventLayout() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { notify, toast } = useToast();
  const [event, setEvent] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setError('');
      const [eventData, candidateData] = await Promise.all([
        eventService.getEvent(eventId),
        eventService.getEventCandidates(eventId),
      ]);
      setEvent(eventData);
      setCandidates(candidateData);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo cargar el evento.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Other users (or the candidates themselves) change things meanwhile.
  useEffect(() => {
    reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const state = useMemo(() => summarize(event, candidates), [event, candidates]);
  const context = useMemo(() => ({
    eventId, event, candidates, setCandidates, reload, notify, state,
  }), [eventId, event, candidates, reload, notify, state]);

  const when = state.onsite ? formatSession(event?.onsite) : `Disponible desde ${formatDateTime(event?.availableFrom || event?.date)}`;

  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar activeSection='events' onSelect={() => navigate('/company-dashboard')} />
      <main className='min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8'>
        <div className='mx-auto max-w-6xl'>
          <button type='button' onClick={() => navigate('/company-dashboard')} className='rounded text-sm text-[#64748B] hover:text-[#087D79] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40'>← Eventos</button>

          {loading ? (
            <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando evento...</div>
          ) : error && !event ? (
            <div role='alert' className='mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700'>{error}</div>
          ) : (
            <>
              <header className='mt-4'>
                <h1 className='font-display text-2xl font-bold text-[#101828] sm:text-[1.75rem]'>{eventName(event)}</h1>
                <div className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#64748B]'>
                  <StatusBadge tone={state.published ? 'ok' : 'info'}>{state.published ? 'Resultados publicados' : 'Activo'}</StatusBadge>
                  <StatusBadge tone={state.onsite ? 'warning' : 'muted'}>{state.onsite ? 'Presencial' : 'Virtual'}</StatusBadge>
                  {eventPosition(event) && <span>{eventPosition(event)}</span>}
                  <span aria-hidden='true'>·</span>
                  <span>{state.hasModuleB ? 'Módulos A y B' : 'Módulo A'}</span>
                  <span aria-hidden='true'>·</span>
                  <span>{when}</span>
                </div>
              </header>

              <nav aria-label='Secciones del evento' className='mt-6 overflow-x-auto overflow-y-hidden'>
                <ul className='flex min-w-max gap-6 border-b border-[#DCE3EA]'>
                  <li><NavLink end to='.' className={tabClass}>Resumen</NavLink></li>
                  <li><NavLink to='candidatos' className={tabClass}>Candidatos <span className='rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs text-[#475569]'>{state.total}</span></NavLink></li>
                  {state.onsite && <li><NavLink to='presencial' className={tabClass}>Aplicación presencial</NavLink></li>}
                  <li><NavLink to='resultados' className={tabClass}>Resultados</NavLink></li>
                </ul>
              </nav>

              {error && <p role='alert' className='mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}

              <div className='mt-6'>
                <Outlet context={context} />
              </div>
            </>
          )}
        </div>
      </main>
      {toast}
    </div>
  );
}
