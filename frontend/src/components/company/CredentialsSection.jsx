import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../ui';
import * as credentialService from '../../services/credentialService.js';
import { saveFile } from '../../utils/download.js';
import { IssuedCodesDialog } from './IssuedCodesDialog.jsx';

const STATUS = {
  GENERATED: ['Preparado', 'bg-[#EEF6FF] text-[#315B88]'],
  ENABLED: ['Habilitado', 'bg-[#E8F8F5] text-[#087D79]'],
  USED: ['Utilizado', 'bg-[#E2F3EF] text-[#0A6B57]'],
  REVOKED: ['Revocado', 'bg-red-50 text-red-700'],
  EXPIRED: ['Vencido', 'bg-[#FFF7E8] text-[#9A651E]'],
};
const LIVE = ['GENERATED', 'ENABLED'];

const formatDateTime = (value) => (value ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '');
const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

export function CredentialStatus({ credential }) {
  if (!credential) return <span className='inline-flex rounded-md bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#475569]'>Sin preparar</span>;
  const [label, tone] = STATUS[credential.status] || [credential.status, 'bg-[#F1F5F9] text-[#475569]'];
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}

/** A row can get a new code if it has none that is still printable, usable or used. */
const needsCode = (row) => row.canIssue && (!row.credential || ['REVOKED', 'EXPIRED'].includes(row.credential.status));

/**
 * "Preparar accesos" for an onsite event: issue the temporary codes ahead of
 * the appointment, see what is prepared without ever showing a code again,
 * and revoke or reissue a single credential.
 */
export function CredentialsSection({ event, candidatesVersion = '' }) {
  const [summary, setSummary] = useState(null);
  const [moduleId, setModuleId] = useState('A');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issuedResult, setIssuedResult] = useState(null);
  const [paper, setPaper] = useState('CARTA');

  const load = useCallback(async () => {
    try {
      setSummary(await credentialService.getCredentials(event.id));
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo cargar el estado de los accesos.'));
    }
  }, [event.id]);

  // Reload when the event's candidates change (new ones, Module B citations),
  // without remounting: an open dialog with codes must never disappear.
  useEffect(() => { load(); }, [load, candidatesVersion]);

  const current = summary?.modules.find((item) => item.module === moduleId) ?? summary?.modules[0];
  const pending = useMemo(() => (current?.rows || []).filter(needsCode), [current]);

  const switchModule = (module) => {
    setModuleId(module);
    setSelected(new Set());
  };

  const toggle = (candidateId) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(candidateId)) next.delete(candidateId);
    else next.add(candidateId);
    return next;
  });

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
    }
  };

  const issue = () => run(async () => {
    const ids = [...selected];
    if (!window.confirm(`Se prepararán ${ids.length} acceso(s) para el Módulo ${current.module}. Los códigos se mostrarán una sola vez para imprimirlos. ¿Deseas continuar?`)) return;
    const result = await credentialService.issueCredentials(event.id, current.module, ids, paper);
    setSelected(new Set());
    setIssuedResult(result);
    await load();
  });

  const revoke = (row) => run(async () => {
    const reason = window.prompt(`Revocar el acceso de ${row.nombreCompleto}. Su código dejará de funcionar.\nMotivo (opcional):`, '');
    if (reason === null) return;
    await credentialService.revokeCredential(event.id, row.credential.id, reason.trim() || undefined);
    await load();
    setNotice(`Se revocó el acceso de ${row.nombreCompleto}.`);
  });

  const reissue = (row) => run(async () => {
    const reason = window.prompt(`Reemitir el acceso de ${row.nombreCompleto}: el código actual dejará de funcionar y se generará uno nuevo para imprimir.\nMotivo (opcional):`, 'Tarjeta extraviada');
    if (reason === null) return;
    const result = await credentialService.reissueCredential(event.id, row.credential.id, reason.trim() || undefined, paper);
    setIssuedResult(result);
    await load();
  });

  const downloadAttendance = () => run(async () => {
    const { blob, fileName } = await credentialService.getAttendanceSheet(event.id, current.module, paper);
    saveFile(blob, fileName);
  });

  const counts = current?.counts;

  return (
    <section className='mt-6 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
      <div className='flex flex-col justify-between gap-4 px-5 py-5 lg:flex-row lg:items-start'>
        <div className='max-w-2xl'>
          <h2 className='font-display text-base font-bold text-[#101828]'>Preparar accesos</h2>
          <p className='mt-1 text-xs leading-5 text-[#64748B]'>
            Genera con anticipación el código temporal de cada candidato e imprime sus tarjetas (PDF, 8 por hoja, con líneas de corte). Cada código sirve una sola vez, hasta el final del día de su cita, y no funcionará hasta que el aplicador lo habilite en la sede. Los códigos y las tarjetas solo se entregan al generarlos. La lista de asistencia de los candidatos citados, sin códigos, se puede descargar cuando la necesites.
          </p>
        </div>
        {current && (
          <div className='flex shrink-0 flex-wrap items-center gap-3'>
            <label className='flex items-center gap-2 text-xs font-medium text-[#475569]'>
              Papel
              <select value={paper} onChange={(changeEvent) => setPaper(changeEvent.target.value)} className='h-11 rounded-xl border border-[#D9E2EA] bg-white px-3 text-sm text-[#10233A]'>
                <option value='CARTA'>Carta</option>
                <option value='A4'>A4</option>
              </select>
            </label>
            <Button type='button' variant='outline' className='h-11 px-4' onClick={downloadAttendance} disabled={busy}>
              Lista de asistencia (PDF)
            </Button>
            <Button type='button' variant='outline' className='h-11 px-4' onClick={() => setSelected(new Set(pending.map((row) => row.candidateId)))} disabled={busy || pending.length === 0}>
              Seleccionar pendientes ({pending.length})
            </Button>
            <Button type='button' variant='accent' className='h-11 px-5' onClick={issue} disabled={busy || selected.size === 0}>
              {busy ? 'Procesando...' : `Preparar accesos (${selected.size})`}
            </Button>
          </div>
        )}
      </div>

      {summary?.modules.length > 1 && (
        <div className='flex gap-2 px-5' role='tablist' aria-label='Módulo'>
          {summary.modules.map((item) => (
            <button key={item.module} type='button' role='tab' aria-selected={current?.module === item.module} onClick={() => switchModule(item.module)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${current?.module === item.module ? 'bg-[#0AADA8] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}>
              Módulo {item.module}
            </button>
          ))}
        </div>
      )}

      {counts && (
        <div className='flex flex-wrap gap-x-6 gap-y-1 px-5 py-4 text-sm text-[#64748B]'>
          <p><strong className='mr-1 text-[#101828]'>{counts.prepared + counts.enabled}</strong> preparados</p>
          <p><strong className='mr-1 text-[#101828]'>{counts.pending}</strong> pendientes</p>
          <p><strong className='mr-1 text-[#101828]'>{counts.revoked}</strong> revocados</p>
          {counts.used > 0 && <p><strong className='mr-1 text-[#101828]'>{counts.used}</strong> utilizados</p>}
          {counts.expired > 0 && <p><strong className='mr-1 text-[#101828]'>{counts.expired}</strong> vencidos</p>}
        </div>
      )}

      {error && <p role='alert' className='mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}
      {notice && <p className='mx-5 mb-4 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] px-4 py-3 text-sm text-[#087D79]'>{notice}</p>}

      {!summary ? (
        <div className='px-5 pb-6 text-sm text-[#64748B]'>{error ? '' : 'Cargando accesos...'}</div>
      ) : !current || current.rows.length === 0 ? (
        <div className='m-5 rounded-xl border border-dashed border-[#CBD5E1] p-6 text-center text-sm text-[#94A3B8]'>
          {current?.module === 'B' ? 'Aún no hay candidatos citados al Módulo B.' : 'Aún no hay candidatos en este evento.'}
        </div>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[760px] text-left'>
            <thead className='border-y border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
              <tr>
                <th className='w-12 px-5 py-3'><span className='sr-only'>Seleccionar</span></th>
                <th className='px-5 py-3'>Candidato</th><th className='px-5 py-3'>Acceso</th><th className='px-5 py-3'>Detalle</th><th className='px-5 py-3 text-right'>Acciones</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-[#E8EDF2] text-sm'>
              {current.rows.map((row) => {
                const credential = row.credential;
                return (
                  <tr key={row.candidateId} className={selected.has(row.candidateId) ? 'bg-[#F4FBFB]' : ''}>
                    <td className='px-5 py-3'>
                      {needsCode(row) && (
                        <input type='checkbox' checked={selected.has(row.candidateId)} onChange={() => toggle(row.candidateId)} aria-label={`Preparar el acceso de ${row.nombreCompleto}`} className='h-4 w-4 cursor-pointer accent-[#0AADA8]' />
                      )}
                    </td>
                    <td className='px-5 py-3 font-medium text-[#101828]'>{row.nombreCompleto}</td>
                    <td className='px-5 py-3'><CredentialStatus credential={credential} /></td>
                    <td className='px-5 py-3 text-xs text-[#64748B]'>
                      {!credential && !row.canIssue && row.blockedReason && <span>No disponible: {row.blockedReason}</span>}
                      {credential && LIVE.includes(credential.status) && <span>Válido hasta {formatDateTime(credential.expiresAt)}</span>}
                      {credential?.status === 'REVOKED' && <span>Revocado el {formatDateTime(credential.revokedAt)}{credential.revokeReason ? ` · ${credential.revokeReason}` : ''}</span>}
                      {credential?.status === 'USED' && <span>Utilizado el {formatDateTime(credential.usedAt)}</span>}
                      {credential?.status === 'EXPIRED' && <span>Venció el {formatDateTime(credential.expiresAt)}</span>}
                    </td>
                    <td className='px-5 py-3 text-right'>
                      <div className='flex justify-end gap-2'>
                        {credential && LIVE.includes(credential.status) && (
                          <>
                            <button type='button' onClick={() => reissue(row)} disabled={busy || !row.canIssue} className='rounded-lg border border-[#D9E2EA] px-3 py-1.5 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4] hover:text-[#087D79] disabled:opacity-50'>Reemitir</button>
                            <button type='button' onClick={() => revoke(row)} disabled={busy} className='rounded-lg px-3 py-1.5 text-xs font-semibold text-[#B42318] hover:bg-red-50 disabled:opacity-50'>Revocar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {issuedResult && <IssuedCodesDialog result={issuedResult} eventName={event.name} onClose={() => setIssuedResult(null)} />}
    </section>
  );
}
