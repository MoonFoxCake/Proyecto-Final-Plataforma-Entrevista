import { ShieldIcon } from './icons.jsx';

const STATS = [
  { value: '2,400+', label: 'Candidatos evaluados' },
  { value: '98%', label: 'Precisión perfiles' },
  { value: '45+', label: 'Empresas confían' },
];

/**
 * Left-hand marketing panel of the auth screens: dark gradient background,
 * NexoPerfil logo, headline, and the trust-stat strip at the bottom.
 */
export function BrandPanel() {
  return (
    <div
      className="relative hidden w-[738px] shrink-0 overflow-hidden lg:block"
      style={{
        background: 'linear-gradient(150deg, #0A1929 7.74%, #0F2544 45.77%, #0E3059 92.26%)',
      }}
    >
      {/* Radial glow overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(85.88% 61.5% at 50% 50%, rgba(10, 173, 168, 0.4) 0.2%, rgba(0, 0, 0, 0) 0.2%)',
        }}
      />
      {/* Decorative blurred blobs */}
      <div
        className="absolute h-96 w-96 rounded-full bg-[#0AADA8] opacity-10 blur-[64px]"
        style={{ left: '184px', top: '343px' }}
      />
      <div
        className="absolute h-64 w-64 rounded-full bg-[#6366F1] opacity-[0.08] blur-[64px]"
        style={{ left: '297px', top: '517px' }}
      />

      <div className="relative flex h-full flex-col p-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0AADA8] to-[#087D79] shadow-lg">
            <span className="font-display text-xl font-bold tracking-[-1px] text-white">N</span>
          </div>
          <span className="font-display text-xl font-semibold tracking-[-0.5px] text-white">
            NexoPerfil
          </span>
        </div>

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
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.08] bg-white/5 p-4"
            >
              <div className="font-display text-2xl font-bold leading-8 text-[#0AADA8]">
                {stat.value}
              </div>
              <div className="mt-0.5 text-xs leading-4 text-[#8EC5FF]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
