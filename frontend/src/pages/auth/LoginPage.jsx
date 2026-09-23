import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Input } from '../../components/ui';
import { BrandPanel } from '../../components/auth/BrandPanel.jsx';
import { ArrowRightIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, SpinnerIcon } from '../../components/auth/icons.jsx';
import * as authService from '../../services/authService';
import { getAuthErrorMessage } from '../../utils/firebaseErrors.js';
import { ROLES } from '../../utils/constants.js';

/**
 * Login form (email + password), backed by Firebase Auth.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.login(email, password);
      const profile = await authService.getProfile();
      console.log('=== LOGIN DEBUG ===');
      console.log('PROFILE:', profile);
      console.log('ROLE:', profile?.role);
      console.log('LOCATION STATE:', location.state);
      const dashboardByRole = {
        [ROLES.ADMIN]: '/admin-dashboard',
        [ROLES.COMPANY]: '/company-dashboard',
        [ROLES.CANDIDATE]: '/candidate-dashboard',
      };
      const redirectTo = location.state?.from?.pathname || dashboardByRole[profile?.role] || '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[#F8FAFC]">
      <BrandPanel />

      <div className="flex flex-1 items-center justify-center bg-white p-8">
        <div className="w-full max-w-[420px]">
          <h2 className="font-display text-3xl font-bold leading-9 text-[#101828]">Bienvenido</h2>
          <p className="mt-2 text-sm leading-5 text-[#6A7282]">
            Ingresa tus credenciales para acceder a la plataforma.
          </p>

          <form onSubmit={handleSubmit} className="mt-9">
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#364153]">
                Correo electrónico
              </label>
              <div className="mt-1.5">
                <Input
                  id="email"
                  type="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<MailIcon className="h-4 w-4" />}
                />
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="password" className="block text-sm font-medium text-[#364153]">
                Contraseña
              </label>
              <div className="mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<LockIcon className="h-4 w-4" />}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-[#99A1AF] hover:text-[#6A7282]"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                    </button>
                  }
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-[#0AADA8] hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <div className="mt-5">
              <Button type="submit" variant="accent" className="h-12 w-full" disabled={loading}>
                {loading ? (
                  <>
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    Iniciar sesión
                    <ArrowRightIcon className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs leading-4 text-[#D1D5DC]">
            © 2025 Nexo Perfil · Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
