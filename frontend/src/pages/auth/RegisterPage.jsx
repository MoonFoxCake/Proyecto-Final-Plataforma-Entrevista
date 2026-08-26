import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from '../../components/ui';

/**
 * Registration form (name + email + password). Submission not wired up yet.
 */
export function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: call authService.register({ email, password, displayName })
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-primary">Crear cuenta</h1>
        <Input
          type="text"
          placeholder="Nombre completo"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
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
          Registrarme
        </Button>
        <p className="text-center text-sm text-neutral-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-secondary">
            Inicia sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
