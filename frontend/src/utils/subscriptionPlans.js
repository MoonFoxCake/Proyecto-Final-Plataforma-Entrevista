export const SUBSCRIPTION_PLANS = {
  'fase-a': { name: 'Fase A', modules: ['A'], moduleNames: ['Módulo A · Perfil inicial'] },
  'fase-a-b': { name: 'Fase A + B', modules: ['A', 'B'], moduleNames: ['Módulo A · Perfil inicial', 'Módulo B · Macrocaso'] },
  completo: { name: 'Plan completo', modules: ['A', 'B', 'C'], moduleNames: ['Módulo A · Perfil inicial', 'Módulo B · Macrocaso', 'Módulo C · Microcasos'] },
};

export function normalizePlanId(value) {
  return ({ A: 'fase-a', AB: 'fase-a-b', COMPLETE: 'completo' })[value] || value || 'fase-a';
}

export function canUseModule(planId, module) {
  const normalized = normalizePlanId(planId);
  return SUBSCRIPTION_PLANS[normalized]?.modules.includes(module) ?? false;
}
