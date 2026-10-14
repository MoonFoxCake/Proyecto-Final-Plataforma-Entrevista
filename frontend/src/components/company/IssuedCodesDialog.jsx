import { useEffect, useState } from 'react';
import { formatSession } from '../../utils/eventModality.js';
import { base64ToBlob, saveFile } from '../../utils/download.js';

const formatExpiry = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

/**
 * The only time access codes are visible: right after issuing them. The
 * dialog offers the cards PDF (built by the server for this response only)
 * and a plain printable list, asks to confirm before closing, and warns
 * before leaving the page. Nothing here is stored; a lost card is revoked
 * and reissued.
 */
export function IssuedCodesDialog({ result, eventName, onClose }) {
  const [confirmed, setConfirmed] = useState(false);
  const { issued, skipped = [], rejected = [], module, cardsPdf } = result;
  const hasCodes = issued.length > 0;

  const downloadCards = () => saveFile(base64ToBlob(cardsPdf.base64, cardsPdf.contentType), cardsPdf.fileName);

  useEffect(() => {
    if (!hasCodes) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasCodes]);

  return (
    <div className='fixed inset-0 z-50 overflow-y-auto bg-[#0B1A2B]/50 p-4 print:static print:bg-white print:p-0' role='dialog' aria-modal='true' aria-labelledby='issued-codes-title'>
      <div className='print-area mx-auto my-6 max-w-3xl rounded-2xl bg-white shadow-2xl print:my-0 print:shadow-none'>
        <div className='border-b border-[#EEF2F6] px-6 py-5'>
          <h2 id='issued-codes-title' className='font-display text-xl font-bold text-[#101828]'>
            {hasCodes ? `Accesos preparados · Módulo ${module}` : 'No se generaron accesos nuevos'}
          </h2>
          <p className='mt-1 text-sm text-[#64748B]'>{eventName}</p>
          {hasCodes && (
            <p className='no-print mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800' role='note'>
              <strong>Estos códigos solo se muestran ahora.</strong> Descarga las tarjetas e imprímelas antes de cerrar esta ventana. No se guardan en el sistema: si se pierde una tarjeta, revoca ese acceso y reemítelo. Guarda el PDF en un lugar seguro o elimínalo después de imprimir.
            </p>
          )}
        </div>

        {hasCodes && (
          <table className='w-full text-left text-sm'>
            <thead className='bg-[#FAFBFC] text-[11px] font-semibold uppercase tracking-wide text-[#718096]'>
              <tr><th className='px-6 py-3'>Candidato</th><th className='px-6 py-3'>Código de acceso</th><th className='px-6 py-3'>Cita</th><th className='px-6 py-3'>Válido hasta</th></tr>
            </thead>
            <tbody className='divide-y divide-[#E8EDF2]'>
              {issued.map((item) => (
                <tr key={item.credentialId} className='break-inside-avoid'>
                  <td className='px-6 py-3 font-medium text-[#101828]'>{item.nombreCompleto}</td>
                  <td className='px-6 py-3'><span className='font-mono text-lg font-bold tracking-[0.15em] text-[#10233A]'>{item.code}</span></td>
                  <td className='px-6 py-3 text-xs text-[#475569]'>{item.appointment?.venue}{item.appointment?.room ? ` · ${item.appointment.room}` : ''}<br />{formatSession(item.appointment)}</td>
                  <td className='px-6 py-3 text-xs text-[#475569]'>{formatExpiry(item.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(skipped.length > 0 || rejected.length > 0) && (
          <div className='no-print space-y-3 border-t border-[#EEF2F6] px-6 py-4 text-sm'>
            {skipped.length > 0 && <p className='text-[#475569]'><strong>Ya tenían un acceso</strong> (no se generó otro): {skipped.map((item) => item.nombreCompleto).join(', ')}.</p>}
            {rejected.length > 0 && (
              <div className='text-amber-800'>
                <strong>No se pudo preparar el acceso de:</strong>
                <ul className='mt-1 list-disc pl-5'>{rejected.map((item) => <li key={item.candidateId}>{item.nombreCompleto}: {item.reason}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div className='no-print flex flex-col gap-3 rounded-b-2xl border-t border-[#EEF2F6] bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between'>
          {hasCodes ? (
            <label className='flex items-center gap-2 text-sm text-[#334E68]'>
              <input type='checkbox' checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className='h-4 w-4 accent-[#0AADA8]' />
              Ya descargué o imprimí las tarjetas
            </label>
          ) : <span />}
          <div className='flex flex-wrap gap-3'>
            {hasCodes && <button type='button' onClick={() => window.print()} className='rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#334E68] hover:bg-[#F6F9FC]'>Imprimir lista</button>}
            {hasCodes && cardsPdf && <button type='button' onClick={downloadCards} className='rounded-xl border border-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-[#087D79] hover:bg-[#F0FFFE]'>Descargar tarjetas (PDF)</button>}
            <button type='button' onClick={onClose} disabled={hasCodes && !confirmed} className='rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:cursor-not-allowed disabled:bg-[#B8C5CF]'>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
