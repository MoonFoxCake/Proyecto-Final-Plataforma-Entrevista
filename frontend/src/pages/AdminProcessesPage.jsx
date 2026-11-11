import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, BriefcaseIcon, SpinnerIcon } from '../components/auth/icons.jsx';
import * as adminReviewService from '../services/adminReviewService.js';
import {
  PHASE_REPORT_LABELS, RESULT_STATES, companyKey, filterProcesses, isClosed, pendingReports, phaseReports, processDate, processSummary, resultState,
} from './adminProcesses.js';

const INITIAL_FILTERS = {
  query: '', company: 'all', period: 'all', work: 'all', from: '', until: '', sort: 'recent',
};
const PAGE_SIZE = 6;
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8] focus-visible:ring-offset-2';
const CONTROL = 'w-full rounded-xl border border-[#DDE5EC] bg-white px-3 py-2.5 text-sm text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#0AADA8] focus:ring-offset-2';
const RESULT_COLORS = {
  PENDING: 'bg-amber-50 text-amber-800',
  IN_PROGRESS: 'bg-[#E0F7F6] text-[#087D79]',
  DELIVERED: 'bg-emerald-50 text-emerald-800',
  NOT_STARTED: 'bg-slate-100 text-slate-600',
};
const PHASE_COLORS = {
  DELIVERED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  IN_PROGRESS: 'border-[#BDE7E3] bg-[#F0FBFA] text-[#087D79]',
  NOT_STARTED: 'border-[#E5EAF0] bg-white text-[#94A3B8]',
};
const PHASE_NAMES = { A: 'Fase A', B: 'Fase B', C: 'Fase C' };

function formatDate(value) {
  const date = processDate(value);
  return date ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(date) : 'Sin fecha';
}

function FilterField({ label, id, children }) {
  return <div className="min-w-0">
    <label htmlFor={id} className="mb-2 block text-xs font-semibold text-[#475569]">{label}</label>
    {children}
  </div>;
}

function ProcessCard({ process }) {
  const { total, responses } = processSummary(process);
  const state = resultState(process);
  const pending = pendingReports(process);
  const future = !isClosed(process) && processDate(process.availableFrom) > new Date();

  return <article className="rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="break-words font-display text-lg font-bold text-[#101828]">{process.name || 'Proceso sin nombre'}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RESULT_COLORS[state]}`}>{RESULT_STATES[state]}</span>
          {future && <span className="text-xs font-medium text-[#64748B]">Programado</span>}
        </div>
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-[#475569]">
          <BriefcaseIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#0AADA8]" />
          <span className="break-words">{process.company || 'Empresa sin nombre'}</span>
        </p>
        <p className="mt-1 break-words text-sm text-[#64748B]">{process.position || 'Puesto sin especificar'} · {process.modality === 'onsite' ? 'Presencial' : 'Virtual'}</p>
      </div>
      <Link to={`/admin/processes/${encodeURIComponent(process.id)}`} aria-label={`Abrir resultados: ${process.name || 'Proceso sin nombre'}`}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${pending ? 'bg-[#0AADA8] text-white hover:bg-[#089490]' : 'border border-[#D9E2EA] bg-white text-[#334E68] hover:border-[#0AADA8]'} ${FOCUS}`}>
        {pending ? 'Revisar y entregar' : 'Abrir'} <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>

    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-[#64748B]">
      <div className="flex gap-1.5"><dt>Creado:</dt><dd className="font-medium text-[#475569]">{formatDate(process.createdAt)}</dd></div>
      <div className="flex gap-1.5"><dt>Inicio:</dt><dd className="font-medium text-[#475569]">{formatDate(process.availableFrom)}</dd></div>
      <div className="flex gap-1.5"><dt>Participantes:</dt><dd className="font-medium tabular-nums text-[#475569]">{total}</dd></div>
      <div className="flex gap-1.5"><dt>Respondieron la Fase A:</dt><dd className="font-medium tabular-nums text-[#475569]">{responses}</dd></div>
    </dl>
    <ul aria-label={`Resultados por fase de ${process.name || 'Proceso sin nombre'}`} className="mt-5 grid gap-2 border-t border-[#EEF2F6] pt-5 sm:grid-cols-3">
      {phaseReports(process).map(({ module, state: phase }) => <li key={module} className={`rounded-xl border px-3.5 py-2.5 text-xs ${PHASE_COLORS[phase]}`}>
        <span className="font-semibold">{PHASE_NAMES[module]}</span> · {PHASE_REPORT_LABELS[phase]}
      </li>)}
    </ul>
  </article>;
}

/**
 * Resultados: every process, with what each phase needs. A process opens its
 * anonymous participants, their answers and the PDF of each phase.
 */
export function AdminResultsView() {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    adminReviewService.getProcesses()
      .then((data) => { if (!cancelled) setProcesses(data); })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar los procesos. Intenta nuevamente.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const update = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const change = (key) => (event) => update(key, event.target.value);
  const reset = () => { setFilters(INITIAL_FILTERS); setPage(1); };
  const refresh = () => setRevision((value) => value + 1);
  const companyOptions = Array.from(new Map(processes.map((process) => [companyKey(process), process.company || 'Empresa sin nombre'])))
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const invalidDates = Boolean(filters.from && filters.until && filters.from > filters.until);
  const filtered = invalidDates ? [] : filterProcesses(processes, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters = Object.entries(INITIAL_FILTERS).some(([key, value]) => key !== 'sort' && filters[key] !== value);
  const pendingTotal = processes.reduce((total, process) => total + pendingReports(process), 0);
  const metrics = [
    ['PDF por entregar', pendingTotal, 'Fases terminadas que esperan su informe'],
    ['Procesos en curso', processes.filter((process) => resultState(process) === 'IN_PROGRESS').length, 'Con candidatos respondiendo'],
    ['Resultados entregados', processes.filter((process) => resultState(process) === 'DELIVERED').length, 'Procesos con todos sus PDF'],
    ['Total de procesos', processes.length, 'Todos los procesos registrados'],
  ];

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Resultados</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Revisa a ciegas las respuestas de cada proceso y entrega el PDF de cada fase. Al entregarlo, la empresa lo recibe y puede abrir la siguiente.</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading}
        className={`inline-flex items-center gap-2 rounded-xl border border-[#DDE5EC] bg-white px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F0FAFA] disabled:opacity-50 ${FOCUS}`}>
        {loading && <SpinnerIcon className="h-4 w-4 animate-spin" />}Actualizar
      </button>
    </header>

    {!loading && !error && pendingTotal > 0 && <button type="button" onClick={() => update('work', 'PENDING')}
      className={`mt-6 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900 hover:bg-amber-100/60 ${FOCUS}`}>
      <span><strong>{pendingTotal === 1 ? 'Hay 1 fase terminada' : `Hay ${pendingTotal} fases terminadas`}</strong> esperando su PDF.</span>
      <span className="font-semibold underline">Ver pendientes</span>
    </button>}

    <section aria-label="Resumen de resultados" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-[#DDE8F2] bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-[#64748B]">{label}</p>
        <p className={`mt-3 font-display text-3xl font-bold tabular-nums ${label === 'PDF por entregar' && value > 0 ? 'text-amber-700' : 'text-[#10233A]'}`}>{loading || error ? '—' : value}</p>
        <p className="mt-2 text-xs text-[#64748B]">{detail}</p>
      </div>)}
    </section>

    <section aria-labelledby="process-directory" className="mt-7 rounded-2xl border border-[#DDE8F2] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="process-directory" className="font-display text-lg font-bold text-[#10233A]">Procesos</h2>
          <p className="mt-1 text-sm text-[#64748B]">Encuentra un proceso o enfócate en lo que espera su PDF.</p></div>
        {hasFilters && <button type="button" onClick={reset} className={`rounded-md py-1 text-xs font-semibold text-[#087D79] hover:underline ${FOCUS}`}>Limpiar filtros</button>}
      </div>
      <div role="group" aria-label="Filtrar por estado de los resultados" className="mt-5 flex flex-wrap gap-2">
        {[['all', 'Todos'], ['PENDING', 'PDF por entregar'], ['IN_PROGRESS', 'En curso'], ['DELIVERED', 'Entregados']].map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filters.work === value} onClick={() => update('work', value)}
            className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${FOCUS} ${filters.work === value ? 'border-[#A7E4DE] bg-[#E0F7F6] text-[#087D79]' : 'border-[#E5EAF0] text-[#64748B] hover:bg-[#F7F9FC]'}`}>{label}</button>)}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterField label="Buscar proceso" id="process-search"><input id="process-search" type="search" value={filters.query} onChange={change('query')} placeholder="Nombre, empresa o puesto…" className={CONTROL} /></FilterField>
        <FilterField label="Empresa" id="process-company"><select id="process-company" value={filters.company} onChange={change('company')} className={CONTROL}>
          <option value="all">Todas las empresas</option>{companyOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></FilterField>
        <FilterField label="Vigencia" id="process-period"><select id="process-period" value={filters.period} onChange={change('period')} className={CONTROL}>
          <option value="all">Activos e históricos</option><option value="current">Activos y programados</option><option value="previous">Anteriores</option>
        </select></FilterField>
        <FilterField label="Ordenar por" id="process-sort"><select id="process-sort" value={filters.sort} onChange={change('sort')} className={CONTROL}>
          <option value="recent">Más reciente</option><option value="oldest">Más antiguo</option><option value="pending">Más PDF por entregar</option><option value="name">Nombre del proceso (A–Z)</option>
        </select></FilterField>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FilterField label="Fecha de inicio desde" id="process-from"><input id="process-from" type="date" value={filters.from} onChange={change('from')} aria-invalid={invalidDates} aria-describedby={invalidDates ? 'process-date-error' : undefined} className={CONTROL} /></FilterField>
        <FilterField label="Fecha de inicio hasta" id="process-until"><input id="process-until" type="date" value={filters.until} onChange={change('until')} aria-invalid={invalidDates} aria-describedby={invalidDates ? 'process-date-error' : undefined} className={CONTROL} /></FilterField>
      </div>
      {invalidDates && <p id="process-date-error" role="alert" className="mt-3 text-sm text-red-700">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
    </section>

    <section aria-label="Resultados de procesos" aria-busy={loading} className="mt-6">
      {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#64748B]"><SpinnerIcon className="h-5 w-5 animate-spin" />Cargando procesos…</div>
        : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={refresh} className={`mt-4 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 ${FOCUS}`}>Reintentar</button></div>
          : !invalidDates && <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
              <p role="status">{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} de ${filtered.length}` : '0'} {filtered.length === 1 ? 'proceso' : 'procesos'}{hasFilters ? ` · ${processes.length} en total` : ''}</p>
            </div>
            <div className="grid gap-4">{visible.map((process) => <ProcessCard key={process.id} process={process} />)}</div>
            {visible.length === 0 && <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center">
              <BriefcaseIcon aria-hidden="true" className="mx-auto h-8 w-8 text-[#94A3B8]" />
              <h3 className="mt-4 text-sm font-semibold text-[#475569]">{processes.length === 0 ? 'Aún no hay procesos registrados' : 'No encontramos procesos con estos filtros'}</h3>
              <p className="mt-2 text-sm text-[#64748B]">{processes.length === 0 ? 'Los procesos aparecerán aquí cuando las empresas los creen.' : 'Ajusta la búsqueda o limpia los filtros para ver todos los procesos.'}</p>
              {hasFilters && <button type="button" onClick={reset} className={`mt-4 rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] ${FOCUS}`}>Ver todos los procesos</button>}
            </div>}
            {pages > 1 && <nav aria-label="Páginas de procesos" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DDE8F2] bg-white p-4">
              <p className="text-xs text-[#64748B]">Página {currentPage} de {pages}</p>
              <div className="flex gap-2">{[['Anterior', currentPage - 1, currentPage === 1], ['Siguiente', currentPage + 1, currentPage === pages]].map(([label, target, disabled]) =>
                <button key={label} type="button" disabled={disabled} onClick={() => setPage(target)} className={`rounded-xl border border-[#DDE5EC] px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F0FAFA] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}>{label}</button>)}
              </div>
            </nav>}
          </>}
    </section>
  </div></div>;
}
