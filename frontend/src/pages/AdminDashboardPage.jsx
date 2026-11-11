import { AdminAccountsPage } from './AdminAccountsPage.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { canSection } from '../utils/adminPermissions.js';
import { AdminQuestionBankPage } from './AdminQuestionBankPage.jsx';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  AdminSidebar,
  ADMIN_SECTIONS,
} from '../components/admin/AdminSidebar.jsx';

import { CompaniesView } from './AdminCompaniesView.jsx';

import * as authService from '../services/authService';
import { AdminProcessesView } from './AdminProcessesPage.jsx';
import { AdminMacrocasesPage } from './AdminMacrocasesPage.jsx';
import { AdminMicrocasesPage } from './AdminMicrocasesPage.jsx';
import { AdminResultsPage } from './AdminResultsPage.jsx';
import { AdminSettingsPage } from './AdminSettingsPage.jsx';
import { BarChart, ChartCard, ColumnChart } from '../components/ui/Charts.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

const PLAN_LABELS = { 'fase-a': 'Fase A', 'fase-a-b': 'Fases A + B', completo: 'Completo' };
// Firestore timestamps arrive through the API as `{ _seconds, _nanoseconds }`.
const asDate = (value) => { if (!value) return null; const d = value?.toDate ? value.toDate() : new Date(value._seconds != null || value.seconds != null ? (value._seconds ?? value.seconds) * 1000 : value); return Number.isNaN(d.getTime()) ? null : d; };
const PROCESS_STATUS_LABELS = { ACTIVE: 'Activos', IN_REVIEW: 'En revisión', READY_TO_PUBLISH: 'Listos para publicar', PUBLISHED: 'Publicados', FINALIZED: 'Finalizados' };
const MONTH_FORMAT = new Intl.DateTimeFormat('es-CR', { month: 'short' });
const lastMonths = (count) => Array.from({ length: count }, (_, index) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (count - 1 - index)); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, short: MONTH_FORMAT.format(d).replace('.', '') }; });
const phaseOf = (p) => { const phases = p.summary?.phases; if (!phases) return 'A'; return ['C', 'B'].find((m) => phases[m]?.total > 0) || 'A'; };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const inRange = (date, filter, future = false) => {
  if (!date) return filter === 'all';
  const now = new Date(); const today = startOfDay(now); const target = startOfDay(date);
  if (future) {
    if (filter === 'tomorrow') { const x = new Date(today); x.setDate(x.getDate()+1); return target.getTime() === x.getTime(); }
    if (filter === 'today') return target.getTime() === today.getTime();
    if (filter === '7days') { const end = new Date(today); end.setDate(end.getDate()+7); return target >= today && target <= end; }
    if (filter === 'month') { const end = new Date(today); end.setMonth(end.getMonth()+1); return target >= today && target <= end; }
    return true;
  }
  if (filter === 'today') return target.getTime() === today.getTime();
  if (filter === 'yesterday') { const x = new Date(today); x.setDate(x.getDate()-1); return target.getTime() === x.getTime(); }
  if (filter === '7days') { const start = new Date(today); start.setDate(start.getDate()-7); return target >= start && target <= today; }
  if (filter === 'month') { const start = new Date(today); start.setMonth(start.getMonth()-1); return target >= start && target <= today; }
  return true;
};
const dateLabel = (value) => { const d = asDate(value); return d ? d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha'; };

function AdminOverviewView() {
  const [companies, setCompanies] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [futureFilter, setFutureFilter] = useState('all');
  const [pastFilter, setPastFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  useEffect(() => {
    Promise.all([authService.getCompanies(), adminReviewService.getProcesses()])
      .then(([c, p]) => { setCompanies(c); setProcesses(p); })
      .catch((e) => setError(e.response?.data?.error?.message || 'No se pudo cargar el resumen administrativo.'))
      .finally(() => setLoading(false));
  }, []);

  const planCounts = Object.keys(PLAN_LABELS).map((plan) => ({ plan, count: companies.filter((c) => (c.subscription?.planId || 'fase-a') === plan).length }));
  const candidatesTotal = processes.reduce((sum, p) => sum + (p.summary?.totalParticipants || 0), 0);
  const upcoming = processes.filter((p) => { const d = asDate(p.availableFrom); return d && d >= startOfDay(new Date()) && inRange(d, futureFilter, true); });
  const past = processes.filter((p) => { const d = asDate(p.endDate || p.availableFrom); return d && d < startOfDay(new Date()) && inRange(d, pastFilter, false); });
  const reduction = (a, b) => a > 0 ? Math.max(0, Math.round(((a-b)/a)*100)) : null;
  const phaseSum = (list, module, field) => list.reduce((sum, p) => sum + (p.summary?.phases?.[module]?.[field] || 0), 0);
  // Only processes that already reached the next phase are comparable.
  const reachedB = processes.filter((p) => p.summary?.phases?.B?.total > 0);
  const reachedC = processes.filter((p) => p.summary?.phases?.C?.total > 0);
  const reductionAB = reduction(phaseSum(reachedB, 'A', 'completed'), phaseSum(reachedB, 'B', 'total'));
  const reductionBC = reduction(phaseSum(reachedC, 'B', 'completed'), phaseSum(reachedC, 'C', 'total'));
  const funnel = [['Fase A', 'A'], ['Fase B', 'B'], ['Fase C', 'C']].map(([label, module]) => ({ label, value: phaseSum(processes, module, 'completed'), hint: `${phaseSum(processes, module, 'total')} participantes` }));
  const byStatus = Object.entries(PROCESS_STATUS_LABELS).map(([status, label]) => ({ label, value: processes.filter((p) => p.status === status).length }));
  const byModality = [{ label: 'Virtual', value: processes.filter((p) => p.modality !== 'onsite').length }, { label: 'Presencial', value: processes.filter((p) => p.modality === 'onsite').length }];
  const byPlan = planCounts.map(({ plan, count }) => ({ label: PLAN_LABELS[plan], value: count }));
  const byMonth = lastMonths(6).map(({ key, short }) => ({ label: key, short, value: processes.reduce((sum, p) => sum + (p.summary?.completionsByMonth?.[key] || 0), 0) }));
  const pendingReports = processes.flatMap((p) => ['A', 'B', 'C'].filter((m) => p.modules?.includes(m) && !p.deliveredModules?.includes(m) && p.summary?.phases?.[m]?.complete).map((m) => ({ id: `${p.id}-${m}`, name: p.name, company: p.company, module: m })));

  const activity = companies.flatMap((c) => {
    const events = [];
    const created = asDate(c.createdAt);
    if (created) events.push({ id: `${c.id}-created`, date: created, name: c.companyName || c.name || 'Empresa', text: `Registro con plan ${PLAN_LABELS[c.subscription?.planId || 'fase-a']}`, kind: 'registration' });
    (c.subscription?.planHistory || []).forEach((h, i) => events.push({ id: `${c.id}-plan-${i}`, date: asDate(h.changedAt), name: c.companyName || c.name || 'Empresa', text: `Cambio de plan de ${PLAN_LABELS[h.fromPlan] || h.fromPlan} a ${PLAN_LABELS[h.toPlan] || h.toPlan}`, kind: 'plan' }));
    return events.filter((e) => e.date && inRange(e.date, companyFilter, false));
  }).sort((a,b) => b.date-a.date);

  const card = (title, value, detail) => <div className="rounded-2xl border border-[#DDE8F2] bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-[#718096]">{title}</p><p className="mt-2 font-display text-3xl font-bold text-[#10233A]">{value}</p><p className="mt-1 text-xs text-[#64748B]">{detail}</p></div>;
  const selectClass = 'rounded-lg border border-[#DDE5EC] bg-white px-3 py-2 text-xs text-[#475569] outline-none focus:border-[#0AADA8]';
  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-7xl">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Dashboard general</h1><p className="mt-1 text-sm text-[#64748B]">Resumen de instituciones, procesos de evaluación y actividad de NexoPerfil.</p>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="mt-8 rounded-2xl bg-white p-10 text-center text-sm text-[#64748B]">Cargando estadísticas reales...</div> : <>
      <section className="mt-7"><h2 className="mb-3 font-display text-lg font-bold text-[#10233A]">Resumen de la plataforma</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{card('Empresas registradas', companies.length, 'Organizaciones registradas en la plataforma')}{card('Candidatos participantes', candidatesTotal, 'Participantes asociados a procesos registrados')}{card('Procesos', processes.length, 'Procesos registrados en la plataforma')}{card('PDF por entregar', pendingReports.length, 'Fases terminadas esperando su informe')}</div></section>
      {pendingReports.length > 0 && <section className="mt-8 rounded-2xl border border-[#DDE8F2] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Bandeja de entregas</h2><p className="mt-1 text-sm text-[#64748B]">Fases terminadas que esperan su PDF de resultados.</p></div><a href="/admin-dashboard?section=results" className="rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#087D79]">Ir a Resultados</a></div><ul className="mt-4 divide-y divide-[#EEF2F6]">{pendingReports.slice(0, 6).map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><span className="font-medium text-[#10233A]">{r.name}</span><span className="text-xs text-[#64748B]">{r.company} · Fase {r.module}</span></li>)}</ul></section>}
      <section className="mt-8 grid gap-4 lg:grid-cols-2"><ChartCard title="Embudo de evaluación" description="Candidatos que completaron cada fase."><BarChart caption="Candidatos que completaron cada fase" items={funnel} /></ChartCard><ChartCard title="Evaluaciones por mes" description="Evaluaciones enviadas en los últimos 6 meses, en todas las fases."><ColumnChart caption="Evaluaciones por mes" items={byMonth} /></ChartCard><ChartCard title="Procesos por estado"><BarChart caption="Procesos por estado" items={byStatus} /></ChartCard><div className="grid gap-4"><ChartCard title="Empresas por plan"><BarChart caption="Empresas por plan" items={byPlan} /></ChartCard><ChartCard title="Modalidad de los procesos"><BarChart caption="Procesos por modalidad" items={byModality} /></ChartCard></div></section>
      <section className="mt-8 rounded-2xl border border-[#DDE8F2] bg-white p-5 sm:p-6"><h2 className="font-display text-lg font-bold text-[#10233A]">Reducción de candidatos entre fases</h2><p className="mt-1 text-sm text-[#64748B]">De quienes completaron una fase, cuántos no continuaron a la siguiente. Se calcula con los procesos que ya llegaron a esa fase.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{[['A → B', reductionAB, reachedB.length], ['B → C', reductionBC, reachedC.length]].map(([label, value, count]) => <div key={label} className="rounded-xl bg-[#F6FAFC] p-4"><p className="text-sm font-semibold text-[#475569]">Fase {label}</p><p className="mt-2 text-2xl font-bold text-[#10233A]">{value === null ? '—' : `${value}%`}</p><p className="mt-1 text-xs text-[#7C8AA0]">{value === null ? 'Ningún proceso ha llegado todavía a esta fase.' : `${count} proceso(s) comparables.`}</p></div>)}</div></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Próximos procesos</h2><p className="text-sm text-[#64748B]">Procesos programados y fase activa.</p></div><select className={selectClass} value={futureFilter} onChange={(e)=>setFutureFilter(e.target.value)}><option value="all">Todos</option><option value="month">Próximo mes</option><option value="7days">Próximos 7 días</option><option value="tomorrow">Mañana</option><option value="today">Hoy</option></select></div><div className="mt-4 overflow-x-auto rounded-2xl border border-[#DDE8F2] bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#F6F9FC] text-xs uppercase text-[#718096]"><tr><th className="p-4">Proceso</th><th className="p-4">Empresa</th><th className="p-4">Fecha</th><th className="p-4">Invitaciones</th><th className="p-4">Fase</th></tr></thead><tbody>{upcoming.map(p=><tr key={p.id} className="border-t border-[#EEF2F6]"><td className="p-4 font-semibold text-[#10233A]">{p.name}</td><td className="p-4">{p.company}</td><td className="p-4">{dateLabel(p.availableFrom)}</td><td className="p-4">{p.summary?.totalParticipants ?? 0}</td><td className="p-4">{phaseOf(p)}</td></tr>)}{upcoming.length===0&&<tr><td colSpan="5" className="p-8 text-center text-sm text-[#94A3B8]">No hay procesos para este filtro.</td></tr>}</tbody></table></div></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Procesos anteriores</h2><p className="text-sm text-[#64748B]">Participación y estado de entrega de resultados.</p></div><select className={selectClass} value={pastFilter} onChange={(e)=>setPastFilter(e.target.value)}><option value="all">Todos</option><option value="month">Hace 1 mes</option><option value="7days">Últimos 7 días</option><option value="yesterday">Ayer</option><option value="today">Hoy</option></select></div><div className="mt-4 grid gap-3">{past.map(p=><article key={p.id} className="rounded-2xl border border-[#DDE8F2] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-[#10233A]">{p.name}</h3><p className="mt-1 text-xs text-[#64748B]">{p.company} · {dateLabel(p.endDate || p.availableFrom)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.deliveredModules?.length ? 'bg-[#E7F8EF] text-[#16804A]' : 'bg-[#FFF5E5] text-[#A16207]'}`}>{p.deliveredModules?.length ? `PDF entregado · Fase ${p.deliveredModules.join(', ')}` : 'Resultados pendientes de envío'}</span></div><div className="mt-4 flex flex-wrap gap-5 text-sm"><span><b>{p.summary?.responsesReceived ?? 0}</b> participantes completaron</span><span><b>{p.summary?.totalParticipants ?? 0}</b> invitados</span></div></article>)}{past.length===0&&<div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#94A3B8]">No hay procesos anteriores para este filtro.</div>}</div></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Actividad de empresas</h2><p className="text-sm text-[#64748B]">Registros y cambios de plan guardados en el historial.</p></div><select className={selectClass} value={companyFilter} onChange={(e)=>setCompanyFilter(e.target.value)}><option value="all">De siempre</option><option value="month">Último mes</option><option value="7days">Últimos 7 días</option><option value="yesterday">Ayer</option><option value="today">Solo hoy</option></select></div><div className="mt-4 overflow-hidden rounded-2xl border border-[#DDE8F2] bg-white">{activity.length===0?<div className="p-8 text-center text-sm text-[#94A3B8]">No hay movimientos para este filtro. Los cambios de plan nuevos se registrarán en el historial.</div>:activity.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F6] p-4 last:border-0"><div><p className="text-sm font-semibold text-[#10233A]">{a.name}</p><p className="mt-1 text-sm text-[#475569]">{a.text}</p></div><span className="text-xs text-[#7C8AA0]">{dateLabel(a.date)}</span></div>)}</div></section>
    </>}
  </div></div>;
}

export function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const allowedSections = ADMIN_SECTIONS.filter((item) => canSection(profile, item.id));
  const requested = searchParams.get('section');
  const activeSection = requested || allowedSections[0]?.id;
  const allowed = activeSection && canSection(profile, activeSection);
  const selectSection = (id) => { if (canSection(profile, id)) setSearchParams({ section: id }); };
  return <div className="min-h-screen bg-[#F7F9FC] lg:flex">
    <AdminSidebar activeSection={activeSection} onSelect={selectSection} />
    <main className="min-w-0 flex-1">
      {!allowed ? <div className="mx-auto max-w-2xl p-8"><h1 className="font-display text-2xl font-bold text-[#10233A]">Acceso restringido</h1><p className="mt-3 text-sm leading-7 text-[#64748B]">{allowedSections.length ? 'Tu cuenta no tiene permiso para esta sección. Selecciona una opción disponible del menú.' : 'Tu cuenta aún no tiene permisos administrativos asignados. El propietario debe configurar tu acceso.'}</p></div> : <>
        {activeSection === 'dashboard' && <AdminOverviewView />}
        {activeSection === 'companies' && <CompaniesView />}
        {activeSection === 'processes' && <AdminProcessesView />}
        {activeSection === 'question-bank' && <AdminQuestionBankPage />}
        {activeSection === 'macrocasos' && <AdminMacrocasesPage />}
        {activeSection === 'microcasos' && <AdminMicrocasesPage />}
        {activeSection === 'results' && <AdminResultsPage />}
        {activeSection === 'settings' && <AdminSettingsPage />}
        {activeSection === 'accounts' && <AdminAccountsPage />}
      </>}
    </main>
  </div>;
}
