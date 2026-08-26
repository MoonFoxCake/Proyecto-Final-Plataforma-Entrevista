import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from '../../components/ui';

/**
 * Login form (email + password). Submission not wired up yet.
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: call authService.login(email, password)
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-primary">Iniciar sesión</h1>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full">
          Ingresar
        </Button>
        <p className="text-center text-sm text-neutral-600">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-secondary">
            Regístrate
          </Link>
        </p>
      </form>
    </div>
  );
}
