import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CompanySidebar } from '../components/company/CompanySidebar.jsx';
import { CredentialStatus } from '../components/company/CredentialsSection.jsx';
import { Button } from '../components/ui';
import * as eventService from '../services/eventService.js';
import * as onsiteService from '../services/onsiteService.js';
import { formatSession, modulesOf } from '../utils/eventModality.js';

// Several applicators may work at once: keep the roster fresh.
const REFRESH_MS = 20_000;

const formatTime = (value) => (value ? new Intl.DateTimeFormat('es-GT', { timeStyle: 'short' }).format(new Date(value)) : '');
const formatDay = (value) => (value ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' }).format(new Date(value)) : '');
const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

const EVALUATION = {
  PENDING: ['Pendiente', 'bg-[#F1F5F9] text-[#475569]'],
  IN_PROGRESS: ['En curso', 'bg-[#EEF6FF] text-[#315B88]'],
  COMPLETED: ['Completada', 'bg-[#E8F8F5] text-[#087D79]'],
};

const ACCESS_FILTERS = [
  ['all', 'Todos los accesos'], ['none', 'Sin acceso'], ['GENERATED', 'Preparado'], ['ENABLED', 'Habilitado'],
  ['USED', 'Utilizado'], ['REVOKED', 'Revocado'], ['EXPIRED', 'Vencido'],
];
const ATTENDANCE_FILTERS = [['all', 'Toda la asistencia'], ['present', 'Presentes'], ['unmarked', 'Sin marcar']];
const EVALUATION_FILTERS = [['all', 'Todas las evaluaciones'], ['PENDING', 'Pendientes'], ['IN_PROGRESS', 'En curso'], ['COMPLETED', 'Completadas']];

const isPresent = (row) => row.attendance?.status === 'PRESENT';
const canEnable = (row) => isPresent(row) && row.credential?.status === 'GENERATED';

function Stat({ label, value }) {
  return <div className='rounded-2xl border border-[#DDE5EC] bg-white p-4 shadow-sm'><p className='text-xs text-[#7C8AA0]'>{label}</p><p className='mt-1 font-display text-2xl font-bold text-[#10233A]'>{value}</p></div>;
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className='h-10 rounded-xl border border-[#D9E2EA] bg-white px-3 text-sm text-[#10233A]'>
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
  );
}

/**
 * "Aplicación presencial": the applicator's panel on the day of the
 * appointment. Check each candidate's identity, mark them present and
 * enable their access code, one by one or all present at once. Absent
 * candidates are never enabled.
 */
export function OnsiteApplicationPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [moduleId, setModuleId] = useState('A');
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [evaluationFilter, setEvaluationFilter] = useState('all');

  useEffect(() => {
    eventService.getEvent(eventId)
      .then(setEvent)
      .catch((requestError) => setError(errorMessage(requestError, 'No se pudo cargar el evento.')));
  }, [eventId]);

  const load = useCallback(async () => {
    try {
      setRoster(await onsiteService.getRoster(eventId, moduleId));
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo cargar la lista de candidatos.'));
    }
  }, [eventId, moduleId]);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (roster?.rows || []).filter((row) => {
      if (term && !`${row.nombreCompleto} ${row.cedula || ''}`.toLowerCase().includes(term)) return false;
      if (attendanceFilter === 'present' && !isPresent(row)) return false;
      if (attendanceFilter === 'unmarked' && isPresent(row)) return false;
      if (accessFilter === 'none' && row.credential) return false;
      if (!['all', 'none'].includes(accessFilter) && row.credential?.status !== accessFilter) return false;
      if (evaluationFilter !== 'all' && row.evaluation !== evaluationFilter) return false;
      return true;
    });
  }, [roster, search, attendanceFilter, accessFilter, evaluationFilter]);

  const ready = (roster?.rows || []).filter(canEnable);

  const run = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo completar la operación.'));
    } finally {
      setBusy(false);
      load();
    }
  };

  const markPresent = (row) => run(async () => {
    if (!window.confirm(`¿Verificaste la identidad de ${row.nombreCompleto} con su documento (cédula ${row.cedula})?`)) return;
    await onsiteService.setAttendance(eventId, moduleId, row.candidateId, true);
    setNotice(`${row.nombreCompleto} quedó marcado como presente.`);
  });

  const unmark = (row) => run(async () => {
    if (!window.confirm(`¿Quitar la asistencia de ${row.nombreCompleto}?`)) return;
    await onsiteService.setAttendance(eventId, moduleId, row.candidateId, false);
  });

  const reportEnable = (result) => {
    const skipped = result.skipped.map((item) => `${item.nombreCompleto}: ${item.reason}`).join(' · ');
    if (result.enabled.length) setNotice(`Se habilitó el acceso de ${result.enabled.length} candidato(s).${skipped ? ` No se habilitó a: ${skipped}.` : ''}`);
    else setError(`No se habilitó ningún acceso. ${skipped}`);
  };

  const enableOne = (row) => run(async () => {
    reportEnable(await onsiteService.enableCredentials(eventId, moduleId, [row.candidateId]));
  });

  const enablePresent = () => run(async () => {
    const names = ready.map((row) => row.nombreCompleto);
    const preview = names.slice(0, 10).join(', ') + (names.length > 10 ? ` y ${names.length - 10} más` : '');
    if (!window.confirm(`Se habilitará el acceso de ${names.length} candidato(s) marcados como presentes: ${preview}. Los candidatos sin asistencia no se habilitan. ¿Deseas continuar?`)) return;
    reportEnable(await onsiteService.enableCredentials(eventId, moduleId, ready.map((row) => row.candidateId)));
  });

  const modules = modulesOf(event);
  const counts = roster?.counts;
  const blockedDay = roster && roster.isAppointmentDay === false;

  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar activeSection='events' onSelect={() => navigate('/company-dashboard')} />
      <main className='min-w-0 flex-1 p-5 sm:p-8'>
        <div className='mx-auto max-w-6xl'>
          <button type='button' onClick={() => navigate(`/company/events/${eventId}`)} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver al evento</button>

          <header className='mt-5 flex flex-col justify-between gap-4 border-b border-[#DCE3EA] pb-6 sm:flex-row sm:items-end'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.14em] text-[#9A651E]'>Aplicación presencial</p>
              <h1 className='mt-2 font-display text-2xl font-bold text-[#101828]'>{event?.name || 'Evento'}</h1>
              {event?.onsite && moduleId === 'A' && <p className='mt-1 text-sm text-[#64748B]'>{event.onsite.venue} · {event.onsite.room} · {formatSession(event.onsite)}</p>}
            </div>
            {modules.length > 1 && (
              <div className='inline-flex rounded-xl border border-[#DDE5EC] bg-white p-1' role='tablist' aria-label='Módulo'>
                {modules.map((module) => (
                  <button key={module} type='button' role='tab' aria-selected={moduleId === module} onClick={() => setModuleId(module)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${moduleId === module ? 'bg-[#0AADA8] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}>
                    Módulo {module}
                  </button>
                ))}
              </div>
            )}
          </header>

          {blockedDay && (
            <p className='mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
              Hoy no es el día de la cita. La asistencia y la habilitación de accesos solo se registran el {formatDay(event?.onsite?.startsAt)}.
            </p>
          )}

          {counts && (
            <div className='mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5'>
              <Stat label='Citados' value={counts.cited} />
              <Stat label='Presentes' value={counts.present} />
              <Stat label='Habilitados' value={counts.enabled} />
              <Stat label='En evaluación' value={counts.inProgress} />
              <Stat label='Completadas' value={counts.completed} />
            </div>
          )}

          <div className='mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex flex-wrap gap-2'>
              <input type='search' value={search} onChange={(changeEvent) => setSearch(changeEvent.target.value)} placeholder='Buscar por nombre o cédula…' aria-label='Buscar candidato' className='h-10 w-full rounded-xl border border-[#D9E2EA] bg-white px-3.5 text-sm sm:w-64' />
              <FilterSelect label='Filtrar por asistencia' value={attendanceFilter} options={ATTENDANCE_FILTERS} onChange={setAttendanceFilter} />
              <FilterSelect label='Filtrar por acceso' value={accessFilter} options={ACCESS_FILTERS} onChange={setAccessFilter} />
              <FilterSelect label='Filtrar por evaluación' value={evaluationFilter} options={EVALUATION_FILTERS} onChange={setEvaluationFilter} />
            </div>
            <Button type='button' variant='accent' className='h-11 shrink-0 px-5' onClick={enablePresent} disabled={busy || ready.length === 0}>
              Habilitar presentes ({ready.length})
            </Button>
          </div>

          {error && <p role='alert' className='mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}
          {notice && <p role='status' className='mt-5 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] px-4 py-3 text-sm text-[#087D79]'>{notice}</p>}

          <section className='mt-6 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
            {!roster ? (
              <div className='flex min-h-52 items-center justify-center text-sm text-[#64748B]'>{error ? '' : 'Cargando candidatos...'}</div>
            ) : rows.length === 0 ? (
              <div className='m-5 rounded-xl border border-dashed border-[#CBD5E1] p-8 text-center text-sm text-[#94A3B8]'>
                {roster.rows.length === 0 ? 'Aún no hay candidatos citados a este módulo.' : 'Ningún candidato coincide con los filtros.'}
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[860px] text-left text-sm'>
                  <thead className='border-b border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
                    <tr><th className='px-5 py-3'>Candidato</th><th className='px-5 py-3'>Cita</th><th className='px-5 py-3'>Asistencia</th><th className='px-5 py-3'>Acceso</th><th className='px-5 py-3'>Evaluación</th><th className='px-5 py-3 text-right'>Acción</th></tr>
                  </thead>
                  <tbody className='divide-y divide-[#E8EDF2]'>
                    {rows.map((row) => {
                      const [evaluationLabel, evaluationTone] = EVALUATION[row.evaluation] || EVALUATION.PENDING;
                      const locked = ['ENABLED', 'USED'].includes(row.credential?.status);
                      return (
                        <tr key={row.candidateId}>
                          <td className='px-5 py-3'><p className='font-semibold text-[#101828]'>{row.nombreCompleto}</p><p className='text-xs text-[#64748B]'>Cédula {row.cedula}</p></td>
                          <td className='px-5 py-3 text-xs text-[#475569]'>{formatTime(row.appointmentAt)}</td>
                          <td className='px-5 py-3'>
                            {isPresent(row) ? (
                              <span className='flex items-center gap-2'>
                                <span className='inline-flex rounded-md bg-[#E8F8F5] px-2.5 py-1 text-xs font-medium text-[#087D79]'>Presente · {formatTime(row.attendance.markedAt)}</span>
                                {!locked && <button type='button' onClick={() => unmark(row)} disabled={busy || blockedDay} className='text-xs font-semibold text-[#64748B] hover:underline disabled:opacity-50'>Quitar</button>}
                              </span>
                            ) : (
                              <button type='button' onClick={() => markPresent(row)} disabled={busy || blockedDay || row.evaluation === 'COMPLETED'} className='rounded-lg border border-[#D9E2EA] px-3 py-1.5 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4] hover:text-[#087D79] disabled:opacity-50'>Marcar presente</button>
                            )}
                          </td>
                          <td className='px-5 py-3'><CredentialStatus credential={row.credential} /></td>
                          <td className='px-5 py-3'><span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${evaluationTone}`}>{evaluationLabel}</span></td>
                          <td className='px-5 py-3 text-right'>
                            {canEnable(row) && <button type='button' onClick={() => enableOne(row)} disabled={busy || blockedDay} className='rounded-lg bg-[#0AADA8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#089490] disabled:opacity-50'>Habilitar</button>}
                            {isPresent(row) && !row.credential && <span className='text-xs text-amber-700'>Sin acceso preparado</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className='mt-4 text-xs text-[#94A3B8]'>Se actualiza automáticamente cada 20 segundos. Cada marca de asistencia y cada habilitación quedan registradas con el usuario que la realizó.</p>
        </div>
      </main>
    </div>
  );
}
