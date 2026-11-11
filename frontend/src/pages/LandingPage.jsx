import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePublicSettings } from '../hooks/usePublicSettings.js';

const PLAN_IDS = ['fase-a', 'fase-a-b', 'completo'];
const RECOMMENDED_PLAN = 'fase-a-b';
const BENEFIT_ICONS = ['◎', '↗', '▤'];

function goToPlan(navigate, id) { navigate(`/planes?plan=${encodeURIComponent(id)}`); }

export function LandingPage() {
  const navigate = useNavigate();
  const { landing, plans } = usePublicSettings();
  const [stats, setStats] = useState({ organizations: null, evaluatedCandidates: null });

  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
    fetch(`${apiBase}/public/stats`)
      .then((response) => { if (!response.ok) throw new Error('No se pudieron cargar las estadísticas'); return response.json(); })
      .then((result) => setStats({
        organizations: Number(result?.data?.organizations ?? 0),
        evaluatedCandidates: Number(result?.data?.evaluatedCandidates ?? 0),
      }))
      .catch(() => setStats({ organizations: 0, evaluatedCandidates: 0 }));
  }, []);

  const formatCount = (value) => {
    if (value === null) return '—';
    return `+${new Intl.NumberFormat('es-CR').format(Math.max(0, value - 1))}`;
  };

  return <div className="min-h-screen bg-[#F7F9FC] text-[#101828]">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B1F33] text-white shadow-lg">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <a href="#inicio" className="text-2xl font-extrabold tracking-tight">Nexo<span className="text-[#35C6BD]">Perfil</span></a>
        <div className="hidden items-center gap-7 text-sm text-slate-200 md:flex"><a href="#nosotros" className="hover:text-[#35C6BD]">Quiénes somos</a><a href="#beneficios" className="hover:text-[#35C6BD]">Beneficios</a><a href="#planes" className="hover:text-[#35C6BD]">Planes</a><a href="#contacto" className="hover:text-[#35C6BD]">Contacto</a></div>
        <div className="flex items-center gap-2"><Link to="/login" className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/10">Iniciar sesión</Link><button onClick={() => goToPlan(navigate, 'fase-a')} className="hidden rounded-xl bg-[#19B9B0] px-4 py-2.5 text-sm font-bold text-[#082B35] hover:bg-[#55D8D0] sm:inline-flex">Comprar un plan</button></div>
      </nav>
    </header>
    <main>
      <section id="inicio" className="relative overflow-hidden bg-[#0B1F33] text-white"><div className="absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#12B8AE]/20 blur-3xl"/><div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 md:grid-cols-2 lg:px-8 lg:py-32"><div><p className="mb-5 inline-flex rounded-full border border-[#35C6BD]/40 bg-[#35C6BD]/10 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-[#73E2DC]">{landing.badge}</p><h1 className="max-w-2xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">{landing.heroTitle} <span className="text-[#35C6BD]">{landing.heroHighlight}</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">{landing.heroText}</p><div className="mt-9 flex flex-wrap gap-3"><a href="#planes" className="rounded-xl bg-[#19B9B0] px-6 py-3.5 font-bold text-[#082B35] transition hover:bg-[#55D8D0]">Explorar planes <span aria-hidden="true">→</span></a><a href="#nosotros" className="rounded-xl border border-white/20 px-6 py-3.5 font-semibold hover:bg-white/5">Conocer NexoPerfil</a></div><div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-300"><span>✓ Evaluaciones estructuradas</span><span>✓ Resultados comparables</span><span>✓ Gestión centralizada</span></div></div><div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1"><article className="rounded-3xl border border-white/10 bg-white/[.06] p-6 shadow-2xl backdrop-blur sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#35C6BD]/15 text-2xl text-[#73E2DC]">▦</div><p className="mt-6 text-sm font-medium text-slate-300">Empresas registradas</p><p className="mt-2 text-5xl font-black tracking-tight text-white">{formatCount(stats.organizations)}</p><p className="mt-3 text-sm leading-6 text-slate-300">Organizaciones que confían en NexoPerfil.</p></article><article className="rounded-3xl border border-white/10 bg-white/[.06] p-6 shadow-2xl backdrop-blur sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#35C6BD]/15 text-2xl text-[#73E2DC]">✓</div><p className="mt-6 text-sm font-medium text-slate-300">Candidatos evaluados</p><p className="mt-2 text-5xl font-black tracking-tight text-white">{formatCount(stats.evaluatedCandidates)}</p><p className="mt-3 text-sm leading-6 text-slate-300">Candidatos que han sido evaluados con nuestro sistema.</p></article></div></div></section>
      <section id="nosotros" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[.18em] text-teal-700">Quiénes somos</p><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{landing.aboutTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{landing.aboutText}</p></div></section>
      <section id="beneficios" className="bg-white py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="text-center"><p className="text-sm font-bold uppercase tracking-[.18em] text-teal-700">Beneficios</p><h2 className="mt-3 text-3xl font-extrabold">{landing.benefitsTitle}</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3">{landing.benefits.map((item, index) => <article key={item.title} className="rounded-2xl border border-slate-100 bg-[#F8FAFC] p-7"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-2xl font-bold text-teal-700">{BENEFIT_ICONS[index]}</div><h3 className="mt-5 text-xl font-bold">{item.title}</h3><p className="mt-3 leading-7 text-slate-600">{item.body}</p></article>)}</div></div></section>
      <section id="planes" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="mx-auto max-w-2xl text-center"><p className="text-sm font-bold uppercase tracking-[.18em] text-teal-700">Planes</p><h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">{landing.plansTitle}</h2><p className="mt-4 text-slate-600">{landing.plansText}</p></div><div className="mt-12 grid gap-6 lg:grid-cols-3">{PLAN_IDS.map((id) => { const plan = plans[id]; const popular = id === RECOMMENDED_PLAN; return <article key={id} className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm ${popular?'border-teal-500 ring-2 ring-teal-500/15':'border-slate-200'}`}>{popular&&<span className="absolute -top-3 left-6 rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white">Recomendado</span>}<h3 className="text-xl font-extrabold">{plan.name}</h3><p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{plan.description}</p><p className="mt-5 text-3xl font-black">{plan.price}</p><ul className="my-7 flex-1 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-3 text-sm text-slate-700"><span className="font-bold text-teal-600">✓</span><span>{feature}</span></li>)}</ul><button onClick={()=>goToPlan(navigate,id)} className={`w-full rounded-xl px-5 py-3.5 font-bold transition ${popular?'bg-[#19B9B0] text-[#082B35] hover:bg-[#55D8D0]':'border border-slate-300 hover:border-teal-500 hover:bg-teal-50'}`}>Elegir este plan</button></article>; })}</div></section>
      <section id="contacto" className="bg-[#0B1F33] py-16 text-white"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 md:flex-row md:items-center md:justify-between lg:px-8"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#73E2DC]">Contacto</p><h2 className="mt-2 text-2xl font-extrabold">{landing.contactTitle}</h2><p className="mt-2 text-slate-300">{landing.contactText}</p></div><button onClick={()=>goToPlan(navigate,'fase-a')} className="shrink-0 rounded-xl bg-[#19B9B0] px-6 py-3.5 font-bold text-[#082B35] hover:bg-[#55D8D0]">Comprar un plan →</button></div></section>
    </main><footer className="bg-[#071725] px-5 py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} NexoPerfil · Plataforma de evaluación ética para el reclutamiento universitario</footer>
  </div>;
}
