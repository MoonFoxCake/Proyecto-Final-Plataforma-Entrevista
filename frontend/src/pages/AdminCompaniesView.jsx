import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, BriefcaseIcon, SpinnerIcon, UserIcon } from '../components/auth/icons.jsx';
import * as authService from '../services/authService.js';
import * as adminReviewService from '../services/adminReviewService.js';

const PLANS = { 'fase-a': 'Fase A', 'fase-a-b': 'Fases A + B', completo: 'Completo' };
const STATUSES = { ACTIVE: 'Activo', IN_REVIEW: 'En revisión', READY_TO_PUBLISH: 'Listo para publicar', PUBLISHED: 'Publicado', FINALIZED: 'Finalizado' };
const PAGE_SIZE = 8;
const controlClass = 'rounded-xl border border-[#DDE5EC] bg-white px-3 py-2.5 text-sm text-[#475569] focus:outline-none focus:ring-2 focus:ring-[#0AADA8] focus:ring-offset-2';
const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8] focus-visible:ring-offset-2';
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const companyName = (company) => company.companyName || company.name || 'Empresa sin nombre';
const usersOf = (company) => company.users || [];

function asDate(value) {
  if (!value) return null;
  // Calendar-only dates must keep their day in the viewer's local timezone.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = `${value}T00:00:00`;
  const date = value.toDate ? value.toDate() : new Date(value._seconds != null || value.seconds != null ? (value._seconds ?? value.seconds) * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(value) {
  const date = asDate(value);
  return date ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(date) : 'Sin fecha';
}

export function isPreviousProcess(process, now = new Date()) {
  const end = asDate(process.endDate);
  return Boolean(process.evaluationsPublishedAt || ['PUBLISHED', 'FINALIZED'].includes(process.status) || (end && end < now));
}

function processLabel(process) {
  if (STATUSES[process.status] && process.status !== 'ACTIVE') return STATUSES[process.status];
  if (isPreviousProcess(process)) return 'Finalizado';
  if (asDate(process.availableFrom) > new Date()) return 'Programado';
  return STATUSES[process.status] || 'Estado sin especificar';
}

function CompanyDetail({ company, processes, processError, onRetry }) {
  const [filter, setFilter] = useState('active');
  const previous = processes.filter((process) => isPreviousProcess(process));
  const active = processes.filter((process) => !isPreviousProcess(process));
  const visible = filter === 'all' ? processes : filter === 'active' ? active : previous;

  return <div className="grid gap-6 border-t border-[#E5EAF0] bg-[#FAFCFE] p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    <section aria-label={`Usuarios de ${companyName(company)}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#10233A]"><UserIcon className="h-4 w-4 text-[#0AADA8]" /> Usuarios <span className="font-normal text-[#64748B]">({usersOf(company).length})</span></h3>
      <div className="mt-4 space-y-3">
        {usersOf(company).map((user) => <div key={user.id || user.email} className="flex items-start gap-3 rounded-xl border border-[#E5EAF0] bg-white p-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#112D4E] text-xs font-bold text-white">{(user.displayName || user.email || 'U').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-[#10233A]">{user.displayName || 'Usuario sin nombre'}</p><p className="mt-0.5 break-all text-xs text-[#64748B]">{user.email || 'Sin correo registrado'}</p>{user.phone && <p className="mt-1 text-xs text-[#64748B]">{user.phone}</p>}</div>
        </div>)}
        {usersOf(company).length === 0 && <p className="text-sm text-[#64748B]">Esta empresa aún no tiene usuarios asociados.</p>}
      </div>
    </section>
    <section aria-label={`Procesos de ${companyName(company)}`} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-[#10233A]">Procesos de evaluación</h3>
        {!processError && <div className="flex flex-wrap gap-1 rounded-xl border border-[#E5EAF0] bg-white p-1" role="group" aria-label="Filtrar procesos">
          {[['active', 'Activos', active.length], ['previous', 'Anteriores', previous.length], ['all', 'Todos', processes.length]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${focusClass} ${filter === value ? 'bg-[#E0F7F6] text-[#087D79]' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`}>{label} <span className="ml-1 tabular-nums">{count}</span></button>)}
        </div>}
      </div>
      {processError ? <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No se pudieron cargar los procesos. <button type="button" onClick={onRetry} className={`font-semibold underline ${focusClass}`}>Reintentar</button></div> : <>
        <p className="mt-3 text-xs text-[#64748B]">{filter === 'active' ? 'Incluye procesos programados y en curso.' : filter === 'previous' ? 'Procesos publicados, finalizados o cuya fecha de cierre ya pasó.' : 'Todo el historial de procesos de esta empresa.'}</p>
        <div className="mt-3 space-y-3">
          {visible.map((process) => <article key={process.id} className="rounded-xl border border-[#E5EAF0] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="min-w-0 break-words text-sm font-semibold text-[#10233A]">{process.name}</h4><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isPreviousProcess(process) ? 'bg-[#EEF2F6] text-[#475569]' : 'bg-[#E0F7F6] text-[#087D79]'}`}>{processLabel(process)}</span></div>
            <p className="mt-1 break-words text-xs text-[#64748B]">{process.position || 'Puesto sin especificar'}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><div><dt className="text-[#64748B]">Inicio</dt><dd className="mt-1 font-medium text-[#334155]">{dateLabel(process.availableFrom)}</dd></div><div><dt className="text-[#64748B]">Cierre</dt><dd className="mt-1 font-medium text-[#334155]">{dateLabel(process.endDate)}</dd></div><div><dt className="text-[#64748B]">Participantes</dt><dd className="mt-1 font-medium text-[#334155]">{process.summary?.totalParticipants ?? 0}</dd></div></dl>
            <div className="mt-4 flex justify-end border-t border-[#EEF2F6] pt-3"><Link to={`/admin/processes/${encodeURIComponent(process.id)}`} className={`inline-flex items-center gap-2 rounded-md text-xs font-semibold text-[#087D79] hover:underline ${focusClass}`}>Ver proceso <ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></Link></div>
          </article>)}
          {visible.length === 0 && <div className="rounded-xl border border-dashed border-[#CBD5E1] p-7 text-center"><BriefcaseIcon aria-hidden="true" className="mx-auto h-6 w-6 text-[#94A3B8]" /><p className="mt-3 text-sm font-medium text-[#475569]">{processes.length === 0 ? 'Esta empresa aún no tiene procesos.' : filter === 'active' ? 'No hay procesos activos.' : 'No hay procesos anteriores.'}</p>{processes.length > 0 && <button type="button" onClick={() => setFilter('all')} className={`mt-3 rounded-md text-xs font-semibold text-[#087D79] hover:underline ${focusClass}`}>Ver todos los procesos</button>}</div>}
        </div>
      </>}
    </section>
  </div>;
}

export function CompaniesView() {
  const [companies, setCompanies] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyError, setCompanyError] = useState(false);
  const [processError, setProcessError] = useState(false);
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState('all');
  const [activity, setActivity] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([authService.getCompanies(), adminReviewService.getProcesses()]).then(([companyResult, processResult]) => {
      if (cancelled) return;
      setCompanyError(companyResult.status === 'rejected');
      setProcessError(processResult.status === 'rejected');
      if (processResult.status === 'rejected') setActivity('all');
      setCompanies(companyResult.status === 'fulfilled' ? companyResult.value : []);
      setProcesses(processResult.status === 'fulfilled' ? processResult.value : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [revision]);

  const retry = () => setRevision((value) => value + 1);
  // Join by stable organization IDs: different companies can share the same name.
  const byCompany = new Map();
  processes.forEach((process) => {
    if (!byCompany.has(process.orgId)) byCompany.set(process.orgId, []);
    byCompany.get(process.orgId).push(process);
  });
  const filtered = companies.filter((company) => {
    const companyProcesses = byCompany.get(company.id) || [];
    const matchesSearch = normalize([companyName(company), ...usersOf(company).flatMap((user) => [user.displayName, user.email])].join(' ')).includes(normalize(query.trim()));
    return matchesSearch && (plan === 'all' || (company.subscription?.planId || 'fase-a') === plan)
      && (activity === 'all' || (activity === 'active' && companyProcesses.some((process) => !isPreviousProcess(process))) || (activity === 'previous' && companyProcesses.some((process) => isPreviousProcess(process))) || (activity === 'none' && companyProcesses.length === 0));
  }).sort((a, b) => companyName(a).localeCompare(companyName(b), 'es', { sensitivity: 'base' }));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const reset = () => { setQuery(''); setPlan('all'); setActivity('all'); setPage(1); };
  const changeFilter = (setter) => (event) => { setter(event.target.value); setPage(1); };
  const metrics = [
    ['Empresas registradas', companyError ? '—' : companies.length, 'Organizaciones en la plataforma'],
    ['Usuarios de empresa', companyError ? '—' : companies.reduce((total, company) => total + usersOf(company).length, 0), 'Cuentas asociadas a las empresas'],
    ['Procesos activos', processError ? '—' : processes.filter((process) => !isPreviousProcess(process)).length, 'Programados y en curso'],
    ['Procesos anteriores', processError ? '—' : processes.filter((process) => isPreviousProcess(process)).length, 'Finalizados, publicados o cerrados'],
  ];

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Empresas</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Consulta las empresas registradas, sus usuarios y el historial de sus procesos de evaluación.</p></div><button type="button" onClick={retry} disabled={loading} className={`${controlClass} inline-flex items-center gap-2 font-semibold hover:bg-[#F0FAFA] disabled:opacity-50`}>{loading && <SpinnerIcon className="h-4 w-4 animate-spin" />}Actualizar</button></header>
    <section aria-label="Resumen de empresas" className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-[#DDE8F2] bg-white p-5 shadow-sm"><p className="text-sm font-medium text-[#64748B]">{label}</p><p className={`mt-3 font-display text-3xl font-bold tabular-nums ${label === 'Procesos activos' ? 'text-[#087D79]' : 'text-[#10233A]'}`}>{loading ? '—' : value}</p><p className="mt-2 text-xs text-[#64748B]">{detail}</p></div>)}</section>
    <section aria-labelledby="directory-heading" aria-busy={loading} className="mt-7 rounded-2xl border border-[#DDE8F2] bg-white shadow-sm">
      <div className="border-b border-[#EEF2F6] p-5 sm:p-6"><h2 id="directory-heading" className="font-display text-lg font-bold text-[#10233A]">Directorio de empresas</h2><p className="mt-1 text-sm text-[#64748B]">Selecciona una empresa para consultar sus usuarios y procesos.</p>
        <div className="mt-5 grid items-end gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"><div><label htmlFor="company-search" className="mb-2 block text-xs font-semibold text-[#475569]">Buscar empresa o usuario</label><input id="company-search" type="search" value={query} onChange={changeFilter(setQuery)} placeholder="Nombre de empresa, usuario o correo…" className={`${controlClass} w-full`} /></div><div><label htmlFor="company-plan" className="mb-2 block text-xs font-semibold text-[#475569]">Plan contratado</label><select id="company-plan" value={plan} onChange={changeFilter(setPlan)} className={`${controlClass} w-full`}><option value="all">Todos los planes</option>{Object.entries(PLANS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div><div><label htmlFor="company-activity" className="mb-2 block text-xs font-semibold text-[#475569]">Actividad de procesos</label><select id="company-activity" value={processError ? 'all' : activity} disabled={processError} onChange={changeFilter(setActivity)} className={`${controlClass} w-full disabled:opacity-50`}><option value="all">Todas las empresas</option><option value="active">Con procesos activos</option><option value="previous">Con procesos anteriores</option><option value="none">Sin procesos</option></select></div></div>
      </div>
      {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#64748B]"><SpinnerIcon className="h-5 w-5 animate-spin" />Cargando empresas y procesos…</div> : companyError ? <div role="alert" className="p-10 text-center"><p className="text-sm text-red-700">No se pudieron cargar las empresas.</p><button type="button" onClick={retry} className={`${controlClass} mt-4 font-semibold`}>Reintentar</button></div> : <>
        {processError && <div role="alert" className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Los usuarios están disponibles, pero no se pudieron cargar los procesos. <button type="button" onClick={retry} className={`font-semibold underline ${focusClass}`}>Reintentar</button></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-6"><p role="status" className="text-xs text-[#64748B]">{filtered.length} de {companies.length} empresas</p>{(query || plan !== 'all' || activity !== 'all') && <button type="button" onClick={reset} className={`rounded-md text-xs font-semibold text-[#087D79] hover:underline ${focusClass}`}>Limpiar filtros</button>}</div>
        <div className="space-y-3 px-3 pb-5 sm:px-6">{visible.map((company) => {
          const companyProcesses = byCompany.get(company.id) || [];
          const activeCount = companyProcesses.filter((process) => !isPreviousProcess(process)).length;
          const previousCount = companyProcesses.length - activeCount;
          const open = expanded === company.id;
          return <article key={company.id} className={`overflow-hidden rounded-xl border transition ${open ? 'border-[#9BDDD8] shadow-sm' : 'border-[#E5EAF0]'}`}>
            <h3><button type="button" aria-expanded={open} aria-controls={`company-${company.id}`} onClick={() => setExpanded(open ? null : company.id)} className={`flex w-full flex-col gap-4 p-5 text-left transition hover:bg-[#F7FBFC] sm:flex-row sm:items-center sm:justify-between ${focusClass} focus-visible:ring-inset`}>
              <span className="flex min-w-0 items-center gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${open ? 'bg-[#0AADA8] text-white' : 'bg-[#E0F7F6] text-[#087D79]'}`}><BriefcaseIcon aria-hidden="true" className="h-5 w-5" /></span><span className="min-w-0"><span className="block break-words text-sm font-bold text-[#10233A]">{companyName(company)}</span><span className="mt-1 block text-xs font-normal text-[#64748B]">Plan {PLANS[company.subscription?.planId || 'fase-a'] || company.subscription.planId} <span aria-hidden="true">·</span> {usersOf(company).length} {usersOf(company).length === 1 ? 'usuario' : 'usuarios'}</span></span></span>
              <span className="flex shrink-0 flex-wrap items-center gap-3 pl-14 text-xs sm:pl-0"><span className="rounded-full bg-[#E0F7F6] px-2.5 py-1 font-medium text-[#087D79]">{processError ? '—' : activeCount} {activeCount === 1 ? 'activo' : 'activos'}</span><span className="font-normal text-[#64748B]">{processError ? '—' : previousCount} {previousCount === 1 ? 'anterior' : 'anteriores'}</span><span className="inline-flex items-center gap-2 font-semibold text-[#087D79]">{open ? 'Ocultar' : 'Ver detalle'}<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span></span>
            </button></h3>
            <div id={`company-${company.id}`} hidden={!open}>{open && <CompanyDetail company={company} processes={companyProcesses} processError={processError} onRetry={retry} />}</div>
          </article>;
        })}{visible.length === 0 && <div className="rounded-xl border border-dashed border-[#CBD5E1] px-5 py-12 text-center"><BriefcaseIcon aria-hidden="true" className="mx-auto h-8 w-8 text-[#94A3B8]" /><h3 className="mt-4 text-sm font-semibold text-[#475569]">{companies.length === 0 ? 'Aún no hay empresas registradas' : 'No encontramos empresas con estos filtros'}</h3><p className="mt-2 text-sm text-[#64748B]">{companies.length === 0 ? 'Las empresas aparecerán aquí cuando se registren en la plataforma.' : 'Prueba con otro nombre, correo o plan.'}</p></div>}</div>
        {pages > 1 && <nav aria-label="Páginas de empresas" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF2F6] p-5 sm:px-6"><p className="text-xs text-[#64748B]">Página {currentPage} de {pages}</p><div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={`${controlClass} disabled:cursor-not-allowed disabled:opacity-40`}>Anterior</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={`${controlClass} disabled:cursor-not-allowed disabled:opacity-40`}>Siguiente</button></div></nav>}
      </>}
    </section>
  </div></div>;
}
