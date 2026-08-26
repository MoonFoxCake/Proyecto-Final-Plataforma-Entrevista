import { AuthBackdrop } from './AuthBackdrop.jsx';
import { Logo } from './Logo.jsx';
import { ShieldIcon } from './icons.jsx';

const STATS = [
  { value: '2,400+', label: 'Candidatos evaluados' },
  { value: '98%', label: 'Precisión perfiles' },
  { value: '45+', label: 'Empresas confían' },
];

/**
 * Left-hand marketing panel of the login screen: dark gradient background,
 * NexoPerfil logo, headline, and the trust-stat strip at the bottom.
 */
export function BrandPanel() {
  return (
    <AuthBackdrop className="hidden w-[738px] shrink-0 lg:block">
      <Logo />

      {/* Headline block, vertically centered in the remaining space */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#0AADA8]/25 bg-[#0AADA8]/15 px-3 py-1.5">
          <ShieldIcon className="h-3 w-3 text-[#0AADA8]" />
          <span className="text-xs font-medium text-[#0AADA8]">
            Plataforma SaaS de Evaluación Universitaria
          </span>
        </div>

        <h1 className="font-display text-5xl font-bold leading-[60px] text-white">
          Evaluación inteligente,
          <br />
          <span className="text-[#0AADA8]">decisiones</span> precisas.
        </h1>

        <p className="mt-5 max-w-[384px] text-lg leading-[29px] text-[#8EC5FF]">
          Identifica el talento que realmente importa a través de un proceso de evaluación
          progresivo, riguroso y transparente.
        </p>
      </div>

      {/* Trust stats */}
      <div className="grid grid-cols-3 gap-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-white/5 p-4">
            <div className="font-display text-2xl font-bold leading-8 text-[#0AADA8]">
              {stat.value}
            </div>
            <div className="mt-0.5 text-xs leading-4 text-[#8EC5FF]">{stat.label}</div>
          </div>
        ))}
      </div>
    </AuthBackdrop>
  );
}
