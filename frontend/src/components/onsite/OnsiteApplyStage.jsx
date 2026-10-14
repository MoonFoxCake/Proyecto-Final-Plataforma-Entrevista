import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, StatusBadge } from '../ui';
import { IssuedCodesDialog } from '../company/IssuedCodesDialog.jsx';
import * as onsiteService from '../../services/onsiteService.js';
import * as credentialService from '../../services/credentialService.js';
import { CredentialStatus } from './CredentialStatus.jsx';

// Several applicators may work at once: keep the roster fresh.
const REFRESH_MS = 20_000;

const formatTime = (value) => (value ? new Intl.DateTimeFormat('es-GT', { timeStyle: 'short' }).format(new Date(value)) : '');
const formatDay = (value) => (value ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' }).format(new Date(value)) : '');
const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

const EVALUATION = {
  PENDING: ['Pendiente', 'muted'],
  IN_PROGRESS: ['En curso', 'info'],
  COMPLETED: ['Completada', 'ok'],
};

const ACCESS_FILTERS = [
  ['all', 'Todos los accesos'], ['none', 'Sin acceso'], ['GENERATED', 'Preparado'], ['ENABLED', 'Habilitado'],
  ['USED', 'En uso'], ['REVOKED', 'Revocado'], ['EXPIRED', 'Vencido'],
];
const ATTENDANCE_FILTERS = [['all', 'Toda la asistencia'], ['present', 'Presentes'], ['unmarked', 'Sin marcar']];
const EVALUATION_FILTERS = [['all', 'Todas las evaluaciones'], ['PENDING', 'Pendientes'], ['IN_PROGRESS', 'En curso'], ['COMPLETED', 'Completadas']];

const isPresent = (row) => row.attendance?.status === 'PRESENT';
const canEnable = (row) => isPresent(row) && row.credential?.status === 'GENERATED';
// An interrupted session of an open evaluation (lost cards are handled while preparing).
const canRecover = (row) => row.credential?.status === 'USED' && row.evaluation !== 'COMPLETED';

const selectClass = 'h-10 rounded-xl border border-[#D9E2EA] bg-white px-3 text-sm text-[#10233A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40';

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
      {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
    </select>
  );
}

/**
 * Stage 3 · Apply, on the day of the appointment: check each candidate's
 * identity, mark them present and enable their code, one by one or all
 * present at once. Absent candidates are never enabled. An interrupted
 * session is recovered here (new code, same computer).
 */
export function OnsiteApplyStage({ event, module, notify, onCredentialsChanged }) {
  const eventId = event.id;
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [evaluationFilter, setEvaluationFilter] = useState('all');
  const [reissued, setReissued] = useState(null);

  const load = useCallback(async () => {
    try {
      setRoster(await onsiteService.getRoster(eventId, module));
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo cargar la lista de candidatos.'));
    }
  }, [eventId, module]);

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
  const counts = roster?.counts;
  const blockedDay = roster && roster.isAppointmentDay === false;

  const run = async (action) => {
    setBusy(true);
    setError('');
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
    await onsiteService.setAttendance(eventId, module, row.candidateId, true);
    notify(`${row.nombreCompleto} quedó marcado como presente.`);
  });

  const unmark = (row) => run(async () => {
    if (!window.confirm(`¿Quitar la asistencia de ${row.nombreCompleto}?`)) return;
    await onsiteService.setAttendance(eventId, module, row.candidateId, false);
  });

  const reportEnable = (result) => {
    const skipped = result.skipped.map((item) => `${item.nombreCompleto}: ${item.reason}`).join(' · ');
    if (result.enabled.length && !skipped) notify(`Se habilitó el acceso de ${result.enabled.length} candidato(s).`);
    else if (result.enabled.length) setError(`Se habilitó el acceso de ${result.enabled.length} candidato(s). No se habilitó a: ${skipped}.`);
    else setError(`No se habilitó ningún acceso. ${skipped}`);
    onCredentialsChanged?.();
  };

  const enableOne = (row) => run(async () => {
    reportEnable(await onsiteService.enableCredentials(eventId, module, [row.candidateId]));
  });

  const enablePresent = () => run(async () => {
    const names = ready.map((row) => row.nombreCompleto);
    const preview = names.slice(0, 10).join(', ') + (names.length > 10 ? ` y ${names.length - 10} más` : '');
    if (!window.confirm(`Se habilitará el acceso de ${names.length} candidato(s) marcados como presentes: ${preview}. Los candidatos sin asistencia no se habilitan. ¿Deseas continuar?`)) return;
    reportEnable(await onsiteService.enableCredentials(eventId, module, ready.map((row) => row.candidateId)));
  });

  const recover = (row) => run(async () => {
    const reason = window.prompt(
      `Recuperar la evaluación de ${row.nombreCompleto}: su sesión actual se cerrará y recibirá un código nuevo que solo funcionará en la misma computadora donde comenzó. Sus respuestas guardadas se conservan.\nMotivo:`,
      'Sesión interrumpida',
    );
    if (reason === null) return;
    const result = await credentialService.reissueCredential(eventId, row.credential.id, reason.trim() || undefined);
    setReissued(result);
    notify(`Se reemitió el acceso de ${row.nombreCompleto}.${isPresent(row) ? ' Habilítalo para que pueda ingresar.' : ''}`);
    onCredentialsChanged?.();
  });

  return (
    <section aria-labelledby='apply-title' className='space-y-4'>
      <h3 id='apply-title' className='sr-only'>Asistencia y habilitación · Módulo {module}</h3>

      {blockedDay && (
        <p className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
          Hoy no es el día de la cita. La asistencia y la habilitación solo se registran el {formatDay(module === 'A' ? event?.onsite?.startsAt : roster.rows[0]?.appointmentAt)}.
        </p>
      )}

      {counts && (
        <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-[#64748B] sm:flex sm:flex-wrap'>
          <div className='flex gap-1.5'><dt>Citados</dt><dd className='font-semibold text-[#101828]'>{counts.cited}</dd></div>
          <div className='flex gap-1.5'><dt>Presentes</dt><dd className='font-semibold text-[#101828]'>{counts.present}</dd></div>
          <div className='flex gap-1.5'><dt>Habilitados</dt><dd className='font-semibold text-[#101828]'>{counts.enabled}</dd></div>
          <div className='flex gap-1.5'><dt>En evaluación</dt><dd className='font-semibold text-[#101828]'>{counts.inProgress}</dd></div>
          <div className='flex gap-1.5'><dt>Completadas</dt><dd className='font-semibold text-[#101828]'>{counts.completed}</dd></div>
        </dl>
      )}

      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='flex flex-wrap gap-2'>
          <input type='search' value={search} onChange={(changeEvent) => setSearch(changeEvent.target.value)} placeholder='Buscar por nombre o cédula…' aria-label='Buscar candidato' className='h-10 w-full rounded-xl border border-[#D9E2EA] bg-white px-3.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 sm:w-60' />
          <FilterSelect label='Filtrar por asistencia' value={attendanceFilter} options={ATTENDANCE_FILTERS} onChange={setAttendanceFilter} />
          <FilterSelect label='Filtrar por acceso' value={accessFilter} options={ACCESS_FILTERS} onChange={setAccessFilter} />
          <FilterSelect label='Filtrar por evaluación' value={evaluationFilter} options={EVALUATION_FILTERS} onChange={setEvaluationFilter} />
        </div>
        <Button type='button' variant='accent' className='h-11 shrink-0 px-5' onClick={enablePresent} disabled={busy || ready.length === 0}>
          Habilitar presentes ({ready.length})
        </Button>
      </div>

      {error && <p role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}

      <div className='overflow-x-auto rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        {!roster ? (
          <div className='flex min-h-40 items-center justify-center text-sm text-[#64748B]'>{error ? '' : 'Cargando candidatos...'}</div>
        ) : rows.length === 0 ? (
          <div className='px-6 py-12 text-center text-sm text-[#64748B]'>
            {roster.rows.length === 0 ? 'Aún no hay candidatos citados a este módulo.' : 'Ningún candidato coincide con los filtros.'}
          </div>
        ) : (
          <table className='w-full text-left text-sm'>
            <thead className='border-b border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
              <tr>
                <th scope='col' className='px-5 py-3'>Candidato</th>
                <th scope='col' className='hidden px-5 py-3 xl:table-cell'>Cita</th>
                <th scope='col' className='px-5 py-3'>Asistencia</th>
                <th scope='col' className='px-5 py-3'>Acceso</th>
                <th scope='col' className='hidden px-5 py-3 xl:table-cell'>Evaluación</th>
                <th scope='col' className='px-5 py-3 text-right'><span className='sr-only'>Acciones</span></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-[#E8EDF2]'>
              {rows.map((row) => {
                const [evaluationLabel, evaluationTone] = EVALUATION[row.evaluation] || EVALUATION.PENDING;
                const locked = ['ENABLED', 'USED'].includes(row.credential?.status);
                return (
                  <tr key={row.candidateId}>
                    <td className='px-5 py-3'>
                      <p className='font-semibold text-[#101828]'>{row.nombreCompleto}</p>
                      <p className='text-xs text-[#64748B]'>Cédula {row.cedula}</p>
                      {/* Narrow screens: the evaluation column is folded here. */}
                      <p className='mt-1 text-xs text-[#64748B] xl:hidden'>Evaluación: {evaluationLabel.toLowerCase()}</p>
                    </td>
                    <td className='hidden whitespace-nowrap px-5 py-3 text-xs text-[#475569] xl:table-cell'>{formatTime(row.appointmentAt)}</td>
                    <td className='px-5 py-3'>
                      {isPresent(row) ? (
                        <span className='flex flex-wrap items-center gap-2'>
                          <StatusBadge tone='ok'>Presente · {formatTime(row.attendance.markedAt)}</StatusBadge>
                          {!locked && <button type='button' onClick={() => unmark(row)} disabled={busy || blockedDay} className='rounded text-xs font-semibold text-[#64748B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:opacity-50'>Quitar</button>}
                        </span>
                      ) : (
                        <button type='button' onClick={() => markPresent(row)} disabled={busy || blockedDay || row.evaluation === 'COMPLETED'} className='rounded-lg border border-[#D9E2EA] px-3 py-1.5 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4] hover:text-[#087D79] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:opacity-50'>Marcar presente</button>
                      )}
                    </td>
                    <td className='px-5 py-3'><CredentialStatus credential={row.credential} /></td>
                    <td className='hidden px-5 py-3 xl:table-cell'><StatusBadge tone={evaluationTone}>{evaluationLabel}</StatusBadge></td>
                    <td className='px-5 py-3 text-right'>
                      <div className='flex flex-wrap justify-end gap-2'>
                        {canRecover(row) && <button type='button' onClick={() => recover(row)} disabled={busy} className='rounded-lg border border-[#D9E2EA] px-3 py-1.5 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4] hover:text-[#087D79] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:opacity-50'>Recuperar acceso</button>}
                        {canEnable(row) && <button type='button' onClick={() => enableOne(row)} disabled={busy || blockedDay} className='rounded-lg bg-[#0AADA8] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#089490] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:opacity-50'>Habilitar</button>}
                        {isPresent(row) && !row.credential && <span className='text-xs text-amber-700'>Sin acceso preparado</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className='text-xs text-[#94A3B8]'>Se actualiza cada 20 segundos. Cada marca de asistencia, habilitación y recuperación queda registrada con el usuario que la realizó.</p>

      {reissued && <IssuedCodesDialog result={reissued} eventName={event?.name} onClose={() => { setReissued(null); load(); }} />}
    </section>
  );
}
