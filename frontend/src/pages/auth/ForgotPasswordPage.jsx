import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from '../../components/ui';
import { Logo } from '../../components/auth/Logo.jsx';
import { RecoveryBrandPanel } from '../../components/auth/RecoveryBrandPanel.jsx';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, MailIcon, SpinnerIcon } from '../../components/auth/icons.jsx';
import * as authService from '../../services/authService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 30;

function recoveryError(error) {
  if (error?.code === 'auth/too-many-requests') return 'Has realizado demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (error?.code === 'auth/network-request-failed') return 'No pudimos conectarnos. Verifica tu conexión e inténtalo de nuevo.';
  return 'No pudimos enviar el enlace en este momento. Inténtalo de nuevo.';
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendResetEmail = async (isResend = false) => {
    const normalizedEmail = email.trim();
    setError('');
    setFeedback('');

    if (!normalizedEmail) {
      setError('Ingresa tu correo electrónico.');
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    setLoading(true);
    try {
      await authService.requestPasswordReset(normalizedEmail);
      setEmail(normalizedEmail);
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
      if (isResend) setFeedback('Enlace reenviado. Revisa también tu carpeta de spam.');
    } catch (requestError) {
      // Preserve a neutral response even if enumeration protection is disabled.
      if (requestError?.code === 'auth/user-not-found') {
        setSent(true);
        setCooldown(COOLDOWN_SECONDS);
        if (isResend) setFeedback('Solicitud procesada. Revisa también tu carpeta de spam.');
      } else {
        setError(recoveryError(requestError));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-white">
      <RecoveryBrandPanel currentStep={sent ? 1 : 0} />

      <main className="flex flex-1 items-center justify-center bg-white p-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden"><Logo dark /></div>

          {!sent ? (
            <>
              <Link to="/login" className="mb-8 flex items-center gap-1.5 text-sm text-[#99A1AF] hover:text-[#6A7282]">
                <ArrowLeftIcon className="h-4 w-4" /> Volver al inicio de sesión
              </Link>

              <h2 className="font-display text-3xl font-bold text-[#101828]">Recuperar contraseña</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#6A7282]">
                Ingresa el correo asociado a tu cuenta y te enviaremos las instrucciones para restablecer tu contraseña.
              </p>

              <form className="mt-8" noValidate onSubmit={(event) => { event.preventDefault(); sendResetEmail(); }}>
                <label htmlFor="recovery-email" className="block text-sm font-medium text-[#364153]">Correo electrónico</label>
                <div className="mt-1.5">
                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@empresa.com"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); setError(''); }}
                    icon={<MailIcon className="h-4 w-4" />}
                    aria-invalid={Boolean(error)}
                  />
                </div>
                {error && <p className="mt-1.5 text-xs text-red-500" role="alert">{error}</p>}

                <Button type="submit" variant="accent" className="mt-5 h-12 w-full" disabled={loading}>
                  {loading ? <><SpinnerIcon className="h-4 w-4 animate-spin" /> Enviando instrucciones...</> : <>Enviar instrucciones <ArrowRightIcon className="h-4 w-4" /></>}
                </Button>

                <p className="mt-5 text-center text-sm text-[#6A7282]">
                  ¿Recordaste tu contraseña? <Link to="/login" className="font-medium text-[#0AADA8] hover:text-[#087D79]">Iniciar sesión</Link>
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="mb-7 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0AADA8]/10">
                  <CheckIcon className="h-5 w-5 text-[#0AADA8]" />
                </div>
                <h2 className="text-sm font-semibold text-[#0AADA8]">Revisa tu correo</h2>
              </div>

              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-6">
                <p className="text-sm leading-relaxed text-[#4B5563]">
                  Si existe una cuenta asociada a <strong className="break-all text-[#101828]">{email}</strong>, recibirás un enlace para restablecer tu contraseña.
                </p>
              </div>

              <div className="mt-6">
                <p className="mb-3 text-sm text-[#6A7282]">¿No lo recibiste?</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full border-[#0AADA8] text-[#0AADA8]"
                  disabled={loading || cooldown > 0}
                  onClick={() => sendResetEmail(true)}
                >
                  {loading ? <><SpinnerIcon className="h-4 w-4 animate-spin text-[#0AADA8]" /> Reenviando...</> : cooldown > 0 ? 'Reenviar enlace en ' + cooldown + 's' : 'Reenviar enlace'}
                </Button>
                {feedback && <p className="mt-2 text-xs text-[#087D79]" role="status">{feedback}</p>}
                {error && <p className="mt-2 text-xs text-red-500" role="alert">{error}</p>}
              </div>

              <Link to="/login" className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#4B5563] hover:bg-[#F9FAFB]">
                <ArrowLeftIcon className="h-4 w-4" /> Volver al inicio de sesión
              </Link>
            </>
          )}

          <p className="mt-8 text-center text-xs text-[#D1D5DC]">© 2025 Nexo Perfil · Todos los derechos reservados</p>
        </div>
      </main>
    </div>
  );
}
