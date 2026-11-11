import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpinnerIcon } from '../auth/icons.jsx';
import * as eventService from '../../services/eventService.js';

const PHASE_NAMES = { A: 'Fase A · Cuestionario', B: 'Fase B · Macrocaso', C: 'Fase C · Microcaso' };

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value._seconds != null ? value._seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value) => {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '';
};

/** Every PDF the administrators delivered to this company, newest first. */
export function CompanyResultsView() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    let active = true;
    eventService.getEvents()
      .then((data) => { if (active) setEvents(data); })
      .catch(() => { if (active) setError('No se pudieron cargar los resultados.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const reports = events.flatMap((event) => ['A', 'B', 'C']
    .filter((module) => event.moduleResults?.[module]?.status === 'DELIVERED')
    .map((module) => ({ key: `${event.id}-${module}`, event, module, ...event.moduleResults[module] })))
    .sort((a, b) => (asDate(b.deliveredAt)?.getTime() ?? 0) - (asDate(a.deliveredAt)?.getTime() ?? 0));

  const processes = new Set(reports.map((report) => report.event.id)).size;

  const download = async (report) => {
    setDownloading(report.key);
    setError('');
    try {
      const result = await eventService.getResultDownloadUrl(report.event.id, report.module);
      window.location.assign(result.url);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo descargar el resultado.');
    } finally {
      setDownloading('');
    }
  };

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Documentos entregados</p>
    <h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Resultados recibidos</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Los informes PDF de cada fase de tus procesos. Con cada informe puedes decidir quiénes continúan a la siguiente etapa.</p>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div role="status" className="mt-8 flex min-h-40 items-center justify-center text-sm text-[#64748B]"><SpinnerIcon className="mr-2 h-5 w-5 animate-spin text-[#0AADA8]" />Cargando resultados...</div> : <>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        {[['Informes recibidos', reports.length], ['Procesos con resultados', processes], ['Última entrega', reports[0] ? formatDate(reports[0].deliveredAt) : '—']].map(([label, value]) => <div key={label} className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm"><dt className="text-sm font-medium text-[#64748B]">{label}</dt><dd className={`mt-3 font-display font-bold text-[#101828] ${typeof value === 'number' ? 'text-3xl' : 'text-base'}`}>{value}</dd></div>)}
      </dl>
      {reports.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center"><h2 className="font-display text-lg font-bold text-[#101828]">Aún no has recibido informes</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#64748B]">Cuando el equipo de NexoPerfil entregue el resultado de una fase, aparecerá aquí para descargarlo.</p></div>
        : <div className="mt-6 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm">{reports.map((report) => <article key={report.key} className="flex flex-col gap-3 border-b border-[#EEF2F6] p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="break-words text-sm font-semibold text-[#101828]">{report.event.name || 'Proceso'}</h2><p className="mt-1 text-xs text-[#64748B]">{PHASE_NAMES[report.module]} · Entregado el {formatDate(report.deliveredAt)}</p></div><div className="flex shrink-0 flex-wrap gap-2"><Link to={`/company/events/${encodeURIComponent(report.event.id)}/resultados`} className="rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] hover:border-[#13A9A4]">Ver proceso</Link><button type="button" disabled={Boolean(downloading)} onClick={() => download(report)} className="rounded-lg bg-[#0AADA8] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#089490] disabled:opacity-50">{downloading === report.key ? 'Preparando…' : 'Descargar PDF'}</button></div></article>)}</div>}
    </>}
  </div></div>;
}
