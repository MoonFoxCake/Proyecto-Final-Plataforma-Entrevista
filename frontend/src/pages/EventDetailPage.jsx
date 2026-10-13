import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CompanySidebar } from '../components/company/CompanySidebar.jsx';
import { CandidateForm } from '../components/company/CandidateForm.jsx';
import { CandidateList, canReceiveModuleB } from '../components/company/CandidateList.jsx';
import { EMPTY_SESSION, SessionFields, sessionProblem, toCitationPayload } from '../components/company/SessionFields.jsx';
import { Button } from '../components/ui';
import * as eventService from '../services/eventService.js';
import { formatSession, isOnsite, modulesOf } from '../utils/eventModality.js';

function eventName(event) {
  return event?.name || event?.title || event?.eventName || event?.positionName || 'Detalle del evento';
}

function eventDescription(event) {
  return event?.position || event?.positionName || event?.module || 'Proceso de evaluación';
}

function formatAvailability(event) {
  const value = event?.availableFrom || event?.fechaHoraCita || event?.eventDate || event?.date;
  if (!value) return 'Sin fecha configurada';
  const raw = value._seconds ? value._seconds * 1000 : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

/** Distinct reasons the backend gave for the e-mails that could not be sent. */
function failureReasons(result) {
  const reasons = [...new Set((result?.failures || []).map((failure) => failure.message).filter(Boolean))];
  return reasons.length ? ` Motivo: ${reasons.join(' · ')}` : '';
}

function ModalityBadge({ onsite }) {
  return onsite
    ? <span className='rounded-md bg-[#FFF7E8] px-2 py-1 text-xs font-semibold text-[#9A651E]'>Presencial</span>
    : <span className='rounded-md bg-[#EEF6FF] px-2 py-1 text-xs font-semibold text-[#315B88]'>Virtual</span>;
}

/** Where and when the onsite evaluation takes place. */
function OnsiteSession({ session }) {
  const item = (label, value) => <div><dt className='text-xs text-[#64748B]'>{label}</dt><dd className='mt-1 text-sm font-medium text-[#101828]'>{value}</dd></div>;
  return (
    <section className='mt-6 rounded-2xl border border-[#F1DFC0] bg-[#FFFBF3] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-display text-base font-bold text-[#101828]'>Aplicación presencial</h2>
        <span className='text-xs text-[#9A651E]'>Los candidatos reciben una citación sin enlaces ni códigos de acceso.</span>
      </div>
      <dl className='mt-4 grid gap-4 sm:grid-cols-3'>
        {item('Sede', session?.venue || '—')}
        {item('Ubicación', session?.room || '—')}
        {item('Fecha y horario', formatSession(session))}
      </dl>
      {session?.instructions && <div className='mt-4'><p className='text-xs text-[#64748B]'>Indicaciones</p><p className='mt-1 whitespace-pre-line text-sm text-[#334E68]'>{session.instructions}</p></div>}
    </section>
  );
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedForModuleB, setSelectedForModuleB] = useState(() => new Set());
  const [sendingModuleB, setSendingModuleB] = useState(false);
  const [moduleBSession, setModuleBSession] = useState(EMPTY_SESSION);

  const load = useCallback(async () => {
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

  useEffect(() => {
    load();
    const refreshOnFocus = () => load();
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [load]);

  const onsite = isOnsite(event);
  const hasModuleB = modulesOf(event).includes('B');

  // The Module B session starts at the same venue as Module A; the company adjusts it.
  useEffect(() => {
    if (!event?.onsite) return;
    setModuleBSession((current) => (current.sede || current.ubicacion
      ? current
      : { ...current, sede: event.onsite.venue || '', ubicacion: event.onsite.room || '' }));
  }, [event]);

  const pendingCount = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'INVITED_PENDING').length,
    [candidates]
  );
  const completedCount = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'EVALUATION_COMPLETED').length,
    [candidates]
  );
  const citedCount = candidates.filter((candidate) => candidate.citation?.status === 'SENT').length;
  const published = event?.status === 'PUBLISHED' || Boolean(event?.evaluationsPublishedAt);
  const moduleBEligible = useMemo(() => candidates.filter(canReceiveModuleB), [candidates]);
  const moduleBCompleted = candidates.filter((candidate) => candidate.moduleB?.status === 'COMPLETED').length;
  const moduleBSent = candidates.filter((candidate) => candidate.moduleB).length;
  const hasCitations = candidates.some((candidate) => candidate.citation?.providerId || candidate.moduleB?.citation?.providerId);

  const toggleModuleB = (candidateId) => {
    setSelectedForModuleB((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const sendModuleB = async () => {
    const ids = [...selectedForModuleB];
    if (onsite) {
      const problem = sessionProblem(moduleBSession);
      if (problem) {
        setActionError(`Citación al Módulo B: ${problem}`);
        return;
      }
    }
    const resend = candidates.filter((candidate) => selectedForModuleB.has(candidate.id) && ['INVITATION_SENT', 'CITED'].includes(candidate.moduleB?.status)).length;
    const message = onsite
      ? `Se citará a ${ids.length} candidato(s) a la sesión presencial del Módulo B.`
        + (resend ? ` ${resend} ya había(n) sido citado(s): recibirán la nueva citación.` : '')
        + ' La citación no incluye enlaces ni códigos de acceso. ¿Deseas continuar?'
      : `Se enviará el Módulo B a ${ids.length} candidato(s).`
        + (resend ? ` ${resend} ya lo había(n) recibido: tendrán un enlace nuevo y el anterior dejará de funcionar.` : '')
        + ' ¿Deseas continuar?';
    if (!window.confirm(message)) return;
    setSendingModuleB(true);
    setActionError('');
    setSuccess('');
    try {
      const result = await eventService.sendModuleBInvitations(eventId, ids, onsite ? toCitationPayload(moduleBSession) : undefined);
      await load();
      setSelectedForModuleB(new Set());
      const what = onsite ? 'la citación al Módulo B' : 'el Módulo B';
      if (result.failed) {
        setActionError(`Se envió ${what} a ${result.sent} de ${result.total} candidatos. ${result.failed} no se pudieron enviar.${failureReasons(result)}`);
      } else {
        setSuccess(`Se envió ${what} a ${result.sent} candidato(s).`);
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error?.message || 'No se pudo enviar el Módulo B.');
    } finally {
      setSendingModuleB(false);
    }
  };

  const handleCreated = (candidate) => {
    setCandidates((current) => [...current, candidate]);
    setShowForm(false);
    setSuccess('Candidato registrado correctamente.');
  };

  const publishInvitations = async () => {
    const message = onsite
      ? `Se enviarán ${pendingCount} citación(es) presenciales con la sede, la fecha y el horario. No incluyen enlaces ni códigos de acceso. ¿Deseas continuar?`
      : `Se enviarán ${pendingCount} invitación(es) pendientes. ¿Deseas continuar?`;
    if (!window.confirm(message)) return;
    setPublishing(true);
    setActionError('');
    setSuccess('');
    try {
      const result = await eventService.publishEventInvitations(eventId);
      await load();
      const what = onsite ? 'citaciones' : 'invitaciones';
      if (result.failed) {
        setActionError(`Se enviaron ${result.sent} de ${result.total} ${what}. ${result.failed} no se pudieron enviar.${failureReasons(result)}`);
      } else {
        setSuccess(`Se enviaron ${result.sent} ${what} correctamente.`);
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error?.message || `No se pudieron enviar las ${onsite ? 'citaciones' : 'invitaciones'}.`);
    } finally {
      setPublishing(false);
    }
  };

  const refreshCitations = async () => {
    setRefreshing(true);
    setActionError('');
    setSuccess('');
    try {
      const result = await eventService.refreshCitationStatus(eventId);
      await load();
      if (result.failed) {
        setActionError(`Se consultó el estado de ${result.checked} citación(es); ${result.failed} no se pudieron consultar. Intenta de nuevo en unos minutos.`);
      } else {
        setSuccess(`Estado de envío actualizado (${result.checked} citación(es) consultadas).`);
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error?.message || 'No se pudo consultar el estado de envío.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar activeSection='events' onSelect={() => navigate('/company-dashboard')} />
      <main className='min-w-0 flex-1 p-5 sm:p-8'>
        <div className='mx-auto max-w-6xl'>
          <button type='button' onClick={() => navigate('/company-dashboard')} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver a Eventos</button>

          {loading ? (
            <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando evento...</div>
          ) : error ? (
            <div className='mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-600'>{error}</div>
          ) : (
            <>
              <header className='mt-5 flex flex-col justify-between gap-4 border-b border-[#DCE3EA] pb-6 sm:flex-row sm:items-start'>
                <div>
                  <div className='flex flex-wrap items-center gap-3'>
                    <h1 className='font-display text-2xl font-bold text-[#101828]'>{eventName(event)}</h1>
                    <ModalityBadge onsite={onsite} />
                    <span className='rounded-md bg-[#E8F8F5] px-2 py-1 text-xs font-medium text-[#087D79]'>{published ? 'Publicado' : 'Activo'}</span>
                  </div>
                  <p className='mt-2 text-sm text-[#64748B]'>{eventDescription(event)} · {hasModuleB ? 'Módulos A y B' : 'Módulo A'}</p>
                  {!onsite && <p className='mt-2 inline-flex rounded-lg bg-[#EEF6FF] px-3 py-2 text-xs font-medium text-[#315B88]'>Evaluación habilitada para todos desde: {formatAvailability(event)}</p>}
                </div>
                <div className='flex flex-wrap gap-3'>
                  {onsite && hasCitations && (
                    <Button type='button' variant='outline' className='h-11 px-5' onClick={refreshCitations} disabled={refreshing}>
                      {refreshing ? 'Consultando...' : 'Actualizar estado de envío'}
                    </Button>
                  )}
                  {!published && <>
                    <Button type='button' variant='outline' className='h-11 px-5' onClick={publishInvitations} disabled={publishing || pendingCount === 0}>
                      {publishing ? 'Enviando...' : onsite ? `Enviar citaciones (${pendingCount})` : `Publicar invitaciones (${pendingCount})`}
                    </Button>
                    <Button type='button' variant='accent' className='h-11 px-5' onClick={() => { setShowForm(true); setSuccess(''); }}>+ Agregar candidato</Button>
                  </>}
                </div>
              </header>

              {onsite && <OnsiteSession session={event.onsite} />}

              <div className='flex flex-wrap gap-x-7 gap-y-2 border-b border-[#DCE3EA] py-4 text-sm text-[#64748B]'>
                <p><strong className='mr-1 text-[#101828]'>{candidates.length}</strong> candidatos</p>
                <p><strong className='mr-1 text-[#101828]'>{pendingCount}</strong> {onsite ? 'sin citar' : 'pendientes'}</p>
                {onsite && <p><strong className='mr-1 text-[#101828]'>{citedCount}</strong> citados</p>}
                <p><strong className='mr-1 text-[#101828]'>{completedCount}</strong> completadas</p>
                {published && hasModuleB && <p><strong className='mr-1 text-[#101828]'>{moduleBCompleted}/{moduleBSent}</strong> Módulo B respondidos</p>}
              </div>

              {published && hasModuleB && (
                <section className='mt-6 rounded-2xl border border-[#CDEBEA] bg-[#F4FBFB] p-5'>
                  <div className='flex flex-col justify-between gap-4 lg:flex-row lg:items-start'>
                    <div className='max-w-2xl'>
                      <span className='inline-flex rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#087D79]'>Segunda etapa</span>
                      <h2 className='mt-3 font-display text-lg font-bold text-[#101828]'>Módulo B · Macrocaso</h2>
                      {onsite
                        ? <p className='mt-1 text-sm leading-6 text-[#56677B]'>Revisa el perfil del Módulo A de cada candidato y marca en la tabla a quienes continuarán. Recibirán una citación a la sesión presencial que indiques abajo, sin enlaces ni códigos de acceso.</p>
                        : <p className='mt-1 text-sm leading-6 text-[#56677B]'>Revisa el perfil del Módulo A de cada candidato y marca en la tabla a quienes continuarán. Recibirán un correo con un enlace personal válido por 3 días; responderán por escrito las preguntas del asistente virtual.</p>}
                      {event?.moduleB?.macrocase
                        ? <p className='mt-2 text-xs text-[#64748B]'>Macrocaso de este proceso: <strong className='text-[#334E68]'>{event.moduleB.macrocase.name}</strong> · todos los candidatos reciben el mismo caso.</p>
                        : <p className='mt-2 text-xs text-[#64748B]'>En el primer envío se asignará al azar uno de los macrocasos activos del banco; todos los candidatos de este evento recibirán ese mismo caso.</p>}
                    </div>
                    <div className='flex shrink-0 flex-wrap gap-3'>
                      <Button type='button' variant='outline' className='h-11 bg-white px-4' onClick={() => setSelectedForModuleB(new Set(moduleBEligible.map((candidate) => candidate.id)))} disabled={moduleBEligible.length === 0}>
                        Seleccionar todos ({moduleBEligible.length})
                      </Button>
                      <Button type='button' variant='accent' className='h-11 px-5' onClick={sendModuleB} disabled={sendingModuleB || selectedForModuleB.size === 0}>
                        {sendingModuleB ? 'Enviando...' : onsite ? `Citar al Módulo B (${selectedForModuleB.size})` : `Enviar Módulo B (${selectedForModuleB.size})`}
                      </Button>
                    </div>
                  </div>
                  {onsite && (
                    <div className='mt-5 rounded-xl border border-[#CDEBEA] bg-white p-5'>
                      <h3 className='mb-4 text-sm font-semibold text-[#101828]'>Sesión presencial del Módulo B</h3>
                      <SessionFields value={moduleBSession} onChange={setModuleBSession} idPrefix='modulo-b' />
                    </div>
                  )}
                </section>
              )}

              {success && <p className='mt-5 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] px-4 py-3 text-sm text-[#087D79]'>{success}</p>}
              {actionError && <p className='mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{actionError}</p>}
              {showForm && <div className='mt-6'><CandidateForm eventId={eventId} onCreated={handleCreated} onCancel={() => setShowForm(false)} /></div>}

              <section className='mt-6 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
                <div className='flex items-center justify-between px-5 py-5'>
                  <div><h2 className='font-display text-base font-bold text-[#101828]'>Candidatos ({candidates.length})</h2><p className='mt-1 text-xs text-[#64748B]'>Registros asociados exclusivamente a este evento.</p></div>
                  <span className='text-xs text-[#94A3B8]'>{onsite ? 'El estado de la citación es independiente del acceso a la evaluación' : 'Estados sincronizados desde la base de datos'}</span>
                </div>
                <CandidateList
                  candidates={candidates}
                  loading={false}
                  onsite={onsite}
                  showModuleB={published && hasModuleB}
                  selection={published && hasModuleB ? { selectedIds: selectedForModuleB, onToggle: toggleModuleB } : null}
                />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
