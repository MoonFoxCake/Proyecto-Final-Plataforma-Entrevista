import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '../../components/ui';
import * as credentialService from '../../services/credentialService.js';
import { formatEntryWindow, formatSession } from '../../utils/eventModality.js';
import { formatDateTime, isToday, nextAction } from './eventState.js';

function Fact({ label, children }) {
  return (
    <div>
      <dt className='text-xs font-medium text-[#64748B]'>{label}</dt>
      <dd className='mt-1 text-sm text-[#10233A]'>{children}</dd>
    </div>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div className='px-5 py-4'>
      <dt className='text-xs font-medium text-[#64748B]'>{label}</dt>
      <dd className='mt-1 font-display text-2xl font-bold text-[#10233A]'>{value}</dd>
      {hint && <p className='mt-0.5 text-xs text-[#94A3B8]'>{hint}</p>}
    </div>
  );
}

/** "Resumen": high-level facts, figures and the next relevant step. No operational tables. */
export function EventSummaryTab() {
  const navigate = useNavigate();
  const { eventId, event, state } = useOutletContext();
  const [pendingAccesses, setPendingAccesses] = useState(0);

  // Onsite: how many candidates still lack an access code (for the next step).
  useEffect(() => {
    if (!state.onsite || state.published || state.total === 0) return undefined;
    let active = true;
    credentialService.getCredentials(eventId)
      .then((summary) => active && setPendingAccesses(summary.modules?.find((item) => item.module === 'A')?.counts?.pending ?? 0))
      .catch(() => {});
    return () => { active = false; };
  }, [eventId, state.onsite, state.published, state.total, state.contacted]);

  const action = nextAction(state, { pendingAccesses, onsiteToday: state.onsite && isToday(event?.onsite?.startsAt) });

  return (
    <div className='space-y-6'>
      <section aria-labelledby='next-action-title' className='flex flex-col gap-4 rounded-2xl border border-[#CDEBEA] bg-[#F4FBFB] p-5 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-[#087D79]'>Próxima acción</p>
          <h2 id='next-action-title' className='mt-1 font-display text-lg font-bold text-[#101828]'>{action.title}</h2>
          <p className='mt-1 text-sm text-[#56677B]'>{action.description}</p>
        </div>
        {action.to && <Button type='button' variant='accent' className='h-11 shrink-0 px-5' onClick={() => navigate(action.to)}>{action.label}</Button>}
      </section>

      <section aria-labelledby='figures-title' className='rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        <h2 id='figures-title' className='sr-only'>Cifras del evento</h2>
        <dl className='grid grid-cols-2 divide-[#EEF2F6] sm:grid-cols-4 sm:divide-x'>
          <Metric label='Candidatos' value={state.total} />
          <Metric label={state.onsite ? 'Citados' : 'Invitados'} value={state.contacted} hint={state.pending ? `${state.pending} pendientes` : undefined} />
          <Metric label='Evaluaciones completadas' value={state.completed} />
          {state.hasModuleB && state.published
            ? <Metric label='Módulo B respondidos' value={`${state.moduleBCompleted}/${state.moduleBSent}`} />
            : <Metric label='Perfiles publicados' value={state.profiles} />}
        </dl>
      </section>

      <section aria-labelledby='event-facts-title' className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm'>
        <h2 id='event-facts-title' className='font-display text-base font-bold text-[#101828]'>{state.onsite ? 'Aplicación presencial' : 'Aplicación virtual'}</h2>
        <dl className='mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
          {state.onsite ? (
            <>
              <Fact label='Fecha y horario'>{formatSession(event?.onsite)}</Fact>
              <Fact label='Ventana de inicio'>{formatEntryWindow(event?.onsite)}</Fact>
              <Fact label='Sede'>{event?.onsite?.venue || '—'}</Fact>
              <Fact label='Ubicación'>{event?.onsite?.room || '—'}</Fact>
            </>
          ) : (
            <Fact label='Disponible desde'>{formatDateTime(event?.availableFrom || event?.date)}</Fact>
          )}
          <Fact label='Módulos'>{state.hasModuleB ? 'A · Cuestionario y B · Macrocaso' : 'A · Cuestionario'}</Fact>
        </dl>
        {state.onsite && event?.onsite?.instructions && (
          <div className='mt-5 border-t border-[#EEF2F6] pt-4'>
            <p className='text-xs font-medium text-[#64748B]'>Indicaciones para los candidatos</p>
            <p className='mt-1 whitespace-pre-line text-sm text-[#334E68]'>{event.onsite.instructions}</p>
          </div>
        )}
        {event?.description && <p className='mt-5 border-t border-[#EEF2F6] pt-4 text-sm text-[#56677B]'>{event.description}</p>}
      </section>
    </div>
  );
}
