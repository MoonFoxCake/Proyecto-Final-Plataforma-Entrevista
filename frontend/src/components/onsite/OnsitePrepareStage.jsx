import { useMemo, useState } from 'react';
import { Button, Dialog } from '../ui';
import { IssuedCodesDialog } from '../company/IssuedCodesDialog.jsx';
import * as credentialService from '../../services/credentialService.js';
import { CredentialStatus, LIVE_STATUSES } from './CredentialStatus.jsx';

const formatDateTime = (value) => (value ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '');
const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

/** A row can get a new code if it has none that is still printable, usable or in use. */
const needsCode = (row) => row.canIssue && (!row.credential || ['REVOKED', 'EXPIRED'].includes(row.credential.status));

const PAPERS = [['CARTA', 'Carta'], ['A4', 'A4']];

/**
 * Stage 1 · Prepare accesses: select candidates without a code, generate
 * their codes (shown once, with the printable cards) and manage single
 * credentials (lost card: reissue or revoke). Recovering a session in
 * progress belongs to the "Aplicar" stage.
 */
export function OnsitePrepareStage({ event, module, summary, loaded, reload, notify }) {
  const [selected, setSelected] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [paper, setPaper] = useState('CARTA');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);
  const rows = summary?.rows || [];
  const pending = useMemo(() => rows.filter(needsCode), [rows]);

  const toggle = (candidateId) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(candidateId)) next.delete(candidateId);
    else next.add(candidateId);
    return next;
  });

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo completar la operación.'));
    } finally {
      setBusy(false);
    }
  };

  const generate = () => run(async () => {
    const result = await credentialService.issueCredentials(event.id, module, [...selected], paper);
    setConfirming(false);
    setSelected(new Set());
    setIssued(result);
    await reload();
  });

  const revoke = (row) => run(async () => {
    const reason = window.prompt(`Revocar el acceso de ${row.nombreCompleto}. Su código dejará de funcionar.\nMotivo (opcional):`, '');
    if (reason === null) return;
    await credentialService.revokeCredential(event.id, row.credential.id, reason.trim() || undefined);
    await reload();
    notify(`Se revocó el acceso de ${row.nombreCompleto}.`);
  });

  const reissue = (row) => run(async () => {
    const reason = window.prompt(`Reemitir el acceso de ${row.nombreCompleto}: el código actual dejará de funcionar y se generará uno nuevo.\nMotivo (opcional):`, 'Hoja extraviada');
    if (reason === null) return;
    const result = await credentialService.reissueCredential(event.id, row.credential.id, reason.trim() || undefined, paper);
    setIssued(result);
    await reload();
  });

  if (!loaded) return <p className='text-sm text-[#64748B]'>Cargando accesos...</p>;

  return (
    <section aria-labelledby='prepare-title' className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <h3 id='prepare-title' className='font-display text-base font-bold text-[#101828]'>
          Accesos del Módulo {module} <span className='ml-1 text-sm font-normal text-[#64748B]'>{pending.length} sin preparar</span>
        </h3>
        <div className='flex flex-wrap items-center gap-3'>
          <button type='button' onClick={() => setSelected(new Set(pending.map((row) => row.candidateId)))} disabled={busy || pending.length === 0} className='rounded px-1 text-sm font-semibold text-[#0A8F8A] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:text-[#94A3B8] disabled:no-underline'>
            Seleccionar pendientes ({pending.length})
          </button>
          <Button type='button' variant='accent' className='h-11 px-5' onClick={() => setConfirming(true)} disabled={busy || selected.size === 0}>
            Generar accesos ({selected.size})
          </Button>
        </div>
      </div>

      <details className='group rounded-xl border border-[#E8EDF2] bg-white px-4 py-3 text-sm text-[#56677B]'>
        <summary className='cursor-pointer font-semibold text-[#334E68] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40'>Cómo funcionan los accesos</summary>
        <ul className='mt-3 list-disc space-y-1.5 pl-5 leading-6'>
          <li>Los códigos y las hojas de acceso (PDF) solo se entregan al generarlos: no se guardan en el sistema.</li>
          <li>Cada código sirve una sola vez y vence al terminar el día de la cita.</li>
          <li>No funciona hasta que el aplicador lo habilita en la sede, después de verificar la identidad del candidato.</li>
          <li>Si se pierde una hoja, reemite ese acceso: el código anterior deja de funcionar.</li>
        </ul>
      </details>

      {error && <p role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}

      <div className='overflow-x-auto rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        {rows.length === 0 ? (
          <div className='px-6 py-12 text-center text-sm text-[#64748B]'>
            {module === 'B' ? 'Aún no hay candidatos citados al Módulo B. Cítalos desde Resultados.' : 'Aún no hay candidatos en este evento. Agrégalos desde Candidatos.'}
          </div>
        ) : (
          <table className='w-full text-left text-sm'>
            <thead className='border-b border-[#E8EDF2] bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
              <tr>
                <th scope='col' className='w-12 px-5 py-3'><span className='sr-only'>Seleccionar</span></th>
                <th scope='col' className='px-5 py-3'>Candidato</th>
                <th scope='col' className='px-5 py-3'>Acceso</th>
                <th scope='col' className='hidden px-5 py-3 md:table-cell'>Detalle</th>
                <th scope='col' className='px-5 py-3 text-right'><span className='sr-only'>Acciones</span></th>
              </tr>
            </thead>
            <tbody className='divide-y divide-[#E8EDF2]'>
              {rows.map((row) => {
                const { credential } = row;
                const live = credential && LIVE_STATUSES.includes(credential.status);
                return (
                  <tr key={row.candidateId} className={selected.has(row.candidateId) ? 'bg-[#F4FBFB]' : ''}>
                    <td className='px-5 py-3'>
                      {needsCode(row) && (
                        <input type='checkbox' checked={selected.has(row.candidateId)} onChange={() => toggle(row.candidateId)} aria-label={`Preparar el acceso de ${row.nombreCompleto}`} className='h-4 w-4 cursor-pointer accent-[#0AADA8]' />
                      )}
                    </td>
                    <td className='px-5 py-3 font-medium text-[#101828]'>{row.nombreCompleto}</td>
                    <td className='px-5 py-3'><CredentialStatus credential={credential} /></td>
                    <td className='hidden px-5 py-3 text-xs text-[#64748B] md:table-cell'>
                      {!credential && !row.canIssue && row.blockedReason && <span>No disponible: {row.blockedReason}</span>}
                      {live && <span>Válido hasta {formatDateTime(credential.expiresAt)}</span>}
                      {credential?.status === 'REVOKED' && <span>Revocado el {formatDateTime(credential.revokedAt)}{credential.revokeReason ? ` · ${credential.revokeReason}` : ''}</span>}
                      {credential?.status === 'USED' && <span>En uso desde {formatDateTime(credential.usedAt)}</span>}
                      {credential?.status === 'EXPIRED' && <span>Venció el {formatDateTime(credential.expiresAt)}</span>}
                      {credential?.requiredClientId && live && <span className='block'>Solo en la computadora donde comenzó</span>}
                    </td>
                    <td className='px-5 py-3'>
                      {live && (
                        <div className='flex justify-end gap-2'>
                          <button type='button' onClick={() => reissue(row)} disabled={busy || !row.canIssue} className='rounded-lg border border-[#D9E2EA] px-3 py-1.5 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4] hover:text-[#087D79] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 disabled:opacity-50'>Reemitir</button>
                          <button type='button' onClick={() => revoke(row)} disabled={busy} className='rounded-lg px-3 py-1.5 text-xs font-semibold text-[#B42318] hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50'>Revocar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirming && (
        <Dialog
          title={`Generar ${selected.size} acceso(s) · Módulo ${module}`}
          description='Los códigos y las hojas de acceso se mostrarán una sola vez para descargarlos e imprimirlos.'
          busy={busy}
          onClose={() => setConfirming(false)}
          footer={(
            <>
              <Button type='button' variant='outline' className='h-10 px-4' onClick={() => setConfirming(false)} disabled={busy}>Cancelar</Button>
              <Button type='button' variant='accent' className='h-10 px-5' onClick={generate} disabled={busy}>{busy ? 'Generando...' : 'Generar accesos'}</Button>
            </>
          )}
        >
          <fieldset>
            <legend className='text-sm font-medium text-[#364153]'>Formato de las hojas</legend>
            <div className='mt-2 flex gap-3'>
              {PAPERS.map(([value, label]) => (
                <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${paper === value ? 'border-[#0AADA8] bg-[#F0FFFE] text-[#087D79]' : 'border-[#DDE5EC] text-[#475569]'}`}>
                  <input type='radio' name='paper' value={value} checked={paper === value} onChange={() => setPaper(value)} className='accent-[#0AADA8]' />
                  {label}
                </label>
              ))}
            </div>
            <p className='mt-2 text-xs text-[#64748B]'>Una hoja por candidato, sin recortes: se dobla por las marcas para ocultar el código.</p>
          </fieldset>
          {error && <p role='alert' className='mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{error}</p>}
        </Dialog>
      )}

      {issued && <IssuedCodesDialog result={issued} eventName={event?.name} onClose={() => setIssued(null)} />}
    </section>
  );
}
