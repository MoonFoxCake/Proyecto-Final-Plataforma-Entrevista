import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as subscriptionService from '../services/subscriptionService.js';
import { useAuth } from '../hooks/useAuth.js';
import { usePublicSettings } from '../hooks/usePublicSettings.js';
import { normalizePlanId } from '../utils/subscriptionPlans.js';

const PLAN_IDS = ['fase-a', 'fase-a-b', 'completo'];

export function PlanSelectionPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const managing = params.get('mode') === 'manage';
  const { loading: authLoading } = useAuth();
  const settings = usePublicSettings();
  const plans = PLAN_IDS.map((id) => ({ id, ...settings.plans[id] }));

  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(managing);
  const [savingPlan, setSavingPlan] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Public route: after a reload the session is restored a moment later.
    if (!managing || authLoading) return;

    subscriptionService.getSubscription()
      .then((data) => {
        const planId = normalizePlanId(data?.subscription?.planId);
        setCurrentPlan(planId);
      })
      .catch(() => {
        setError('No se pudo consultar tu suscripción actual.');
      })
      .finally(() => setLoading(false));
  }, [managing, authLoading]);

  async function choosePlan(planId) {
    if (!managing) {
      navigate(`/register?plan=${planId}`);
      return;
    }

    if (planId === currentPlan) return;

    setSavingPlan(planId);
    setError('');
    setSuccess('');

    try {
      await subscriptionService.updateSubscription(planId);
      setCurrentPlan(planId);
      setSuccess('Tu suscripción se actualizó correctamente.');
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
        'No se pudo actualizar la suscripción. Inténtalo nuevamente.'
      );
    } finally {
      setSavingPlan('');
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F9FC] px-5 py-12 text-[#101828]">
      <div className="mx-auto max-w-5xl">
        <Link
          to={managing ? '/company-dashboard' : '/'}
          className="text-sm font-semibold text-teal-700"
        >
          ← {managing ? 'Volver a mi empresa' : 'Volver a NexoPerfil'}
        </Link>

        <div className="mt-7 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-teal-700">
            Planes empresariales
          </p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
            {managing ? 'Actualiza tu suscripción' : 'Selecciona tu plan'}
          </h1>
          <p className="mt-3 text-slate-600">
            {managing
              ? 'Consulta tu plan actual y elige el que mejor se adapte a tus necesidades.'
              : 'Elige las fases que mejor se adapten a tu proceso de selección.'}
          </p>
        </div>

        {loading && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Cargando tu suscripción actual...
          </p>
        )}

        {error && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {success}
          </p>
        )}

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = managing && currentPlan === plan.id;
            const isSaving = savingPlan === plan.id;

            return (
              <article
                key={plan.id}
                className={`rounded-2xl border bg-white p-6 ${
                  isCurrent
                    ? 'border-teal-500 ring-2 ring-teal-500/20'
                    : 'border-slate-200'
                }`}
              >
                {isCurrent && (
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
                    Tu plan actual
                  </span>
                )}

                <h2 className="mt-3 text-xl font-bold">{plan.name}</h2>
                <p className="mt-3 text-2xl font-black">{plan.price}</p>

                <ul className="my-6 space-y-3 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature}>✓ {feature}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={
                    loading ||
                    Boolean(savingPlan) ||
                    isCurrent
                  }
                  onClick={() => choosePlan(plan.id)}
                  className={`w-full rounded-xl px-4 py-3 font-bold text-white ${
                    isCurrent
                      ? 'cursor-default bg-slate-400'
                      : 'bg-[#0B1F33] hover:bg-teal-800'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isSaving
                    ? 'Actualizando...'
                    : isCurrent
                      ? 'Plan actual'
                      : managing
                        ? 'Cambiar a este plan'
                        : 'Continuar con este plan'}
                </button>
              </article>
            );
          })}
        </div>

        {managing && (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigate('/company-dashboard')}
              className="text-sm font-semibold text-teal-700 hover:underline"
            >
              Volver al panel de empresa
            </button>
          </div>
        )}
      </div>
    </main>
  );
}