import api from './api';

/** Obtiene la suscripción de la organización autenticada. */
export async function getSubscription() {
  const { data } = await api.get('/auth/subscription');
  return data?.data ?? null;
}

/** Actualiza el plan de la organización autenticada. */
export async function updateSubscription(planId) {
  const { data } = await api.patch('/auth/subscription', { planId });
  return data?.data ?? null;
}
