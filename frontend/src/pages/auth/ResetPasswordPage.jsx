import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Input } from '../../components/ui';
import { Logo } from '../../components/auth/Logo.jsx';
import { RecoveryBrandPanel } from '../../components/auth/RecoveryBrandPanel.jsx';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon, SpinnerIcon } from '../../components/auth/icons.jsx';
import * as authService from '../../services/authService.js';
import { getAuthErrorMessage } from '../../utils/firebaseErrors.js';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode');
  const [status, setStatus] = useState('verifying');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let active = true;
    if (!oobCode || (mode && mode !== 'resetPassword')) {
      setStatus('invalid');
      return () => { active = false; };
    }

    authService.verifyPasswordResetCode(oobCode)
      .then((verifiedEmail) => {
        if (!active) return;
        setEmail(verifiedEmail || '');
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('invalid');
      });

    return () => { active = false; };
  }, [mode, oobCode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!password) nextErrors.password = 'Ingresa una contraseña nueva.';
    else if (password.length < 8) nextErrors.password = 'La contraseña debe tener al menos 8 caracteres.';
    if (!confirmation) nextErrors.confirmation = 'Confirma tu contraseña nueva.';
    else if (password !== confirmation) nextErrors.confirmation = 'Las contraseñas no coinciden.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    setSubmitError('');
    try {
      await authService.confirmPasswordReset(oobCode, password);
      setStatus('success');
    } catch (error) {
      if (['auth/expired-action-code', 'auth/invalid-action-code'].includes(error?.code)) {
        setStatus('invalid');
      } else {
        setSubmitError(getAuthErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-white">
      <RecoveryBrandPanel currentStep={2} email={email} reset />
      <main className="flex flex-1 items-center justify-center bg-white p-6 sm:p-8">
        <div className="w-full max-w-[400px] py-8">
          <div className="mb-8 lg:hidden"><Logo dark /></div>

          {status === 'verifying' && (
            <div className="flex items-center justify-center gap-3 py-20 text-sm text-[#6A7282]">
              <SpinnerIcon className="h-5 w-5 animate-spin text-[#0AADA8]" /> Verificando enlace...
            </div>
          )}

          {status === 'invalid' && (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl font-semibold text-red-500">!</div>
              <h2 className="mt-5 font-display text-3xl font-bold text-[#101828]">Enlace no disponible</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#6A7282]">Este enlace no es válido o ha expirado.</p>
              <Link to="/forgot-password" className="mt-7 flex h-12 items-center justify-center rounded-xl bg-[#0AADA8] text-sm font-semibold text-white hover:bg-[#089490]">Solicitar un nuevo enlace</Link>
              <Link to="/login" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#4B5563] hover:bg-[#F9FAFB]"><ArrowLeftIcon className="h-4 w-4" /> Volver al inicio de sesión</Link>
            </div>
          )}

          {status === 'ready' && (
            <>
              <Link to="/login" className="mb-8 flex items-center gap-1.5 text-sm text-[#99A1AF] hover:text-[#6A7282]"><ArrowLeftIcon className="h-4 w-4" /> Volver al inicio de sesión</Link>
              <h2 className="font-display text-3xl font-bold text-[#101828]">Nueva contraseña</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#6A7282]">Elige una contraseña segura para proteger tu cuenta.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-[#364153]">Nueva contraseña</label>
                  <div className="mt-1.5">
                    <Input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(event) => { setPassword(event.target.value); setErrors((value) => ({ ...value, password: '' })); }} icon={<LockIcon className="h-4 w-4" />} rightElement={<button type="button" onClick={() => setShowPassword((value) => !value)} className="text-[#99A1AF] hover:text-[#6A7282]" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}</button>} />
                  </div>
                  {errors.password && <p className="mt-1.5 text-xs text-red-500" role="alert">{errors.password}</p>}
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-[#364153]">Confirmar contraseña</label>
                  <div className="mt-1.5">
                    <Input id="confirm-password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" placeholder="Repite tu nueva contraseña" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setErrors((value) => ({ ...value, confirmation: '' })); }} icon={<LockIcon className="h-4 w-4" />} rightElement={<button type="button" onClick={() => setShowConfirmation((value) => !value)} className="text-[#99A1AF] hover:text-[#6A7282]" aria-label={showConfirmation ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showConfirmation ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}</button>} />
                  </div>
                  {errors.confirmation && <p className="mt-1.5 text-xs text-red-500" role="alert">{errors.confirmation}</p>}
                </div>

                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs text-[#6A7282]">
                  <p className="font-medium text-[#364153]">Recomendaciones:</p>
                  <p className={'mt-2 ' + (password.length >= 8 ? 'text-[#0AADA8]' : '')}>· Al menos 8 caracteres</p>
                  <p className={'mt-1 ' + (confirmation && password === confirmation ? 'text-[#0AADA8]' : '')}>· Ambas contraseñas deben coincidir</p>
                </div>

                {submitError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">{submitError}</div>}

                <Button type="submit" variant="accent" className="h-12 w-full" disabled={loading}>
                  {loading ? <><SpinnerIcon className="h-4 w-4 animate-spin" /> Restableciendo...</> : <><LockIcon className="h-4 w-4" /> Restablecer contraseña</>}
                </Button>
              </form>
            </>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#0AADA8] shadow-lg"><CheckIcon className="h-7 w-7 text-white" /></div>
              <h2 className="mt-6 font-display text-3xl font-bold text-[#101828]">Contraseña restablecida</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#6A7282]">Tu contraseña se restableció correctamente.</p>
              <Link to="/login" className="mt-8 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0AADA8] text-sm font-semibold text-white hover:bg-[#089490]">Iniciar sesión <ArrowRightIcon className="h-4 w-4" /></Link>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-[#D1D5DC]">© 2025 Nexo Perfil · Todos los derechos reservados</p>
        </div>
      </main>
    </div>
  );
}
