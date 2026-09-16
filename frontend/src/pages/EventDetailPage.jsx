import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CompanySidebar } from '../components/company/CompanySidebar.jsx';
import { CandidateForm } from '../components/company/CandidateForm.jsx';
import { CandidateList } from '../components/company/CandidateList.jsx';
import { Button } from '../components/ui';
import * as eventService from '../services/eventService.js';

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

  const pendingCount = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'INVITED_PENDING').length,
    [candidates]
  );
  const completedCount = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'EVALUATION_COMPLETED').length,
    [candidates]
  );
  const published = event?.status === 'PUBLISHED' || Boolean(event?.evaluationsPublishedAt);

  const handleCreated = (candidate) => {
    setCandidates((current) => [...current, candidate]);
    setShowForm(false);
    setSuccess('Candidato registrado correctamente.');
  };

  const publishInvitations = async () => {
    if (!window.confirm(`Se enviarán ${pendingCount} invitación(es) pendientes. ¿Deseas continuar?`)) return;
    setPublishing(true);
    setActionError('');
    setSuccess('');
    try {
      const result = await eventService.publishEventInvitations(eventId);
      await load();
      if (result.failed) {
        setActionError(`Se enviaron ${result.sent} de ${result.total} invitaciones. ${result.failed} requieren revisión.`);
      } else {
        setSuccess(`Se enviaron ${result.sent} invitaciones correctamente.`);
      }
    } catch (requestError) {
      setActionError(requestError.response?.data?.error?.message || 'No se pudieron publicar las invitaciones.');
    } finally {
      setPublishing(false);
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
                    <span className='rounded-md bg-[#E8F8F5] px-2 py-1 text-xs font-medium text-[#087D79]'>{published ? 'Publicado' : 'Activo'}</span>
                  </div>
                  <p className='mt-2 text-sm text-[#64748B]'>{eventDescription(event)} · Plan A</p>
                  <p className='mt-2 inline-flex rounded-lg bg-[#EEF6FF] px-3 py-2 text-xs font-medium text-[#315B88]'>Evaluación habilitada para todos desde: {formatAvailability(event)}</p>
                </div>
                {!published && <div className='flex flex-wrap gap-3'>
                  <Button type='button' variant='outline' className='h-11 px-5' onClick={publishInvitations} disabled={publishing || pendingCount === 0}>
                    {publishing ? 'Publicando...' : `Publicar invitaciones (${pendingCount})`}
                  </Button>
                  <Button type='button' variant='accent' className='h-11 px-5' onClick={() => { setShowForm(true); setSuccess(''); }}>+ Agregar candidato</Button>
                </div>}
              </header>

              <div className='flex gap-7 border-b border-[#DCE3EA] py-4 text-sm text-[#64748B]'>
                <p><strong className='mr-1 text-[#101828]'>{candidates.length}</strong> candidatos</p>
                <p><strong className='mr-1 text-[#101828]'>{pendingCount}</strong> pendientes</p>
                <p><strong className='mr-1 text-[#101828]'>{completedCount}</strong> completadas</p>
              </div>

              {success && <p className='mt-5 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] px-4 py-3 text-sm text-[#087D79]'>{success}</p>}
              {actionError && <p className='mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>{actionError}</p>}
              {showForm && <div className='mt-6'><CandidateForm eventId={eventId} onCreated={handleCreated} onCancel={() => setShowForm(false)} /></div>}

              <section className='mt-6 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
                <div className='flex items-center justify-between px-5 py-5'>
                  <div><h2 className='font-display text-base font-bold text-[#101828]'>Candidatos ({candidates.length})</h2><p className='mt-1 text-xs text-[#64748B]'>Registros asociados exclusivamente a este evento.</p></div>
                  <span className='text-xs text-[#94A3B8]'>Estados sincronizados desde la base de datos</span>
                </div>
                <CandidateList candidates={candidates} loading={false} />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
