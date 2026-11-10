import { AdminQuestionBankPage } from './AdminQuestionBankPage.jsx';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  AdminSidebar,
  ADMIN_SECTIONS,
  AdminPlaceholderView,
} from '../components/admin/AdminSidebar.jsx';

import { CompaniesView } from './AdminCompaniesView.jsx';

import * as authService from '../services/authService';
import { AdminProcessesView } from './AdminProcessesPage.jsx';
import { AdminMacrocasesPage } from './AdminMacrocasesPage.jsx';
import { AdminMicrocasesPage } from './AdminMicrocasesPage.jsx';
import { AdminResultsPage } from './AdminResultsPage.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

const PLAN_LABELS = { 'fase-a': 'Fase A', 'fase-a-b': 'Fases A + B', completo: 'Completo' };
const asDate = (value) => { if (!value) return null; const d = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
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
  const [stageStats, setStageStats] = useState({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(processes.map(async (p) => {
      try {
        const response = await fetch('/api/v1/events/' + encodeURIComponent(p.id) + '/candidates', { headers: {} });
        if (!response.ok) return [p.id, null];
        const json = await response.json(); return [p.id, json?.data || []];
      } catch { return [p.id, null]; }
    })).then((items) => { if (!cancelled) setStageStats(Object.fromEntries(items)); });
    return () => { cancelled = true; };
  }, [processes]);

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
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Dashboard general</h1><p className="mt-1 text-sm text-[#64748B]">Resumen de instituciones, procesos de evaluación y actividad de Nexxo Perfil.</p>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="mt-8 rounded-2xl bg-white p-10 text-center text-sm text-[#64748B]">Cargando estadísticas reales...</div> : <>
      <section className="mt-7"><h2 className="mb-3 font-display text-lg font-bold text-[#10233A]">Resumen de la plataforma</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{card('Empresas registradas', companies.length, 'Organizaciones registradas en la plataforma')}{card('Candidatos participantes', candidatesTotal, 'Participantes asociados a procesos registrados')}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{planCounts.map(({plan,count}) => <div key={plan} className="rounded-2xl border border-[#DDE8F2] bg-white p-4"><p className="text-xs text-[#64748B]">Plan {PLAN_LABELS[plan]}</p><p className="mt-1 text-2xl font-bold text-[#10233A]">{count}</p><p className="text-xs text-[#7C8AA0]">empresa(s)</p></div>)}</div></section>
      <section className="mt-8 rounded-2xl border border-[#DDE8F2] bg-white p-5 sm:p-6"><h2 className="font-display text-lg font-bold text-[#10233A]">Reducción de candidatos entre fases</h2><p className="mt-1 text-sm text-[#64748B]">Mide la reducción de participantes de una fase a la siguiente. Solo se calcula cuando hay datos comparables de ambas fases.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{['A → B','B → C'].map((label) => <div key={label} className="rounded-xl bg-[#F6FAFC] p-4"><p className="text-sm font-semibold text-[#475569]">Fase {label}</p><p className="mt-2 text-2xl font-bold text-[#0A8F8A]">—</p><p className="mt-1 text-xs text-[#7C8AA0]">No hay datos estructurados suficientes para calcular una cifra global confiable todavía.</p></div>)}</div></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Próximos procesos</h2><p className="text-sm text-[#64748B]">Procesos programados y fase activa.</p></div><select className={selectClass} value={futureFilter} onChange={(e)=>setFutureFilter(e.target.value)}><option value="all">Todos</option><option value="month">Próximo mes</option><option value="7days">Próximos 7 días</option><option value="tomorrow">Mañana</option><option value="today">Hoy</option></select></div><div className="mt-4 overflow-x-auto rounded-2xl border border-[#DDE8F2] bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#F6F9FC] text-xs uppercase text-[#718096]"><tr><th className="p-4">Proceso</th><th className="p-4">Empresa</th><th className="p-4">Fecha</th><th className="p-4">Invitaciones</th><th className="p-4">Fase</th></tr></thead><tbody>{upcoming.map(p=><tr key={p.id} className="border-t border-[#EEF2F6]"><td className="p-4 font-semibold text-[#10233A]">{p.name}</td><td className="p-4">{p.company}</td><td className="p-4">{dateLabel(p.availableFrom)}</td><td className="p-4">{p.summary?.totalParticipants ?? 0}</td><td className="p-4">{p.plan || p.module || 'A'}</td></tr>)}{upcoming.length===0&&<tr><td colSpan="5" className="p-8 text-center text-sm text-[#94A3B8]">No hay procesos para este filtro.</td></tr>}</tbody></table></div></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Procesos anteriores</h2><p className="text-sm text-[#64748B]">Participación y estado de entrega de resultados.</p></div><select className={selectClass} value={pastFilter} onChange={(e)=>setPastFilter(e.target.value)}><option value="all">Todos</option><option value="month">Hace 1 mes</option><option value="7days">Últimos 7 días</option><option value="yesterday">Ayer</option><option value="today">Hoy</option></select></div><div className="mt-4 grid gap-3">{past.map(p=><article key={p.id} className="rounded-2xl border border-[#DDE8F2] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-[#10233A]">{p.name}</h3><p className="mt-1 text-xs text-[#64748B]">{p.company} · {dateLabel(p.endDate || p.availableFrom)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.evaluationsPublishedAt || p.status==='PUBLISHED' ? 'bg-[#E7F8EF] text-[#16804A]' : 'bg-[#FFF5E5] text-[#A16207]'}`}>{p.evaluationsPublishedAt || p.status==='PUBLISHED' ? 'Resultados enviados' : 'Resultados pendientes de envío'}</span></div><div className="mt-4 flex flex-wrap gap-5 text-sm"><span><b>{p.summary?.responsesReceived ?? 0}</b> participantes completaron</span><span><b>{p.summary?.totalParticipants ?? 0}</b> invitados</span></div></article>)}{past.length===0&&<div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#94A3B8]">No hay procesos anteriores para este filtro.</div>}</div></section>
      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-[#10233A]">Actividad de empresas</h2><p className="text-sm text-[#64748B]">Registros y cambios de plan guardados en el historial.</p></div><select className={selectClass} value={companyFilter} onChange={(e)=>setCompanyFilter(e.target.value)}><option value="all">De siempre</option><option value="month">Último mes</option><option value="7days">Últimos 7 días</option><option value="yesterday">Ayer</option><option value="today">Solo hoy</option></select></div><div className="mt-4 overflow-hidden rounded-2xl border border-[#DDE8F2] bg-white">{activity.length===0?<div className="p-8 text-center text-sm text-[#94A3B8]">No hay movimientos para este filtro. Los cambios de plan nuevos se registrarán en el historial.</div>:activity.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F6] p-4 last:border-0"><div><p className="text-sm font-semibold text-[#10233A]">{a.name}</p><p className="mt-1 text-sm text-[#475569]">{a.text}</p></div><span className="text-xs text-[#7C8AA0]">{dateLabel(a.date)}</span></div>)}</div></section>
    </>}
  </div></div>;
}

export function AdminDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSection = searchParams.get('section');

  const [activeSection, setActiveSection] = useState(
    initialSection === 'dashboard'
      ? 'dashboard'
      : initialSection === 'processes'
      ? 'processes'
      : initialSection === 'question-bank'
        ? 'question-bank'
      : initialSection === 'macrocasos'
        ? 'macrocasos'
        : initialSection === 'microcasos'
          ? 'microcasos'
        : initialSection === 'results'
          ? 'results'
        : 'companies'
  );

  const section = ADMIN_SECTIONS.find(
    (item) => item.id === activeSection
  );

  const selectSection = (id) => {
    setActiveSection(id);

    if (['dashboard', 'processes', 'question-bank', 'macrocasos', 'microcasos', 'results'].includes(id)) {
      setSearchParams({ section: id });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:flex">

      <AdminSidebar
        activeSection={activeSection}
        onSelect={selectSection}
      />

      <main className="min-w-0 flex-1">

        {activeSection === 'dashboard' && <AdminOverviewView />}

        {activeSection === 'companies' && (
          <CompaniesView />
        )}

        {activeSection === 'processes' && (
          <AdminProcessesView />
        )}

        {activeSection === 'question-bank' && <AdminQuestionBankPage />}

        {activeSection === 'macrocasos' && (
          <AdminMacrocasesPage />
        )}

        {activeSection === 'microcasos' && (
          <AdminMicrocasesPage />
        )}

        {activeSection === 'results' && <AdminResultsPage />}

        {activeSection !== 'dashboard' &&
          activeSection !== 'companies' &&
          activeSection !== 'processes' &&
          activeSection !== 'question-bank' &&
          activeSection !== 'macrocasos' &&
          activeSection !== 'microcasos' &&
          activeSection !== 'results' && (
            <AdminPlaceholderView section={section} />
          )}

      </main>
    </div>
  );
}
