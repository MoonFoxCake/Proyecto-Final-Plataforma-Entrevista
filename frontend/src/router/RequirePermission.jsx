import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { canAny } from '../utils/adminPermissions.js';
export function RequirePermission({ permissions }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!canAny(profile, permissions)) return <main className="mx-auto max-w-xl p-8"><h1 className="text-xl font-bold text-[#10233A]">Acceso restringido</h1><p className="mt-3 text-sm text-[#64748B]">Tu cuenta no tiene permiso para consultar esta sección. Solicita acceso al propietario.</p><Link to="/admin-dashboard" className="mt-5 inline-block text-sm font-semibold text-[#087D79]">Volver al panel</Link></main>;
  return <Outlet />;
}
