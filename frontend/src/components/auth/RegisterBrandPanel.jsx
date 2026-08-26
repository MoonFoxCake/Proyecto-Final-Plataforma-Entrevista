import { AuthBackdrop } from './AuthBackdrop.jsx';
import { Logo } from './Logo.jsx';
import { StepIndicator } from './StepIndicator.jsx';
import { UserIcon } from './icons.jsx';

export const REGISTER_STEPS = ['Datos personales', 'Formación', 'Acceso'];

const STATS = [
  { value: '2,400+', label: 'Candidatos registrados' },
  { value: '98%', label: 'Tasa de perfiles activos' },
  { value: '45+', label: 'Empresas aliadas' },
];

/**
 * Left-hand marketing panel of the register screen. Shares the gradient
 * backdrop and logo with {@link BrandPanel} (login) but carries its own
 * copy and the wizard's step tracker.
 *
 * @param {{ currentStep: number }} props
 */
export function RegisterBrandPanel({ currentStep }) {
  return (
    <AuthBackdrop className="hidden w-[44%] shrink-0 lg:block">
      <Logo />

      <div className="my-auto">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#0AADA8]/25 bg-[#0AADA8]/15 px-3 py-1.5">
          <UserIcon className="h-3 w-3 text-[#0AADA8]" />
          <span className="text-xs font-medium text-[#0AADA8]">Registro de candidato</span>
        </div>

        <h1 className="font-display text-4xl font-bold leading-tight text-white">
          Tu perfil,
          <br />
          tu <span className="text-[#0AADA8]">oportunidad.</span>
        </h1>

        <p className="mt-5 max-w-xs text-base leading-relaxed text-[#8EC5FF]">
          Crea tu perfil en minutos y conecta con las mejores empresas que buscan tu talento.
        </p>

        <StepIndicator steps={REGISTER_STEPS} currentStep={currentStep} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STATS.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-white/5 p-3">
            <div className="font-display text-xl font-bold leading-6 text-[#0AADA8]">{stat.value}</div>
            <div className="mt-0.5 text-xs leading-tight text-[#8EC5FF]">{stat.label}</div>
          </div>
        ))}
      </div>
    </AuthBackdrop>
  );
}
