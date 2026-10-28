import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  AdminSidebar,
  ADMIN_SECTIONS,
  AdminPlaceholderView,
} from '../components/admin/AdminSidebar.jsx';

import {
  Button,
  FormField,
  Input,
} from '../components/ui';

import {
  ArrowRightIcon,
  BriefcaseIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  SpinnerIcon,
  UserIcon,
} from '../components/auth/icons.jsx';

import * as authService from '../services/authService';
import { AdminProcessesView } from './AdminProcessesPage.jsx';
import { AdminMacrocasesPage } from './AdminMacrocasesPage.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

const INITIAL_FORM = {
  companyName: '',
  nombre: '',
  apellido: '',
  email: '',
  phone: '',
  password: '',
  password2: '',
};

function CompaniesView() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [planFilters, setPlanFilters] = useState(['fase-a', 'fase-a-b', 'completo']);

  const loadCompanies = async () => {
    try {
      setCompanies(await authService.getCompanies());
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
          'No se pudieron cargar las empresas.'
      );
    } finally {
      setLoadingCompanies(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const filteredCompanies = companies.filter((company) => planFilters.includes(company.subscription?.planId || 'fase-a'));

  const togglePlan = (plan) => setPlanFilters((current) => current.includes(plan) ? current.filter((item) => item !== plan) : [...current, plan]);

  const update = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));

    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.password.length < 8) {
      setError(
        'La contraseña debe tener al menos 8 caracteres.'
      );
      return;
    }

    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authService.createCompanyUser({
        companyName: form.companyName.trim(),
        displayName: `${form.nombre} ${form.apellido}`.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });

      await loadCompanies();

      setSessionCount((count) => count + 1);

      setCreated({
        email: form.email.trim(),
        companyName: form.companyName.trim(),
      });

      setForm(INITIAL_FORM);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
          'No se pudo crear el usuario de empresa.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#101828]">
              Usuarios de empresa
            </h1>

            <p className="mt-1 text-sm text-[#64748B]">
              Crea el acceso inicial de cada empresa para que pueda
              gestionar sus procesos y candidatos.
            </p>
          </div>

          <div className="rounded-2xl border border-[#DDE8F2] bg-white px-5 py-4 shadow-sm">
            <p className="text-xs text-[#6A7282]">
              Altas en esta sesión
            </p>

            <p className="mt-1 text-right font-display text-2xl font-bold text-[#0AADA8]">
              {sessionCount}
            </p>
          </div>
        </div>

        {created && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-sm text-[#087D79]">
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-semibold">
                Usuario creado para {created.companyName}
              </p>

              <p className="mt-1">
                Envía a {created.email} las instrucciones de acceso
                por un canal seguro.
              </p>
            </div>

            <button
              type="button"
              className="ml-auto text-xs font-semibold underline"
              onClick={() => setCreated(null)}
            >
              Cerrar
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">

          <section className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">

            <div className="mb-6 flex items-center gap-3 border-b border-[#EEF2F6] pb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F7F6] text-[#0AADA8]">
                <BriefcaseIcon className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-display text-lg font-bold text-[#101828]">
                  Nueva cuenta
                </h2>

                <p className="text-xs text-[#6A7282]">
                  El usuario recibirá rol de empresa.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
              noValidate
            >
              <FormField
                label="Empresa"
                htmlFor="companyName"
              >
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={update('companyName')}
                  placeholder="TechCorp S.A."
                  icon={
                    <BriefcaseIcon className="h-4 w-4" />
                  }
                  required
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  label="Nombre"
                  htmlFor="nombre"
                >
                  <Input
                    id="nombre"
                    value={form.nombre}
                    onChange={update('nombre')}
                    placeholder="María"
                    icon={
                      <UserIcon className="h-4 w-4" />
                    }
                    required
                  />
                </FormField>

                <FormField
                  label="Apellido"
                  htmlFor="apellido"
                >
                  <Input
                    id="apellido"
                    value={form.apellido}
                    onChange={update('apellido')}
                    placeholder="González"
                    icon={
                      <UserIcon className="h-4 w-4" />
                    }
                    required
                  />
                </FormField>
              </div>

              <FormField
                label="Correo corporativo"
                htmlFor="email"
              >
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  placeholder="contacto@empresa.com"
                  icon={
                    <MailIcon className="h-4 w-4" />
                  }
                  required
                />
              </FormField>

              <FormField
                label="Teléfono (opcional)"
                htmlFor="phone"
              >
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder="+57 300 000 0000"
                  icon={
                    <PhoneIcon className="h-4 w-4" />
                  }
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  label="Contraseña temporal"
                  htmlFor="password"
                >
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={update('password')}
                    placeholder="Mínimo 8 caracteres"
                    icon={
                      <LockIcon className="h-4 w-4" />
                    }
                    className="w-full"
                    required
                  />
                </FormField>

                <FormField
                  label="Confirmar"
                  htmlFor="password2"
                >
                  <Input
                    id="password2"
                    type="password"
                    value={form.password2}
                    onChange={update('password2')}
                    placeholder="Repite la contraseña"
                    icon={
                      <LockIcon className="h-4 w-4" />
                    }
                    className="w-full"
                    required
                  />
                </FormField>
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="accent"
                className="h-12 w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    Crear usuario de empresa
                    <ArrowRightIcon className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-[#101828]">
                  Empresas registradas
                </h2>

                <p className="mt-1 text-xs text-[#6A7282]">
                  Usuarios agrupados por empresa.
                </p>
              </div>

              <span className="rounded-full bg-[#E0F7F6] px-3 py-1 text-xs font-semibold text-[#087D79]">
                {companies.length}
              </span>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-[#475569]">Filtrar por plan:</span>
              {[['fase-a', 'Fase A'], ['fase-a-b', 'Fases A + B'], ['completo', 'Completo']].map(([plan, label]) => (
                <label key={plan} className="flex cursor-pointer items-center gap-2 rounded-full border border-[#DDE8F2] px-3 py-2 text-[#475569]">
                  <input type="checkbox" checked={planFilters.includes(plan)} onChange={() => togglePlan(plan)} className="accent-[#0AADA8]" />{label}
                </label>
              ))}
              <button type="button" onClick={() => setPlanFilters(['fase-a', 'fase-a-b', 'completo'])} className="font-semibold text-[#087D79] underline">Todas</button>
            </div>

            {loadingCompanies ? (
              <div className="flex min-h-56 items-center justify-center text-sm text-[#6A7282]">
                Cargando empresas...
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-[#DDE8F2] text-center text-sm text-[#99A1AF]">
                Las empresas aparecerán aquí.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="rounded-xl border border-[#EDF1F5] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#101828]">
                          {company.companyName || company.name}
                        </p>

                        <p className="text-xs text-[#6A7282]">
                          {company.users.length} usuario(s) · Plan: {{ 'fase-a': 'Fase A', 'fase-a-b': 'Fases A + B', completo: 'Completo' }[company.subscription?.planId || 'fase-a']}
                        </p>
                      </div>

                      <BriefcaseIcon className="h-5 w-5 shrink-0 text-[#0AADA8]" />
                    </div>

                    <div className="mt-3 space-y-2">
                      {company.users.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center gap-3 border-t border-[#F1F3F5] pt-2"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#091426] text-xs font-bold text-white">
                            {user.displayName
                              ?.split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#101828]">
                              {user.displayName}
                            </p>

                            <p className="truncate text-xs text-[#6A7282]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

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
      : initialSection === 'macrocasos'
        ? 'macrocasos'
        : 'companies'
  );

  const section = ADMIN_SECTIONS.find(
    (item) => item.id === activeSection
  );

  const selectSection = (id) => {
    setActiveSection(id);

    if (['dashboard', 'processes', 'macrocasos'].includes(id)) {
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

        {activeSection === 'macrocasos' && (
          <AdminMacrocasesPage />
        )}

        {activeSection !== 'dashboard' &&
          activeSection !== 'companies' &&
          activeSection !== 'processes' &&
          activeSection !== 'macrocasos' && (
            <AdminPlaceholderView section={section} />
          )}

      </main>
    </div>
  );
}
