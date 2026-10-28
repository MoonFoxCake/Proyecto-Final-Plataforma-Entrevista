import { useEffect, useState } from 'react';
import { AuthBackdrop } from './AuthBackdrop.jsx';
import { Logo } from './Logo.jsx';
import { ShieldIcon } from './icons.jsx';

export function BrandPanel() {
  const [stats, setStats] = useState({
    organizations: null,
    evaluatedCandidates: null,
  });

  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1')
      .replace(/\/$/, '');

    fetch(`${apiBase}/public/stats`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('No se pudieron cargar las estadísticas');
        }

        return response.json();
      })
      .then((result) => {
        setStats({
          organizations: Number(result?.data?.organizations ?? 0),
          evaluatedCandidates: Number(
            result?.data?.evaluatedCandidates ?? 0
          ),
        });
      })
      .catch((error) => {
        console.error('Error al cargar estadísticas:', error);
        setStats({
          organizations: 0,
          evaluatedCandidates: 0,
        });
      });
  }, []);

  const formatCount = (value) => {
    if (value === null) return '—';

    return `+${new Intl.NumberFormat('es-CR').format(
      Math.max(0, value - 1)
    )}`;
  };

  const statsCards = [
    {
      value: formatCount(stats.evaluatedCandidates),
      label: 'Candidatos evaluados',
    },
    {
      value: formatCount(stats.organizations),
      label: 'Empresas registradas',
    },
    {
      value: 'Por definir',
      label: 'Precisión de perfiles',
    },
  ];

  return (
    <AuthBackdrop className="hidden w-[738px] shrink-0 lg:block">
      <Logo />

      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#0AADA8]/25 bg-[#0AADA8]/15 px-3 py-1.5">
          <ShieldIcon className="h-3 w-3 text-[#0AADA8]" />
          <span className="text-xs font-medium text-[#0AADA8]">
            Plataforma de Evaluación Ética Universitaria
          </span>
        </div>

        <h1 className="font-display text-5xl font-bold leading-[60px] text-white">
          Evaluación inteligente,
          <br />
          <span className="text-[#0AADA8]">decisiones</span> precisas.
        </h1>

        <p className="mt-5 max-w-[384px] text-lg leading-[29px] text-[#8EC5FF]">
          Identifica el talento que realmente importa a través de un proceso
          de evaluación progresivo, riguroso y transparente.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {statsCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/[0.08] bg-white/5 p-4"
          >
            <div className="font-display text-2xl font-bold leading-8 text-[#0AADA8]">
              {stat.value}
            </div>

            <div className="mt-0.5 text-xs leading-4 text-[#8EC5FF]">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </AuthBackdrop>
  );
}

