import { Button } from '../ui';
import { ArrowRightIcon, CheckIcon } from './icons.jsx';
import { Logo } from './Logo.jsx';

/**
 * Confirmation screen shown once the registration wizard has submitted
 * successfully.
 *
 * @param {{ email: string, onContinue: () => void }} props
 */
export function RegisterSuccess({ email, onContinue }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#0AADA8] to-[#087D79] shadow-lg">
          <CheckIcon className="h-9 w-9 text-white" />
        </div>
        <div className="mb-8 flex justify-center">
          <Logo dark />
        </div>
        <h2 className="font-display text-3xl font-bold text-[#101828]">¡Cuenta creada!</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#6A7282]">
          Tu perfil como candidato ha sido registrado exitosamente. Revisa tu correo{' '}
          <strong className="text-[#364153]">{email}</strong> para confirmar tu cuenta.
        </p>
        <Button variant="accent" className="mt-8 h-12 w-full" onClick={onContinue}>
          Ir al inicio de sesión
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
