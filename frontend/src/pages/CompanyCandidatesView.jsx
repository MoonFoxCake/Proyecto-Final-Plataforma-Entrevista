import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/ui';
import { CaseBankDialog } from '../components/admin/CaseBankDialog.jsx';
import * as eventService from '../services/eventService.js';
import { isOnsite } from '../utils/eventModality.js';
import { CANDIDATE_STATES, appointmentOf, asDate, candidateState, eventName, filterCandidateRows, moduleIncluded, positionName, stateLabel } from './companyCandidates.js';

const CONTROL = 'mt-1.5 w-full rounded-xl border border-[#DDE5EC] bg-white px-3 py-2.5 text-sm font-normal text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/40';
const SECONDARY = 'rounded-xl border border-[#DDE5EC] bg-white px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F6F9FC] focus-visible:outline-teal-600 disabled:opacity-50';
const PRIMARY = 'rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] focus-visible:outline-teal-600 disabled:opacity-50';
const PAGE_SIZE = 10;
const formatDate = (value) => { const date = asDate(value); return date ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Sin cita configurada'; };
const initials = (name = '') => name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CA';
const eventPath = (event) => `/company/events/${encodeURIComponent(event.id)}`;

export function CompanyCandidatesView() {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedEvents, setFailedEvents] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setFailedEvents([]);
    (async () => {
      try {
        const available = await eventService.getEvents();
        if (!active) return;
        const loaded = [];
        const failed = [];
        let next = 0;
        // Bound requests for organizations with many events; filtering is local.
        await Promise.all(Array.from({ length: Math.min(4, available.length) }, async () => {
          while (active && next < available.length) {
            const event = available[next++];
            try {
              const candidates = await eventService.getEventCandidates(event.id);
              candidates.forEach((candidate) => loaded.push({ key: `${event.id}:${candidate.id}`, candidate, event }));
            } catch { failed.push(event); }
          }
        }));
        if (active) { setEvents(available); setRows(loaded); setFailedEvents(failed); }
      } catch { if (active) { setError('No pudimos cargar los candidatos de tu empresa. Inténtalo de nuevo.'); setEvents([]); setRows([]); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [attempt]);

  const module = ['A', 'B', 'C'].includes(params.get('module')) ? params.get('module') : 'A';
  const statusOptions = ['pending', 'invited', ...(module === 'A' ? ['review', 'published'] : ['completed']), 'withdrawn', 'failed', 'unknown'];
  const filters = { query: params.get('q') || '', event: params.get('event') || 'all', modality: ['online', 'onsite'].includes(params.get('modality')) ? params.get('modality') : 'all', module, status: statusOptions.includes(params.get('status')) ? params.get('status') : 'all', sort: ['recent', 'appointment'].includes(params.get('sort')) ? params.get('sort') : 'name' };
  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    next.set('section', 'candidates'); next.delete('page');
    if (!value || value === 'all' || (key === 'module' && value === 'A') || (key === 'sort' && value === 'name')) next.delete(key); else next.set(key, value);
    if (key === 'module') next.delete('status');
    return next;
  }, { replace: true });
  const clear = () => setParams({ section: 'candidates' }, { replace: true });
  const filtered = filterCandidateRows(rows, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rawPage = Number(params.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, pages) : 1;
  const setPage = (value) => setParams((current) => { const next = new URLSearchParams(current); next.set('page', String(value)); return next; });
  const forModule = rows.filter((row) => moduleIncluded(row, module));
  const completed = forModule.filter((row) => ['review', 'published', 'completed'].includes(candidateState(row, module))).length;
  const pending = forModule.filter((row) => candidateState(row, module) === 'pending').length;
  const hasFilters = filters.query || filters.event !== 'all' || filters.modality !== 'all' || filters.status !== 'all' || module !== 'A' || filters.sort !== 'name';
  const writableEvents = events.filter((event) => event.status !== 'PUBLISHED' && !event.evaluationsPublishedAt);
  const showRow = (row) => setDetail(row);

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Portal empresa</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Candidatos</h1><p className="mt-2 text-sm leading-6 text-[#64748B]">Consulta a los participantes de tus eventos, sigue su avance y encuentra el proceso que necesitas gestionar.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={loading} className={SECONDARY}>Actualizar</button><button type="button" disabled={loading || Boolean(error)} onClick={() => { setAdding(true); setSelectedEvent(''); }} className={PRIMARY}>+ Agregar candidatos</button></div></header>

    <section aria-label={`Resumen del Módulo ${module}`} className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">{[['Participaciones', forModule.length, `En eventos con Módulo ${module}`], ['Evaluaciones completadas', completed, module === 'A' ? 'En revisión o evaluadas' : `Módulo ${module} respondido`], ['Pendientes de invitación', pending, 'Aún sin invitación o citación enviada']].map(([label, value, hint]) => <div key={label} className="min-w-0 rounded-2xl border border-[#DDE5EC] bg-white p-3 shadow-sm sm:p-5"><p className="min-h-8 text-xs font-semibold text-[#64748B] sm:min-h-0">{label}</p><p className="mt-2 font-display text-2xl font-bold text-[#10233A]">{loading || error || (failedEvents.length && !rows.length) ? '—' : value}</p><p className="mt-1 hidden text-xs leading-5 text-[#64748B] sm:block">{hint}</p></div>)}</section>

    <section aria-label="Filtros de candidatos" className="mt-6 rounded-2xl border border-[#DDE5EC] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display font-bold text-[#10233A]">Encuentra un candidato</h2>{hasFilters && <button type="button" onClick={clear} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#087D79] hover:bg-[#E8F7F6]">Limpiar filtros</button>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-semibold text-[#475569]">Buscar<input type="search" value={filters.query} onChange={(e) => update('q', e.target.value)} placeholder="Nombre, correo, cédula o evento" className={CONTROL} /></label>
      <button type="button" aria-expanded={advancedOpen} aria-controls="candidate-advanced-filters" onClick={() => setAdvancedOpen((value) => !value)} className={`${SECONDARY} sm:hidden`}>{advancedOpen ? 'Ocultar filtros' : 'Más filtros'}</button>
      <div id="candidate-advanced-filters" className={`${advancedOpen ? 'grid' : 'hidden'} gap-4 sm:contents`}>
      <label className="text-xs font-semibold text-[#475569]">Evento<select value={filters.event} onChange={(e) => update('event', e.target.value)} className={CONTROL}><option value="all">Todos los eventos</option>{[...events].sort((a, b) => eventName(a).localeCompare(eventName(b), 'es')).map((event) => <option key={event.id} value={event.id}>{eventName(event)}{positionName(event) ? ` · ${positionName(event)}` : ''}</option>)}</select></label>
      <label className="text-xs font-semibold text-[#475569]">Modalidad<select value={filters.modality} onChange={(e) => update('modality', e.target.value)} className={CONTROL}><option value="all">Todas las modalidades</option><option value="online">Virtual</option><option value="onsite">Presencial</option></select></label>
      <label className="text-xs font-semibold text-[#475569]">Módulo<select value={module} onChange={(e) => update('module', e.target.value)} className={CONTROL}><option value="A">A · Perfil inicial</option><option value="B">B · Macrocaso</option><option value="C">C · Microcasos</option></select></label>
      <label className="text-xs font-semibold text-[#475569]">Estado del Módulo {module}<select value={filters.status} onChange={(e) => update('status', e.target.value)} className={CONTROL}><option value="all">Todos los estados</option>{statusOptions.map((status) => <option key={status} value={status}>{status === 'pending' ? 'Pendiente de invitación o citación' : status === 'invited' ? 'Invitación o citación enviada' : CANDIDATE_STATES[status].label}</option>)}</select></label>
      <label className="text-xs font-semibold text-[#475569]">Ordenar por<select value={filters.sort} onChange={(e) => update('sort', e.target.value)} className={CONTROL}><option value="name">Nombre: A–Z</option><option value="recent">Registros más recientes</option><option value="appointment">Fecha de cita: ascendente</option></select></label>
    </div></div><p className="mt-4 text-xs leading-5 text-[#64748B]">El estado y la fecha corresponden al módulo seleccionado. Una persona aparece una vez por cada evento en el que participa.</p></section>

    {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 font-semibold underline">Reintentar</button></div>}
    {!loading && failedEvents.length > 0 && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Se muestran datos parciales</p><p className="mt-1 leading-6">No pudimos cargar los candidatos de: {failedEvents.map(eventName).join(', ')}. Los totales incluyen solo los eventos cargados.</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 font-semibold underline">Reintentar carga</button></div>}
    {loading ? <div role="status" className="py-16 text-center text-sm text-[#64748B]">Cargando candidatos de tus eventos…</div> : !error && <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]"><p role="status">{filtered.length} de {forModule.length} participaciones · Módulo {module}</p><p>{events.length - failedEvents.length} de {events.length} eventos cargados</p></div>
      {filtered.length > 0 ? <div className="mt-3 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm"><div aria-hidden="true" className="hidden gap-4 border-b border-[#E8EDF2] bg-[#FAFBFC] px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#718096] lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem]"><span>Candidato</span><span>Evento</span><span>Estado · {module}</span><span>Cita · {module}</span><span>Detalle</span></div>{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row) => <article key={row.key} aria-label={`${row.candidate.nombreCompleto} · ${eventName(row.event)}`} className="grid gap-4 border-b border-[#EEF2F6] p-5 last:border-0 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem] lg:items-center">
        <div className="flex min-w-0 items-start gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7F7F6] text-xs font-bold text-[#087D79]">{initials(row.candidate.nombreCompleto)}</span><div className="min-w-0"><h2 className="break-words text-sm font-semibold text-[#101828]">{row.candidate.nombreCompleto || 'Sin nombre'}</h2><p className="mt-1 break-all text-xs text-[#64748B]">{row.candidate.correo || 'Sin correo'}</p><p className="mt-1 text-xs text-[#64748B]">Cédula: {row.candidate.cedula || 'No registrada'}</p></div></div>
        <div className="min-w-0"><p className="break-words text-sm font-semibold text-[#475569]">{eventName(row.event)}</p>{positionName(row.event) && <p className="mt-1 break-words text-xs text-[#64748B]">{positionName(row.event)}</p>}<p className="mt-1 text-xs text-[#64748B]">{isOnsite(row.event) ? 'Presencial' : 'Virtual'}</p></div>
        <div className="min-w-0 [&>span]:whitespace-normal"><p className="mb-1 text-xs text-[#64748B] lg:hidden">Estado · Módulo {module}</p><StatusBadge tone={CANDIDATE_STATES[candidateState(row, module)].tone}>{stateLabel(row, module)}</StatusBadge></div>
        <div><p className="mb-1 text-xs text-[#64748B] lg:hidden">Cita · Módulo {module}</p><p className="text-xs leading-5 text-[#64748B]">{formatDate(appointmentOf(row, module))}</p></div>
        <button type="button" onClick={() => showRow(row)} className="justify-self-start rounded-lg border border-[#D9E2EA] px-3 py-2 text-xs font-semibold text-[#087D79] hover:bg-[#E8F7F6]">Ver detalle</button>
      </article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center"><h2 className="font-display text-lg font-bold text-[#10233A]">{hasFilters ? 'Sin coincidencias' : failedEvents.length ? 'Carga incompleta' : 'Aún no hay candidatos'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748B]">{hasFilters ? 'Prueba otro nombre, evento o estado, o limpia los filtros para ampliar la búsqueda.' : failedEvents.length ? 'Vuelve a intentar la carga para consultar los participantes de tus eventos.' : 'Agrega participantes a un evento para consultar aquí su avance en las evaluaciones.'}</p>{hasFilters ? <button type="button" onClick={clear} className={`${SECONDARY} mt-5`}>Restablecer filtros</button> : !failedEvents.length && <Link to={events.length ? '/company-dashboard?section=events' : '/company/events/new'} className={`${PRIMARY} mt-5 inline-block`}>{events.length ? 'Ir a eventos' : 'Crear un evento'}</Link>}</div>}
      {pages > 1 && <nav aria-label="Páginas de candidatos" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B]"><p>Página {page} de {pages}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={SECONDARY}>Anterior</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={SECONDARY}>Siguiente</button></div></nav>}
    </>}

    {detail && <CaseBankDialog title="Detalle del candidato" description={eventName(detail.event)} onClose={() => setDetail(null)} footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setDetail(null)} className={SECONDARY}>Cerrar</button><Link to={`${eventPath(detail.event)}/${module === 'A' ? 'candidatos' : 'resultados'}`} className={PRIMARY}>Gestionar en evento →</Link></div>}><h3 className="break-words font-display text-lg font-bold text-[#10233A]">{detail.candidate.nombreCompleto}</h3><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{[['Correo', detail.candidate.correo], ['Cédula', detail.candidate.cedula], ['Puesto', positionName(detail.event)], ['Modalidad', isOnsite(detail.event) ? 'Presencial' : 'Virtual']].map(([label, value]) => <div key={label}><dt className="text-xs text-[#64748B]">{label}</dt><dd className="mt-1 break-words text-[#334E68]">{value || 'No registrado'}</dd></div>)}</dl><h4 className="mt-6 text-sm font-bold text-[#10233A]">Avance por módulo</h4><div className="mt-3 space-y-3">{['A', 'B', 'C'].filter((stage) => moduleIncluded(detail, stage)).map((stage) => <div key={stage} className="rounded-xl bg-[#F6F9FC] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#334E68]">Módulo {stage}</p><StatusBadge tone={CANDIDATE_STATES[candidateState(detail, stage)].tone}>{stateLabel(detail, stage)}</StatusBadge></div><p className="mt-2 text-xs text-[#64748B]">Cita: {formatDate(appointmentOf(detail, stage))}</p></div>)}</div></CaseBankDialog>}
    {adding && <CaseBankDialog title="Agregar candidatos" onClose={() => setAdding(false)} footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => setAdding(false)} className={SECONDARY}>Cancelar</button>{selectedEvent && <Link to={`/company/events/${encodeURIComponent(selectedEvent)}/candidatos?nuevo=1`} className={PRIMARY}>Continuar al evento →</Link>}</div>}><p className="text-sm leading-6 text-[#64748B]">Selecciona el evento en el que participarán. El registro se realiza dentro de ese proceso.</p>{writableEvents.length ? <label className="mt-5 block text-xs font-semibold text-[#475569]">Evento para agregar candidatos<select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)} className={CONTROL}><option value="">Selecciona un evento</option>{writableEvents.map((event) => <option key={event.id} value={event.id}>{eventName(event)}{positionName(event) ? ` · ${positionName(event)}` : ''}</option>)}</select></label> : <div className="mt-5 rounded-xl bg-[#F6F9FC] p-4 text-sm text-[#64748B]"><p>No hay eventos abiertos para registrar candidatos. Los eventos con resultados publicados ya están cerrados para nuevos registros.</p><Link to="/company/events/new" className="mt-3 inline-block font-semibold text-[#087D79]">Crear un evento →</Link></div>}</CaseBankDialog>}
  </div></div>;
}
