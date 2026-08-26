import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../services/authService';

/**
 * Minimal placeholder landing page for a signed-in user. Stands in for the
 * real admin/client/candidate dashboards until those are built — it exists
 * so the auth flow (login/register → guarded route → logout) has somewhere
 * concrete to land and is observable end to end.
 */
export function DashboardPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-8">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
        <h1 className="font-display text-2xl font-bold text-[#101828]">
          ¡Bienvenido{user?.displayName ? `, ${user.displayName}` : ''}!
        </h1>
        <p className="mt-2 text-sm text-[#6A7282]">{user?.email}</p>

        {role && (
          <span className="mt-4 inline-block rounded-full bg-[#0AADA8]/10 px-3 py-1 text-xs font-medium text-[#0AADA8]">
            Rol: {role}
          </span>
        )}

        <p className="mt-6 text-xs leading-relaxed text-[#99A1AF]">
          Esta es una pantalla temporal — todavía no existen los paneles de admin, cliente o
          candidato.
        </p>

        <Button variant="outline" className="mt-6 h-11 w-full" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
