import { useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { CandidateForm } from '../../components/company/CandidateForm.jsx';
import { CandidateList } from '../../components/company/CandidateList.jsx';
import { Button } from '../../components/ui';
import * as eventService from '../../services/eventService.js';
import { failureReasons } from './eventState.js';

const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

/**
 * "Candidatos": register participants and send / follow their citations
 * (onsite) or invitation links (online). One primary action: sending.
 */
export function EventCandidatesTab() {
  const { eventId, candidates, setCandidates, reload, notify, state } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(searchParams.get('nuevo') === '1');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const what = state.onsite ? 'citaciones' : 'invitaciones';
  const hasCitations = candidates.some((candidate) => candidate.citation?.providerId || candidate.moduleB?.citation?.providerId);

  const openForm = () => {
    setShowForm(true);
    setError('');
  };

  const closeForm = () => {
    setShowForm(false);
    if (searchParams.has('nuevo')) setSearchParams({}, { replace: true });
  };

  const handleCreated = (candidate) => {
    setCandidates((current) => [...current, candidate]);
    closeForm();
    notify(`${candidate.nombreCompleto} quedó registrado.`);
  };

  const send = async () => {
    const message = state.onsite
      ? `Se enviarán ${state.pending} citación(es) presenciales con la sede, la fecha y el horario. No incluyen enlaces ni códigos de acceso. ¿Deseas continuar?`
      : `Se enviarán ${state.pending} invitación(es) con un enlace personal. ¿Deseas continuar?`;
    if (!window.confirm(message)) return;
    setSending(true);
    setError('');
    try {
      const result = await eventService.publishEventInvitations(eventId);
      await reload();
      if (result.failed) setError(`Se enviaron ${result.sent} de ${result.total} ${what}. ${result.failed} no se pudieron enviar.${failureReasons(result)}`);
      else notify(`Se enviaron ${result.sent} ${what}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, `No se pudieron enviar las ${what}.`));
    } finally {
      setSending(false);
    }
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    setError('');
    try {
      const result = await eventService.refreshCitationStatus(eventId);
      await reload();
      if (result.failed) setError(`Se consultaron ${result.checked} citación(es); ${result.failed} no se pudieron consultar. Intenta de nuevo en unos minutos.`);
      else notify(`Estado de envío actualizado (${result.checked} citación(es)).`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo consultar el estado de envío.'));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshButton = state.onsite && hasCitations && (
    <button type='button' onClick={refreshStatus} disabled={refreshing} className='rounded text-[11px] font-semibold normal-case tracking-normal text-[#0A8F8A] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:opacity-50'>
      {refreshing ? 'Consultando…' : '↻ Actualizar'}
    </button>
  );

  return (
    <section aria-labelledby='candidates-title'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 id='candidates-title' className='font-display text-lg font-bold text-[#101828]'>Candidatos</h2>
          <p className='mt-1 text-sm text-[#64748B]'>
            {state.published
              ? 'Los resultados ya se publicaron: no se pueden agregar candidatos.'
              : state.onsite ? 'Registra a los participantes y envíales la citación a la sede.' : 'Registra a los participantes y envíales su enlace de evaluación.'}
          </p>
        </div>
        {!state.published && (
          <div className='flex flex-wrap gap-3 sm:shrink-0 sm:flex-nowrap'>
            <Button type='button' variant='outline' className='h-11 whitespace-nowrap px-4' onClick={openForm} disabled={showForm}>+ Agregar candidato</Button>
            <Button type='button' variant='accent' className='h-11 whitespace-nowrap px-5' onClick={send} disabled={sending || state.pending === 0} title={state.pending === 0 ? `No hay ${what} pendientes` : undefined}>
              {sending ? 'Enviando...' : state.onsite ? `Enviar citaciones (${state.pending})` : `Publicar invitaciones (${state.pending})`}
            </Button>
          </div>
        )}
      </div>

      {error && <p role='alert' className='mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{error}</p>}
      {showForm && <div className='mt-5'><CandidateForm eventId={eventId} onCreated={handleCreated} onCancel={closeForm} /></div>}

      <div className='mt-5 overflow-x-auto rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        {candidates.length === 0 ? (
          <div className='flex flex-col items-center gap-3 px-6 py-12 text-center'>
            <p className='font-semibold text-[#334155]'>Aún no hay candidatos</p>
            <p className='max-w-sm text-sm text-[#64748B]'>Agrega al primero para poder enviar las {what}.</p>
            {!state.published && !showForm && <Button type='button' variant='outline' className='mt-1 h-10 px-4' onClick={openForm}>+ Agregar candidato</Button>}
          </div>
        ) : (
          <CandidateList candidates={candidates} onsite={state.onsite} citationAction={refreshButton} />
        )}
      </div>
    </section>
  );
}
