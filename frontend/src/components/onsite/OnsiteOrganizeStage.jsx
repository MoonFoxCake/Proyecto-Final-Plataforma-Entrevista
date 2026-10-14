import { useState } from 'react';
import { Button } from '../ui';
import * as credentialService from '../../services/credentialService.js';
import { saveFile } from '../../utils/download.js';

const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

function Count({ label, value }) {
  return (
    <div className='px-5 py-4'>
      <dt className='text-xs font-medium text-[#64748B]'>{label}</dt>
      <dd className='mt-1 font-display text-2xl font-bold text-[#10233A]'>{value}</dd>
    </div>
  );
}

/**
 * Stage 2 · Organize: what is ready and what is missing, and the
 * attendance sheet (no codes, downloadable any time). Cards are not
 * downloadable here on purpose: they only exist in the response that
 * issues the codes.
 */
export function OnsiteOrganizeStage({ eventId, module, summary, loaded, onPrepare, notify }) {
  const [paper, setPaper] = useState('CARTA');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const counts = summary?.counts;
  const pendingNames = (summary?.rows || []).filter((row) => !row.credential || ['REVOKED', 'EXPIRED'].includes(row.credential.status)).map((row) => row.nombreCompleto);

  const downloadAttendance = async () => {
    setBusy(true);
    setError('');
    try {
      const { blob, fileName } = await credentialService.getAttendanceSheet(eventId, module, paper);
      saveFile(blob, fileName);
      notify('Lista de asistencia descargada.');
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo descargar la lista de asistencia.'));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className='text-sm text-[#64748B]'>Cargando accesos...</p>;

  return (
    <div className='space-y-6'>
      <section aria-labelledby='organize-counts' className='rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'>
        <h3 id='organize-counts' className='sr-only'>Estado de los accesos del Módulo {module}</h3>
        <dl className='grid grid-cols-2 divide-[#EEF2F6] sm:grid-cols-4 sm:divide-x'>
          <Count label='Candidatos' value={counts?.total ?? 0} />
          <Count label='Preparados' value={(counts?.prepared ?? 0) + (counts?.enabled ?? 0)} />
          <Count label='Sin preparar' value={counts?.pending ?? 0} />
          <Count label='Revocados' value={counts?.revoked ?? 0} />
        </dl>
        {pendingNames.length > 0 && (
          <details className='border-t border-[#EEF2F6] px-5 py-3 text-sm'>
            <summary className='cursor-pointer font-semibold text-[#334E68] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40'>Ver candidatos sin acceso ({pendingNames.length})</summary>
            <ul className='mt-2 grid gap-1 text-[#56677B] sm:grid-cols-2'>{pendingNames.map((name) => <li key={name}>{name}</li>)}</ul>
          </details>
        )}
      </section>

      <div className='grid gap-6 lg:grid-cols-2'>
        <section aria-labelledby='attendance-title' className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm'>
          <h3 id='attendance-title' className='font-display text-base font-bold text-[#101828]'>Lista de asistencia</h3>
          <p className='mt-1 text-sm text-[#56677B]'>Candidatos citados en orden alfabético, con espacio para firmar. No incluye códigos.</p>
          {error && <p role='alert' className='mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{error}</p>}
          <div className='mt-4 flex flex-wrap items-end gap-3'>
            <label className='text-xs font-medium text-[#475569]'>
              Formato
              <select value={paper} onChange={(changeEvent) => setPaper(changeEvent.target.value)} className='mt-1 block h-11 rounded-xl border border-[#D9E2EA] bg-white px-3 text-sm text-[#10233A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40'>
                <option value='CARTA'>Carta</option>
                <option value='A4'>A4</option>
              </select>
            </label>
            <Button type='button' variant='accent' className='h-11 px-5' onClick={downloadAttendance} disabled={busy}>{busy ? 'Descargando...' : 'Descargar lista (PDF)'}</Button>
          </div>
        </section>

        <section aria-labelledby='cards-title' className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm'>
          <h3 id='cards-title' className='font-display text-base font-bold text-[#101828]'>Hojas de acceso</h3>
          <p className='mt-1 text-sm text-[#56677B]'>Una hoja por candidato, doblada con el código hacia adentro y el nombre visible. Se descargan al generar los accesos y no se guardan en el sistema. Si se pierde una hoja, reemite ese acceso.</p>
          <Button type='button' variant='outline' className='mt-4 h-11 px-4' onClick={onPrepare}>Ir a Preparar accesos</Button>
        </section>
      </div>
    </div>
  );
}
