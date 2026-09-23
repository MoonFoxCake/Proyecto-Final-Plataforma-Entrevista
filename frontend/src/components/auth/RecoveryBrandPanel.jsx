import { AuthBackdrop } from './AuthBackdrop.jsx';
import { Logo } from './Logo.jsx';
import { StepIndicator } from './StepIndicator.jsx';
import { MailIcon, ShieldIcon } from './icons.jsx';

const STEPS = [
  'Ingresa tu correo electrónico',
  'Revisa tu bandeja de entrada',
  'Crea una nueva contraseña',
];

export function RecoveryBrandPanel({ currentStep = 0, email = '', reset = false }) {
  const stats = [
    { value: '256-bit', label: 'Cifrado SSL' },
    { value: '10 min', label: reset ? 'Sesión activa' : 'Expiración del enlace' },
    { value: '100%', label: 'Proceso seguro' },
  ];

  return (
    <AuthBackdrop className="hidden w-[738px] shrink-0 lg:block">
      <Logo />

      <div className="my-auto">
        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#0AADA8]/25 bg-[#0AADA8]/15 px-3 py-1.5">
          {reset ? <ShieldIcon className="h-3 w-3 text-[#0AADA8]" /> : <MailIcon className="h-3 w-3 text-[#0AADA8]" />}
          <span className="text-xs font-medium text-[#0AADA8]">
            {reset ? 'Nueva contraseña' : 'Recuperación de acceso'}
          </span>
        </div>

        <h1 className="font-display text-4xl font-bold leading-tight text-white">
          {reset ? (
            <>Restablece tu<br /><span className="text-[#0AADA8]">acceso seguro.</span></>
          ) : (
            <>¿Olvidaste tu<br /><span className="text-[#0AADA8]">contraseña?</span></>
          )}
        </h1>

        <p className="mt-5 max-w-sm text-base leading-relaxed text-[#8EC5FF]">
          {reset
            ? 'Crea una contraseña nueva y robusta para proteger tu cuenta en Nexo Perfil.'
            : 'No te preocupes. Ingresa tu correo registrado y te enviaremos un enlace para restablecer tu acceso de forma segura.'}
        </p>

        {reset && email && (
          <div className="mt-7 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0AADA8] text-sm font-bold text-white">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-xs text-[#8EC5FF]">
              Restableciendo para
              <div className="truncate font-semibold text-white">{email}</div>
            </div>
          </div>
        )}

        <StepIndicator steps={STEPS} currentStep={currentStep} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-white/5 p-4">
            <div className="font-display text-xl font-bold text-[#0AADA8]">{stat.value}</div>
            <div className="mt-0.5 text-xs text-[#8EC5FF]">{stat.label}</div>
          </div>
        ))}
      </div>
    </AuthBackdrop>
  );
}
