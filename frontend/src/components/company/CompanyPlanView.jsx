import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as subscriptionService from '../../services/subscriptionService.js';
import { SUBSCRIPTION_PLANS, normalizePlanId } from '../../utils/subscriptionPlans.js';

const MODULES = [
  { id: 'A', name: 'Perfil inicial', description: 'Cuestionario Likert para iniciar la evaluación de tus candidatos.' },
  { id: 'B', name: 'Macrocasos', description: 'Situaciones profesionales para profundizar en la evaluación.' },
  { id: 'C', name: 'Microcasos', description: 'Historias breves con preguntas agrupadas por habilidades.' },
];
const STATUS = { active: 'Plan activo', pending_simulation: 'Activación pendiente', suspended: 'Plan suspendido', inactive: 'Plan inactivo', expired: 'Plan vencido' };

/** Plan details are fetched only when the company chooses to open this section. */
export function CompanyPlanView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    subscriptionService.getSubscription()
      .then((result) => {
        if (!result?.subscription?.planId || !SUBSCRIPTION_PLANS[normalizePlanId(result.subscription.planId)]) throw new Error('missing-plan');
        if (active) setData(result);
      })
      .catch(() => { if (active) { setData(null); setError('No pudimos consultar tu plan. Inténtalo de nuevo en un momento.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const plan = data ? SUBSCRIPTION_PLANS[normalizePlanId(data.subscription.planId)] : null;
  const status = data?.subscription.status;

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Tu empresa</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Mi plan</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Consulta lo que incluye tu plan y encuentra las opciones que mejor se adapten a tus procesos.</p></header>

    {loading ? <div role="status" className="mt-8 rounded-2xl border border-[#DDE5EC] bg-white p-10 text-center text-sm text-[#64748B]">Consultando tu plan…</div>
      : error ? <div role="alert" className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-4 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold focus-visible:outline-teal-600">Volver a intentar</button></div>
        : plan && <>
          <section aria-label="Tu plan actual" className="mt-8 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm">
            <div className="h-1 bg-[#0AADA8]" />
            <div className="flex flex-wrap items-start justify-between gap-6 p-6 sm:p-8"><div className="min-w-0"><p className="text-xs font-semibold text-[#64748B]">Plan actual</p><h2 className="mt-2 font-display text-3xl font-bold text-[#10233A]">{plan.name}</h2><p className="mt-2 break-words text-sm text-[#64748B]">{data.companyName || 'Tu organización'}</p></div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === 'active' ? 'bg-[#E8F8F5] text-[#087D79]' : 'bg-amber-50 text-amber-800'}`}>{STATUS[status] || 'Estado por confirmar'}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF2F6] bg-[#FAFCFD] px-6 py-4 sm:px-8"><p className="text-sm text-[#475569]"><strong className="text-[#10233A]">{plan.modules.length} de 3 módulos</strong> incluidos en tu plan</p><Link to="/planes?mode=manage" className="rounded-xl px-3 py-2 text-sm font-semibold text-[#087D79] hover:bg-[#E8F7F6] focus-visible:outline-teal-600">Comparar y cambiar plan <span aria-hidden="true">→</span></Link></div>
          </section>

          <section aria-labelledby="plan-modules" className="mt-8"><h2 id="plan-modules" className="font-display text-lg font-bold text-[#10233A]">Tus módulos de evaluación</h2><p className="mt-1 text-sm text-[#64748B]">Conoce las etapas incluidas y las que puedes añadir a tu plan.</p><div className="mt-5 grid gap-4 md:grid-cols-3">{MODULES.map((module) => {
            const included = plan.modules.includes(module.id);
            return <article key={module.id} aria-label={`Módulo ${module.id} · ${module.name}`} className="rounded-2xl border border-[#DDE5EC] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${included ? 'bg-[#E0F7F6] text-[#087D79]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>{module.id}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${included ? 'bg-[#E8F8F5] text-[#087D79]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>{included ? 'Incluido' : 'Disponible en otro plan'}</span></div><p className="mt-4 text-xs font-semibold text-[#64748B]">Módulo {module.id}</p><h3 className="mt-1 font-display font-bold text-[#10233A]">{module.name}</h3><p className="mt-2 text-sm leading-6 text-[#64748B]">{module.description}</p></article>;
          })}</div></section>

          <aside className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#DDE5EC] bg-[#EFF8F8] p-5 sm:p-6"><div className="max-w-xl"><h2 className="font-display font-bold text-[#10233A]">Un plan que acompaña tus procesos</h2><p className="mt-2 text-sm leading-6 text-[#475569]">Explora los planes para incorporar más etapas de evaluación cuando tu empresa lo necesite.</p><p className="mt-2 text-xs leading-5 text-[#64748B]">Los cambios de plan son de demostración; no se realizan cobros.</p></div><Link to="/planes?mode=manage" className="rounded-xl bg-[#0AADA8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#089490] focus-visible:outline-teal-600">Ver planes</Link></aside>
        </>}
  </div></div>;
}
