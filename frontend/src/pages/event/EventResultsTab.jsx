import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';

import { EvaluationStatus } from '../../components/company/CandidateList.jsx';
import {
  EMPTY_SESSION,
  SessionFields,
  sessionProblem,
  toCitationPayload,
} from '../../components/company/SessionFields.jsx';
import {
  AccessWindowFields, EMPTY_WINDOW, toWindowPayload, windowProblem,
} from '../../components/company/AccessWindowFields.jsx';
import { Button, Dialog, StatusBadge } from '../../components/ui';
import * as eventService from '../../services/eventService.js';
import * as settingsService from '../../services/settingsService.js';
import { citationState, formatSession } from '../../utils/eventModality.js';
import { isOpenIn, phaseState } from '../../utils/phases.js';
import { canReceiveModuleB, canReceiveModuleC, failureReasons } from './eventState.js';

const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

const DATE_TIME = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
const asDate = (value) => new Date(value?._seconds != null ? value._seconds * 1000 : value);
/** "Abre 12 nov 2026, 8:00 · cierra 14 nov 2026, 18:00" */
const formatWindow = ({ opensAt, closesAt }) => `Abre ${DATE_TIME.format(asDate(opensAt))} · cierra ${DATE_TIME.format(asDate(closesAt))}`;

function StageStatus({ stage }) {
  if (stage?.status === 'COMPLETED') return <StatusBadge tone='ok'>Respondido</StatusBadge>;
  if (stage?.status === 'WITHDRAWN') return <StatusBadge tone='muted'>Retirado</StatusBadge>;
  if (stage?.status === 'CITED') {
    const { label, tone, detail } = citationState(stage.citation);
    return (
      <span className='flex flex-col items-start gap-1'>
        <StatusBadge tone={tone === 'error' ? 'error' : 'info'} title={detail}>Citado · {label.toLowerCase()}</StatusBadge>
        {stage.citation?.appointment && <span className='text-[11px] text-[#64748B]'>{formatSession(stage.citation.appointment)}</span>}
      </span>
    );
  }
  if (stage?.status === 'INVITATION_SENT') {
    return (
      <span className='flex flex-col items-start gap-1'>
        <StatusBadge tone='info'>Enviado</StatusBadge>
        {stage.accessWindow && <span className='text-[11px] text-[#64748B]'>{formatWindow(stage.accessWindow)}</span>}
      </span>
    );
  }
  if (stage?.status === 'INVITATION_FAILED') return <StatusBadge tone='error'>Error de envío</StatusBadge>;
  return <span className='text-xs text-[#94A3B8]'>No enviado</span>;
}

/** Closes a phase with whoever answered, so absent candidates do not hold it back. */
function PhaseCloser({ module, stats, delivered, busy, onClose }) {
  if (delivered || !stats.open) return null;
  return (
    <div className='flex flex-col gap-3 rounded-xl border border-[#E5EAF0] bg-[#FAFBFC] p-4 sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-sm text-[#475569]'>Fase {module}: <strong>{stats.completed}</strong> respondieron y <strong>{stats.open}</strong> siguen pendientes. Si no se presentarán, puedes cerrar la fase con quienes respondieron.</p>
      <button type='button' disabled={busy || !stats.completed} onClick={() => onClose(module)} className='shrink-0 rounded-lg border border-[#D9E2EA] bg-white px-3.5 py-2 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4] disabled:opacity-50'>Cerrar Fase {module}</button>
    </div>
  );
}

/** Resultados: PDF deliveries, who continues to each next phase, and Module C's skills. */
export function EventResultsTab() {
  const {
    eventId, event, candidates, reload, notify, state, hasModuleB, hasModuleC,
    currentPlan, subscriptionLoading, subscriptionError,
  } = useOutletContext();

  const results = event?.moduleResults || {};
  const reportAReady = !event?.requiresPhaseReports || Boolean(results.A?.deliveredAt);
  const reportBReady = Boolean(results.B?.deliveredAt);
  const canAccessModuleB = state.hasModuleB && hasModuleB;
  const moduleBAvailable = canAccessModuleB && !subscriptionLoading && reportAReady;
  const eventHasC = Boolean(event?.modules?.includes('C'));
  const moduleCAvailable = eventHasC && hasModuleC && !subscriptionLoading;

  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [citing, setCiting] = useState(false);
  const [session, setSession] = useState(() => ({ ...EMPTY_SESSION, sede: event?.onsite?.venue || '', ubicacion: event?.onsite?.room || '' }));
  const [sessionError, setSessionError] = useState('');
  // Virtual phases: when each one's link opens and closes, chosen per phase.
  const [windowB, setWindowB] = useState(EMPTY_WINDOW);
  const [windowC, setWindowC] = useState(EMPTY_WINDOW);
  const [sectionIds, setSectionIds] = useState([]);
  const [selectedC, setSelectedC] = useState(() => new Set());
  const [sendingC, setSendingC] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [busyPhase, setBusyPhase] = useState(false);

  const microcase = event?.moduleC?.microcase;
  const locked = Boolean(event?.moduleC?.lockedAt);
  // `|` is safe: section ids are generated UUIDs.
  const lockedKey = (event?.moduleC?.sectionIds || []).join('|');

  // The administrator's default entry window for new onsite sessions.
  useEffect(() => {
    settingsService.getPublicSettings()
      .then((settings) => {
        const minutes = settings?.evaluation?.defaultEntryWindowMinutes;
        if (minutes) setSession((current) => ({ ...current, ventana: String(minutes) }));
      })
      .catch(() => {});
  }, []);

  // Once invitations went out, the skills are the ones frozen in the process.
  useEffect(() => { if (locked) setSectionIds(lockedKey.split('|')); }, [locked, lockedKey]);

  // Processes created before the draw moved to creation get their case here.
  useEffect(() => {
    if (!state.published || !moduleCAvailable || microcase) return;
    eventService.assignModuleC(eventId).then(reload).catch((requestError) => setError(errorMessage(requestError, 'No se pudo asignar el microcaso.')));
  }, [state.published, moduleCAvailable, microcase, eventId, reload]);

  if (!state.published) {
    return (
      <section aria-labelledby='results-title' className='rounded-2xl border border-[#DDE5EC] bg-white px-6 py-12 text-center shadow-sm'>
        <h2 id='results-title' className='font-display text-lg font-bold text-[#101828]'>Aún no hay resultados entregados</h2>
        <p className='mx-auto mt-2 max-w-md text-sm text-[#64748B]'>El informe de la Fase A aparecerá aquí cuando el equipo de NexoPerfil lo entregue. Evaluaciones completadas: {state.completed} de {state.active}.</p>
      </section>
    );
  }

  const eligible = candidates.filter(canReceiveModuleB);
  const eligibleC = candidates.filter(canReceiveModuleC);
  const delivered = ['A', 'B', 'C'].filter((module) => results[module]?.deliveredAt && results[module]?.status === 'DELIVERED');

  const toggle = (candidateId) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(candidateId)) next.delete(candidateId); else next.add(candidateId);
    return next;
  });

  const sendModuleB = async (citation, ventana) => {
    setSending(true);
    setError('');
    try {
      const result = await eventService.sendModuleBInvitations(eventId, [...selected], citation, ventana);
      await reload();
      setSelected(new Set());
      setCiting(false);
      const what = state.onsite ? 'la citación al Módulo B' : 'el Módulo B';
      if (result.failed) setError(`Se envió ${what} a ${result.sent} de ${result.total} candidatos. ${result.failed} no se pudieron enviar.${failureReasons(result)}`);
      else notify(`Se envió ${what} a ${result.sent} candidato(s).`);
    } catch (requestError) {
      const message = errorMessage(requestError, 'No se pudo enviar el Módulo B.');
      if (citing) setSessionError(message); else setError(message);
    } finally {
      setSending(false);
    }
  };

  const resent = candidates.filter((candidate) => selected.has(candidate.id) && ['INVITATION_SENT', 'CITED'].includes(candidate.moduleB?.status)).length;

  // Both modalities ask for the details first: the venue and time, or when the link opens and closes.
  const startSending = () => {
    if (!moduleBAvailable || selected.size === 0) return;
    setSessionError('');
    setCiting(true);
  };

  const toggleC = (id) => setSelectedC((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const sendModuleC = async () => {
    if (!sectionIds.length || !selectedC.size) { setError('Selecciona al menos una habilidad y participantes.'); return; }
    if (state.onsite && sessionProblem(session)) { setError(sessionProblem(session)); return; }
    if (!state.onsite && windowProblem(windowC)) { setError(windowProblem(windowC)); return; }
    if (!window.confirm(`${state.onsite ? 'Se enviará la citación presencial' : 'Se enviará el enlace'} de Fase C a ${selectedC.size} participante(s). Las habilidades quedarán fijas para todo el proceso. ¿Deseas continuar?`)) return;
    setSendingC(true);
    setError('');
    try {
      await eventService.configureModuleC(eventId, sectionIds);
      const result = state.onsite
        ? await eventService.sendModuleCInvitations(eventId, [...selectedC], toCitationPayload(session))
        : await eventService.sendModuleCInvitations(eventId, [...selectedC], null, toWindowPayload(windowC));
      await reload();
      setSelectedC(new Set());
      if (result.failed) setError(`Se envió la Fase C a ${result.sent} de ${result.total} participantes.${failureReasons(result)}`);
      else notify(`Fase C enviada a ${result.sent} participante(s).`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo configurar o enviar la Fase C.'));
    } finally {
      setSendingC(false);
    }
  };

  const confirmCitation = () => {
    const problem = state.onsite ? sessionProblem(session) : windowProblem(windowB);
    if (problem) { setSessionError(problem); return; }
    if (state.onsite) sendModuleB(toCitationPayload(session));
    else sendModuleB(undefined, toWindowPayload(windowB));
  };

  const download = async (module) => {
    setDownloading(module);
    setError('');
    try {
      const result = await eventService.getResultDownloadUrl(eventId, module);
      window.location.assign(result.url);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo descargar el resultado.'));
    } finally {
      setDownloading('');
    }
  };

  const closePhase = async (module) => {
    if (!window.confirm(`Se cerrará la Fase ${module} con quienes ya respondieron. Los candidatos pendientes quedarán retirados de esta fase y sus accesos dejarán de funcionar. ¿Deseas continuar?`)) return;
    setBusyPhase(true);
    setError('');
    try {
      await eventService.closePhase(eventId, module);
      await reload();
      notify(`La Fase ${module} quedó cerrada.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo cerrar la fase.'));
    } finally {
      setBusyPhase(false);
    }
  };

  const withdraw = async (candidate, module) => {
    if (!window.confirm(`${candidate.nombreCompleto} quedará retirado de la Fase ${module} y su acceso dejará de funcionar. ¿Deseas continuar?`)) return;
    setBusyPhase(true);
    setError('');
    try {
      await eventService.withdrawCandidate(eventId, candidate.id, module);
      await reload();
      notify(`${candidate.nombreCompleto} quedó retirado de la Fase ${module}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo retirar al candidato.'));
    } finally {
      setBusyPhase(false);
    }
  };

  const withdrawButton = (candidate, module) => (!results[module]?.deliveredAt && isOpenIn(candidate, module)
    ? <button type='button' disabled={busyPhase} onClick={() => withdraw(candidate, module)} className='mt-1 block text-[11px] font-semibold text-[#64748B] hover:underline disabled:opacity-50'>Retirar</button>
    : null);

  return (
    <section aria-labelledby='results-title' className='space-y-5'>
      {delivered.length > 0 && (
        <section className='rounded-2xl border border-emerald-200 bg-emerald-50 p-5'>
          <h3 className='font-semibold text-emerald-900'>Resultados recibidos</h3>
          <div className='mt-3 flex flex-wrap gap-3'>
            {delivered.map((module) => <button key={module} type='button' disabled={Boolean(downloading)} onClick={() => download(module)} className='rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50'>{downloading === module ? 'Preparando…' : `Descargar resultado · Fase ${module} ↗`}</button>)}
          </div>
        </section>
      )}

      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 id='results-title' className='font-display text-lg font-bold text-[#101828]'>Resultados</h2>
          <p className='mt-1 text-sm text-[#64748B]'>{state.hasModuleB ? 'Revisa los informes y selecciona a quienes continúan a la siguiente fase.' : 'Informe de la Fase A.'}</p>
        </div>
        {moduleBAvailable && (
          <div className='flex flex-wrap items-center gap-3 sm:shrink-0 sm:flex-nowrap'>
            <button type='button' onClick={() => setSelected(new Set(eligible.map((candidate) => candidate.id)))} disabled={eligible.length === 0} className='rounded px-1 text-sm font-semibold text-[#0A8F8A] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:text-[#94A3B8] disabled:no-underline'>Seleccionar disponibles ({eligible.length})</button>
            <Button type='button' variant='accent' className='h-11 px-5' onClick={startSending} disabled={sending || selected.size === 0}>{state.onsite ? `Citar al Módulo B (${selected.size})` : `Enviar Módulo B (${selected.size})`}</Button>
          </div>
        )}
      </div>

      {state.hasModuleB && !subscriptionLoading && !hasModuleB && (
        <section className='rounded-2xl border border-amber-200 bg-amber-50 p-5'>
          <span className='rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-amber-800'>Módulo bloqueado por suscripción</span>
          <h3 className='mt-3 font-display text-lg font-bold text-[#101828]'>Módulo B · Macrocaso</h3>
          <p className='mt-2 text-sm leading-6 text-amber-900'>{subscriptionError || !currentPlan ? 'No fue posible verificar tu suscripción. Para habilitar el Módulo B, verifica tu plan actual.' : `Tu plan actual (${currentPlan.name}) no incluye el Módulo B. Puedes actualizar tu suscripción para habilitar esta etapa.`}</p>
          <Link to='/planes?mode=manage' className='mt-4 inline-flex h-11 items-center rounded-lg bg-[#087D79] px-5 text-sm font-semibold text-white hover:bg-[#066763]'>Ver planes disponibles</Link>
        </section>
      )}

      {state.hasModuleB && subscriptionLoading && <div role='status' className='rounded-xl border border-[#DDE5EC] bg-white px-4 py-3 text-sm text-[#64748B]'>Verificando tu suscripción...</div>}

      {canAccessModuleB && !subscriptionLoading && !reportAReady && <p className='rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'>El Módulo B se habilitará cuando administración entregue el PDF de resultados de la Fase A.</p>}

      {moduleBAvailable && (
        <p className='text-xs text-[#64748B]'>
          {event?.moduleB?.macrocase && <>Macrocaso de este proceso: <strong className='text-[#334E68]'>{event.moduleB.macrocase.name}</strong> · todos los candidatos reciben el mismo caso. </>}
          {state.onsite ? 'La citación indica la sede y el horario, sin enlaces ni códigos.' : 'Cada candidato recibe un enlace personal.'}
        </p>
      )}

      {error && <p role='alert' className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{error}</p>}

      <div className='overflow-x-auto rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        <table className='w-full text-left'>
          <thead className='border-b border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
            <tr>
              {moduleBAvailable && <th scope='col' className='w-12 px-5 py-3'><span className='sr-only'>Seleccionar</span></th>}
              <th scope='col' className='px-5 py-3'>Candidato</th>
              <th scope='col' className='px-5 py-3'>Módulo A</th>
              {state.hasModuleB && <th scope='col' className='px-5 py-3'>Módulo B</th>}
              {eventHasC && <th scope='col' className='px-5 py-3'>Módulo C</th>}
            </tr>
          </thead>
          <tbody className='divide-y divide-[#E8EDF2]'>
            {candidates.map((candidate) => (
              <tr key={candidate.id} className={selected.has(candidate.id) ? 'bg-[#F4FBFB]' : 'bg-white'}>
                {moduleBAvailable && <td className='px-5 py-4'>{canReceiveModuleB(candidate) && <input type='checkbox' checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} aria-label={`Seleccionar a ${candidate.nombreCompleto} para el Módulo B`} className='h-4 w-4 cursor-pointer accent-[#0AADA8]' />}</td>}
                <td className='px-5 py-4 text-sm font-semibold text-[#101828]'>{candidate.nombreCompleto}</td>
                <td className='px-5 py-4'><EvaluationStatus status={candidate.status} profileAvailable={candidate.profileAvailable} onsite={state.onsite} /></td>
                {state.hasModuleB && <td className='px-5 py-4'><StageStatus stage={candidate.moduleB} />{withdrawButton(candidate, 'B')}</td>}
                {eventHasC && <td className='px-5 py-4'><StageStatus stage={candidate.moduleC} />{withdrawButton(candidate, 'C')}</td>}
              </tr>
            ))}
            {candidates.length === 0 && <tr><td colSpan={5} className='px-5 py-10 text-center text-sm text-[#64748B]'>No hay candidatos para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>

      {state.hasModuleB && <PhaseCloser module='B' stats={phaseState('B', candidates)} delivered={Boolean(results.B?.deliveredAt)} busy={busyPhase} onClose={closePhase} />}
      {eventHasC && <PhaseCloser module='C' stats={phaseState('C', candidates)} delivered={Boolean(results.C?.deliveredAt)} busy={busyPhase} onClose={closePhase} />}

      {eventHasC && (
        <section className='mt-8 rounded-2xl border border-[#DDE5EC] bg-white p-5 sm:p-6'>
          <h3 className='font-display text-lg font-bold text-[#10233A]'>Fase C · Microcaso</h3>
          <p className='mt-1 text-sm text-[#64748B]'>Elige las habilidades en las que quieres profundizar y los participantes que completaron la Fase B. Todos responden el mismo caso y las mismas preguntas.</p>
          {!moduleCAvailable && !subscriptionLoading && <p className='mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800'>Tu suscripción actual no incluye el Módulo C. Se requiere el Plan completo.</p>}
          {subscriptionLoading && <p className='mt-4 text-sm text-slate-500'>Verificando suscripción…</p>}
          {!reportBReady && <p className='mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800'>La Fase C se habilitará cuando administración entregue el PDF de resultados de la Fase B.</p>}
          {microcase && <p className='mt-4 text-sm text-[#334E68]'>Microcaso de este proceso: <strong>{microcase.name}</strong></p>}
          <div className='mt-4 text-sm text-[#334E68]'>
            <p className='font-medium'>Habilidades a evaluar</p>
            {(microcase?.sections || []).map((section) => (
              <label key={section.id} className='mt-2 flex items-center gap-2'>
                <input type='checkbox' disabled={locked || !reportBReady} checked={sectionIds.includes(section.id)} onChange={(changeEvent) => setSectionIds((old) => (changeEvent.target.checked ? [...old, section.id] : old.filter((id) => id !== section.id)))} />
                {section.title}
              </label>
            ))}
            {locked && <p className='mt-2 text-xs text-[#64748B]'>Las habilidades quedaron fijas al enviar las primeras invitaciones.</p>}
          </div>
          <div className='mt-5'>
            <p className='text-sm font-semibold text-[#334E68]'>Participantes elegibles ({eligibleC.length})</p>
            <div className='mt-2 grid gap-2 sm:grid-cols-2'>
              {eligibleC.map((candidate) => <label key={candidate.id} className='flex items-center gap-2 rounded-lg border border-[#E5EAF0] p-2 text-sm'><input type='checkbox' checked={selectedC.has(candidate.id)} onChange={() => toggleC(candidate.id)} />{candidate.nombreCompleto}</label>)}
              {eligibleC.length === 0 && <p className='text-sm text-slate-500'>No hay participantes disponibles para esta fase.</p>}
            </div>
          </div>
          {state.onsite
            ? <div className='mt-5'><p className='mb-2 text-sm font-semibold text-[#334E68]'>Sesión presencial de la Fase C</p><SessionFields value={session} onChange={setSession} idPrefix='modulo-c' /></div>
            : <div className='mt-5'><p className='mb-2 text-sm font-semibold text-[#334E68]'>Disponibilidad del enlace de la Fase C</p><AccessWindowFields value={windowC} onChange={setWindowC} idPrefix='modulo-c' /></div>}
          <div className='mt-5 flex justify-end'>
            <Button type='button' variant='accent' disabled={sendingC || !eligibleC.length || !moduleCAvailable || !reportBReady} onClick={sendModuleC}>{sendingC ? 'Procesando…' : state.onsite ? `Citar a Fase C (${selectedC.size})` : `Enviar Fase C (${selectedC.size})`}</Button>
          </div>
        </section>
      )}

      {citing && (
        <Dialog
          title={state.onsite ? `Citar al Módulo B (${selected.size})` : `Enviar Módulo B (${selected.size})`}
          description={state.onsite
            ? `Indica la sesión presencial.${resent ? ` ${resent} candidato(s) ya habían sido citados y recibirán la nueva citación.` : ''} La citación no incluye enlaces ni códigos.`
            : `Indica cuándo se abre y se cierra el enlace.${resent ? ` ${resent} candidato(s) ya lo habían recibido: tendrán un enlace nuevo y el anterior dejará de funcionar.` : ''}`}
          busy={sending}
          onClose={() => setCiting(false)}
          footer={<><Button type='button' variant='outline' className='h-10 px-4' onClick={() => setCiting(false)} disabled={sending}>Cancelar</Button><Button type='button' variant='accent' className='h-10 px-5' onClick={confirmCitation} disabled={sending}>{sending ? 'Enviando...' : state.onsite ? 'Enviar citaciones' : 'Enviar enlaces'}</Button></>}
        >
          {state.onsite
            ? <SessionFields value={session} onChange={setSession} idPrefix='modulo-b' />
            : <AccessWindowFields value={windowB} onChange={setWindowB} idPrefix='modulo-b' />}
          {sessionError && <p role='alert' className='mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{sessionError}</p>}
        </Dialog>
      )}
    </section>
  );
}
