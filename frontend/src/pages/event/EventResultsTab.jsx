import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { EvaluationStatus } from '../../components/company/CandidateList.jsx';
import { EMPTY_SESSION, SessionFields, sessionProblem, toCitationPayload } from '../../components/company/SessionFields.jsx';
import { Button, Dialog, StatusBadge } from '../../components/ui';
import * as eventService from '../../services/eventService.js';
import { citationState, formatSession } from '../../utils/eventModality.js';
import { canReceiveModuleB, failureReasons } from './eventState.js';

const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

function ModuleBStatus({ moduleB }) {
  if (moduleB?.status === 'COMPLETED') return <StatusBadge tone='ok'>Respondido</StatusBadge>;
  if (moduleB?.status === 'CITED') {
    const { label, tone, detail } = citationState(moduleB.citation);
    return (
      <span className='flex flex-col items-start gap-1'>
        <StatusBadge tone={tone === 'error' ? 'error' : 'info'} title={detail}>Citado · {label.toLowerCase()}</StatusBadge>
        {moduleB.citation?.appointment && <span className='text-[11px] text-[#64748B]'>{formatSession(moduleB.citation.appointment)}</span>}
      </span>
    );
  }
  if (moduleB?.status === 'INVITATION_SENT') return <StatusBadge tone='info'>Enviado</StatusBadge>;
  return <span className='text-xs text-[#94A3B8]'>No enviado</span>;
}

/**
 * "Resultados": published Module A profiles (opened in the existing profile
 * page) and, from there, the choice of who continues to Module B.
 */
export function EventResultsTab() {
  const { eventId, event, candidates, reload, notify, state } = useOutletContext();
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [citing, setCiting] = useState(false);
  const [session, setSession] = useState(() => ({ ...EMPTY_SESSION, sede: event?.onsite?.venue || '', ubicacion: event?.onsite?.room || '' }));
  const [sessionError, setSessionError] = useState('');
  const eligible = candidates.filter(canReceiveModuleB);

  if (!state.published) {
    return (
      <section aria-labelledby='results-title' className='rounded-2xl border border-[#DDE5EC] bg-white px-6 py-12 text-center shadow-sm'>
        <h2 id='results-title' className='font-display text-lg font-bold text-[#101828]'>Aún no hay resultados publicados</h2>
        <p className='mx-auto mt-2 max-w-md text-sm text-[#64748B]'>
          Los perfiles aparecerán aquí cuando el equipo de NexoPerfil publique la revisión. Evaluaciones completadas: {state.completed} de {state.total}.
        </p>
      </section>
    );
  }

  const toggle = (candidateId) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(candidateId)) next.delete(candidateId);
    else next.add(candidateId);
    return next;
  });

  const sendModuleB = async (citation) => {
    const ids = [...selected];
    setSending(true);
    setError('');
    try {
      const result = await eventService.sendModuleBInvitations(eventId, ids, citation);
      await reload();
      setSelected(new Set());
      setCiting(false);
      const what = state.onsite ? 'la citación al Módulo B' : 'el Módulo B';
      if (result.failed) setError(`Se envió ${what} a ${result.sent} de ${result.total} candidatos. ${result.failed} no se pudieron enviar.${failureReasons(result)}`);
      else notify(`Se envió ${what} a ${result.sent} candidato(s).`);
    } catch (requestError) {
      const message = errorMessage(requestError, 'No se pudo enviar el Módulo B.');
      if (citing) setSessionError(message);
      else setError(message);
    } finally {
      setSending(false);
    }
  };

  const resent = candidates.filter((candidate) => selected.has(candidate.id) && ['INVITATION_SENT', 'CITED'].includes(candidate.moduleB?.status)).length;

  const startSending = () => {
    if (state.onsite) {
      setSessionError('');
      setCiting(true);
      return;
    }
    const message = `Se enviará el Módulo B a ${selected.size} candidato(s).`
      + (resent ? ` ${resent} ya lo había(n) recibido: tendrán un enlace nuevo y el anterior dejará de funcionar.` : '')
      + ' ¿Deseas continuar?';
    if (window.confirm(message)) sendModuleB();
  };

  const confirmCitation = () => {
    const problem = sessionProblem(session);
    if (problem) {
      setSessionError(problem);
      return;
    }
    sendModuleB(toCitationPayload(session));
  };

  return (
    <section aria-labelledby='results-title' className='space-y-5'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 id='results-title' className='font-display text-lg font-bold text-[#101828]'>Resultados</h2>
          <p className='mt-1 text-sm text-[#64748B]'>
            {state.hasModuleB ? 'Revisa los perfiles y selecciona a quienes continúan al Módulo B.' : 'Perfiles publicados del Módulo A.'}
          </p>
        </div>
        {state.hasModuleB && (
          <div className='flex flex-wrap items-center gap-3 sm:shrink-0 sm:flex-nowrap'>
            <button type='button' onClick={() => setSelected(new Set(eligible.map((candidate) => candidate.id)))} disabled={eligible.length === 0} className='rounded px-1 text-sm font-semibold text-[#0A8F8A] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:text-[#94A3B8] disabled:no-underline'>
              Seleccionar disponibles ({eligible.length})
            </button>
            <Button type='button' variant='accent' className='h-11 px-5' onClick={startSending} disabled={sending || selected.size === 0}>
              {state.onsite ? `Citar al Módulo B (${selected.size})` : `Enviar Módulo B (${selected.size})`}
            </Button>
          </div>
        )}
      </div>

      {state.hasModuleB && (
        <p className='text-xs text-[#64748B]'>
          {event?.moduleB?.macrocase
            ? <>Macrocaso de este proceso: <strong className='text-[#334E68]'>{event.moduleB.macrocase.name}</strong> · todos los candidatos reciben el mismo caso.</>
            : 'En el primer envío se asigna al azar un macrocaso activo del banco; todos los candidatos del evento recibirán el mismo caso.'}
          {' '}{state.onsite ? 'La citación indica la sede y el horario, sin enlaces ni códigos.' : 'Cada candidato recibe un enlace personal válido por 3 días.'}
        </p>
      )}

      {error && <p role='alert' className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{error}</p>}

      <div className='overflow-x-auto rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        <table className='w-full text-left'>
          <thead className='border-b border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
            <tr>
              {state.hasModuleB && <th scope='col' className='w-12 px-5 py-3'><span className='sr-only'>Seleccionar</span></th>}
              <th scope='col' className='px-5 py-3'>Candidato</th>
              <th scope='col' className='px-5 py-3'>Módulo A</th>
              {state.hasModuleB && <th scope='col' className='px-5 py-3'>Módulo B</th>}
              <th scope='col' className='px-5 py-3 text-right'>Perfil</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-[#E8EDF2]'>
            {candidates.map((candidate) => (
              <tr key={candidate.id} className={selected.has(candidate.id) ? 'bg-[#F4FBFB]' : 'bg-white'}>
                {state.hasModuleB && (
                  <td className='px-5 py-4'>
                    {canReceiveModuleB(candidate) && (
                      <input type='checkbox' checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} aria-label={`Seleccionar a ${candidate.nombreCompleto} para el Módulo B`} className='h-4 w-4 cursor-pointer accent-[#0AADA8]' />
                    )}
                  </td>
                )}
                <td className='px-5 py-4 text-sm font-semibold text-[#101828]'>{candidate.nombreCompleto}</td>
                <td className='px-5 py-4'><EvaluationStatus status={candidate.status} profileAvailable={candidate.profileAvailable} onsite={state.onsite} /></td>
                {state.hasModuleB && <td className='px-5 py-4'><ModuleBStatus moduleB={candidate.moduleB} /></td>}
                <td className='px-5 py-4 text-right'>
                  {candidate.profileAvailable
                    ? <Link to={`/company/events/${eventId}/candidates/${candidate.id}/result`} className='inline-flex rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] transition hover:border-[#13A9A4] hover:text-[#087D79] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40'>Ver perfil</Link>
                    : <span className='text-xs text-[#94A3B8]'>No disponible</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {citing && (
        <Dialog
          title={`Citar al Módulo B (${selected.size})`}
          description={`Indica la sesión presencial.${resent ? ` ${resent} candidato(s) ya habían sido citados y recibirán la nueva citación.` : ''} La citación no incluye enlaces ni códigos.`}
          busy={sending}
          onClose={() => setCiting(false)}
          footer={(
            <>
              <Button type='button' variant='outline' className='h-10 px-4' onClick={() => setCiting(false)} disabled={sending}>Cancelar</Button>
              <Button type='button' variant='accent' className='h-10 px-5' onClick={confirmCitation} disabled={sending}>{sending ? 'Enviando...' : 'Enviar citaciones'}</Button>
            </>
          )}
        >
          <SessionFields value={session} onChange={setSession} idPrefix='modulo-b' />
          {sessionError && <p role='alert' className='mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{sessionError}</p>}
        </Dialog>
      )}
    </section>
  );
}
