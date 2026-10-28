import { useEffect, useState } from 'react';
import { AuthBackdrop } from './AuthBackdrop.jsx';
import { Logo } from './Logo.jsx';
import { StepIndicator } from './StepIndicator.jsx';
import { BriefcaseIcon } from './icons.jsx';

export const REGISTER_STEPS = ['Empresa', 'Responsable', 'Acceso'];

/**
 * Panel lateral del registro empresarial. El número de organizaciones
 * se consulta desde el endpoint público de estadísticas del backend.
 */
export function RegisterBrandPanel({ currentStep }) {
  const [organizationCount, setOrganizationCount] = useState(null);

  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
    const controller = new AbortController();

    fetch(`${apiBase}/public/stats`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('No se pudieron cargar las estadísticas');
        }

        return response.json();
      })
      .then((result) => {
        const count = Number(result?.data?.organizations);

        setOrganizationCount(
          Number.isFinite(count) && count >= 0 ? count : 0
        );
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setOrganizationCount(0);
        }
      });

    return () => controller.abort();
  }, []);

  const formatCount = (value) => {
    if (value === null) return '—';

    return `+${new Intl.NumberFormat('es-CR').format(
      Math.max(0, value - 1)
    )}`;
  };

  const stats = [
    {
      value: formatCount(organizationCount),
      label: 'Empresas registradas',
    },
    { value: '100%', label: 'Acceso administrado' },
    { value: '24/7', label: 'Portal disponible' },
  ];

  return (
    <AuthBackdrop className="hidden w-[44%] shrink-0 lg:block">
      <Logo />

      <div className="my-auto">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#0AADA8]/25 bg-[#0AADA8]/15 px-3 py-1.5">
          <BriefcaseIcon className="h-3 w-3 text-[#0AADA8]" />
          <span className="text-xs font-medium text-[#0AADA8]">
            Registro empresarial
          </span>
        </div>

        <h1 className="font-display text-4xl font-bold leading-tight text-white">
          Tu empresa,
          <br />
          mejores <span className="text-[#0AADA8]">decisiones.</span>
        </h1>

        <p className="mt-5 max-w-xs text-base leading-relaxed text-[#8EC5FF]">
          Registra tu organización y gestiona procesos de evaluación desde un entorno seguro.
        </p>

        <StepIndicator steps={REGISTER_STEPS} currentStep={currentStep} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/[0.08] bg-white/5 p-3"
          >
            <div className="font-display text-xl font-bold leading-6 text-[#0AADA8]">
              {stat.value}
            </div>
            <div className="mt-0.5 text-xs leading-tight text-[#8EC5FF]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </AuthBackdrop>
  );
}