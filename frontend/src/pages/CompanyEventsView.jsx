import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/ui';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import * as eventService from '../services/eventService.js';
import { isOnsite, modulesOf } from '../utils/eventModality.js';
import { EVENT_STATES, availabilityOf, filterCompanyEvents, invalidRange, nameOf, positionOf, stateOf } from './companyEvents.js';

const CONTROL = 'mt-1.5 w-full rounded-xl border border-[#DDE5EC] bg-white px-3 py-2.5 text-sm font-normal text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/40';
const SECONDARY = 'rounded-xl border border-[#DDE5EC] bg-white px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F6F9FC] focus-visible:outline-teal-600 disabled:opacity-50';
const PAGE_SIZE = 8;
const PERIODS = { all: 'Todas las fechas', today: 'Hoy', next7: 'Próximos 7 días', last30: 'Últimos 30 días', custom: 'Rango personalizado', undated: 'Sin fecha configurada' };
const formatDate = (event) => { const date = availabilityOf(event); return date ? new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Sin fecha configurada'; };

export function CompanyEventsView() {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    eventService.getEvents()
      .then((data) => { if (active) setEvents(data); })
      .catch(() => { if (active) { setError('No se pudieron cargar los eventos. Inténtalo nuevamente.'); setEvents([]); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const filters = {
    query: params.get('q') || '',
    modality: ['online', 'onsite'].includes(params.get('modality')) ? params.get('modality') : 'all',
    status: Object.hasOwn(EVENT_STATES, params.get('status')) ? params.get('status') : 'all',
    module: ['A', 'B', 'C'].includes(params.get('module')) ? params.get('module') : 'all',
    period: Object.hasOwn(PERIODS, params.get('period')) ? params.get('period') : 'all',
    from: /^\d{4}-\d{2}-\d{2}$/.test(params.get('from')) ? params.get('from') : '',
    until: /^\d{4}-\d{2}-\d{2}$/.test(params.get('until')) ? params.get('until') : '',
    sort: ['name', 'upcoming'].includes(params.get('sort')) ? params.get('sort') : 'recent',
  };
  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    next.set('section', 'events'); next.delete('page');
    if (!value || value === 'all' || (key === 'sort' && value === 'recent')) next.delete(key); else next.set(key, value);
    if (key === 'period' && value !== 'custom') { next.delete('from'); next.delete('until'); }
    return next;
  }, { replace: true });
  const clear = () => setParams({ section: 'events' }, { replace: true });
  const rangeError = invalidRange(filters);
  const filtered = filterCompanyEvents(events, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rawPage = Number(params.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, pages) : 1;
  const setPage = (value) => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(value)); return next; });
  const activeCount = [filters.modality, filters.status, filters.module, filters.period].filter((value) => value !== 'all').length;
  const hasFilters = filters.query || activeCount || filters.sort !== 'recent';

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Portal empresa</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Eventos</h1><p className="mt-1 text-sm leading-6 text-[#64748B]">Encuentra un evento y continúa con la gestión de sus candidatos.</p></div><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={loading} className={SECONDARY}>Actualizar</button><Link to="/company/events/new" className="rounded-xl bg-[#0AADA8] px-4 py-3 text-sm font-semibold text-white hover:bg-[#089490] focus-visible:outline-teal-600">+ Nuevo evento</Link></div></header>

    <section aria-label="Filtros de eventos" className="mt-7 rounded-2xl border border-[#DDE5EC] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display font-bold text-[#10233A]">Encuentra un evento</h2>{hasFilters && <button type="button" onClick={clear} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#087D79] hover:bg-[#E8F7F6]">Limpiar filtros</button>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-semibold text-[#475569]">Buscar evento<input type="search" value={filters.query} onChange={(e) => update('q', e.target.value)} placeholder="Nombre, puesto, sede o descripción" className={CONTROL} /></label>
      <button type="button" aria-expanded={advancedOpen} aria-controls="event-advanced-filters" onClick={() => setAdvancedOpen((value) => !value)} className={`${SECONDARY} sm:hidden`}>{advancedOpen ? 'Ocultar filtros' : `Más filtros${activeCount ? ` (${activeCount})` : ''}`}</button>
      <div id="event-advanced-filters" className={`${advancedOpen ? 'grid' : 'hidden'} gap-4 sm:contents`}>
        <label className="text-xs font-semibold text-[#475569]">Modalidad<select value={filters.modality} onChange={(e) => update('modality', e.target.value)} className={CONTROL}><option value="all">Todas las modalidades</option><option value="online">Virtual</option><option value="onsite">Presencial</option></select></label>
        <label className="text-xs font-semibold text-[#475569]">Estado<select value={filters.status} onChange={(e) => update('status', e.target.value)} className={CONTROL}><option value="all">Todos los estados</option>{Object.entries(EVENT_STATES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#475569]">Módulos incluidos<select value={filters.module} onChange={(e) => update('module', e.target.value)} className={CONTROL}><option value="all">Todos los módulos</option><option value="A">Incluye Módulo A</option><option value="B">Incluye Módulo B</option><option value="C">Incluye Módulo C</option></select></label>
        <label className="text-xs font-semibold text-[#475569]">Fecha de habilitación<select value={filters.period} onChange={(e) => update('period', e.target.value)} className={CONTROL}>{Object.entries(PERIODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#475569]">Ordenar por<select value={filters.sort} onChange={(e) => update('sort', e.target.value)} className={CONTROL}><option value="recent">Fecha: más reciente primero</option><option value="upcoming">Fecha: más antigua primero</option><option value="name">Nombre: A–Z</option></select></label>
        {filters.period === 'custom' && <><label className="text-xs font-semibold text-[#475569]">Desde<input type="date" value={filters.from} max={filters.until || undefined} onChange={(e) => update('from', e.target.value)} aria-invalid={rangeError} aria-describedby={rangeError ? 'event-range-error' : undefined} className={CONTROL} /></label><label className="text-xs font-semibold text-[#475569]">Hasta<input type="date" value={filters.until} min={filters.from || undefined} onChange={(e) => update('until', e.target.value)} aria-invalid={rangeError} aria-describedby={rangeError ? 'event-range-error' : undefined} className={CONTROL} /></label></>}
      </div>
    </div><p className="mt-4 text-xs leading-5 text-[#64748B]">Las fechas corresponden al inicio de la sesión presencial o a la habilitación del evento virtual.</p>{rangeError && <p id="event-range-error" role="alert" className="mt-3 text-sm text-red-700">La fecha «Hasta» debe ser igual o posterior a «Desde».</p>}</section>

    {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 font-semibold underline">Reintentar</button></div>}
    {loading ? <div role="status" className="mt-8 flex min-h-52 items-center justify-center text-sm text-[#64748B]"><SpinnerIcon className="mr-2 h-5 w-5 animate-spin text-[#0AADA8]" />Cargando eventos...</div> : !error && <>
      <p role="status" className="mt-5 text-xs text-[#64748B]">{filtered.length} de {events.length} eventos{hasFilters ? ' · Filtros aplicados' : ''}</p>
      {filtered.length ? <div className="mt-4 space-y-4">{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((event) => {
        const status = EVENT_STATES[stateOf(event)];
        return <Link key={event.id} to={`/company/events/${encodeURIComponent(event.id)}`} aria-label={`Ver evento ${nameOf(event)}`} className="group flex w-full flex-col gap-4 rounded-2xl border border-[#E5EAF0] bg-white p-5 text-left shadow-sm transition hover:border-[#0AADA8]/50 hover:shadow-md focus-visible:outline-teal-600 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-display text-base font-bold text-[#101828]">{nameOf(event)}</h2><StatusBadge tone={isOnsite(event) ? 'warning' : 'info'}>{isOnsite(event) ? 'Presencial' : 'Virtual'}</StatusBadge></div><p className="mt-2 break-words text-sm leading-6 text-[#64748B]">{[positionOf(event), formatDate(event), isOnsite(event) ? event.onsite?.venue : null].filter(Boolean).join(' · ')}</p><div className="mt-3 flex flex-wrap gap-2">{modulesOf(event).map((module) => <span key={module} className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#64748B]">Módulo {module}</span>)}</div>{event.description && <p className="mt-3 line-clamp-2 break-words text-sm text-[#7C8AA0]">{event.description}</p>}</div><div className="flex shrink-0 flex-wrap items-center gap-3 self-start sm:self-auto"><StatusBadge tone={status.tone}>{status.label}</StatusBadge><span className="rounded-lg border border-[#DCE3EA] px-3 py-2 text-xs font-semibold text-[#334155]">Ver detalle <span aria-hidden="true">→</span></span></div></Link>;
      })}</div> : !rangeError && <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center"><h2 className="font-display text-lg font-bold text-[#334155]">{events.length ? 'No hay eventos que coincidan' : 'No hay eventos disponibles'}</h2><p className="mt-2 text-sm leading-6 text-[#64748B]">{events.length ? 'Ajusta la búsqueda o limpia los filtros para ver más eventos.' : 'Crea tu primer evento para empezar a gestionar candidatos.'}</p>{events.length ? <button type="button" onClick={clear} className={`${SECONDARY} mt-5`}>Restablecer filtros</button> : <Link to="/company/events/new" className="mt-5 inline-block text-sm font-semibold text-[#087D79] underline">Crear mi primer evento →</Link>}</div>}
      {pages > 1 && <nav aria-label="Páginas de eventos" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B]"><span>Página {page} de {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={SECONDARY}>Anterior</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={SECONDARY}>Siguiente</button></div></nav>}
    </>}
  </div></div>;
}
