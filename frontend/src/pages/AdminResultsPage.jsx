import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { can } from '../utils/adminPermissions.js';
import * as resultsApi from '../services/resultDeliveryService.js';

const keyOf = (row) => `${row.eventId}-${row.module}`;

export function AdminResultsPage() {
  const { profile } = useAuth();
  const canDeliver = can(profile, 'results.deliver');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    try { setRows(await resultsApi.getPendingResults()); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const deliver = async (row) => {
    const key = keyOf(row);
    const file = files[key];
    if (!file) { setError('Selecciona el PDF antes de marcarlo como entregado.'); return; }
    if (file.type !== 'application/pdf') { setError('El archivo debe ser PDF.'); return; }
    setBusy(key);
    setError('');
    setMessage('');
    try {
      await resultsApi.uploadResult(row.eventId, row.module, file);
      setRows((current) => current.filter((item) => keyOf(item) !== key));
      setMessage(`Resultado de Fase ${row.module} entregado correctamente.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  };

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <p className="text-xs font-semibold uppercase tracking-widest text-[#0AADA8]">Administración</p>
    <h1 className="mt-2 text-2xl font-bold text-[#10233A]">Entrega de resultados</h1>
    <p className="mt-2 text-sm text-[#64748B]">Aquí aparece cada fase terminada. Al subir su PDF, la empresa lo recibe y puede abrir la siguiente fase.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    <div className="mt-6 space-y-3">
      {loading ? <div role="status" className="rounded-xl border border-[#DDE5EC] bg-white p-10 text-center text-sm text-[#64748B]">Cargando resultados pendientes…</div> : <>
        {rows.map((row) => {
          const key = keyOf(row);
          return <article key={key} className="rounded-xl border border-[#DDE5EC] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold text-[#10233A]">{row.eventName}</h2><p className="mt-1 text-sm text-[#64748B]">{row.company} · Fase {row.module} · {row.completed} respondieron{row.withdrawn ? ` · ${row.withdrawn} retirados` : ''}</p></div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Pendiente</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input disabled={!canDeliver} type="file" accept="application/pdf,.pdf" aria-label={`PDF de la Fase ${row.module} de ${row.eventName}`} onChange={(changeEvent) => setFiles((current) => ({ ...current, [key]: changeEvent.target.files?.[0] || null }))} className="max-w-full text-sm" />
              <button type="button" onClick={() => deliver(row)} disabled={busy === key || !canDeliver} className="rounded-lg bg-[#087D79] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === key ? 'Subiendo…' : 'Subir PDF y entregar'}</button>
            </div>
          </article>;
        })}
        {!rows.length && <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#64748B]">No hay resultados pendientes de entrega.</div>}
      </>}
    </div>
  </div></div>;
}
