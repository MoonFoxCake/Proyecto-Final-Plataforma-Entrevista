import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOutIcon, SpinnerIcon } from '../auth/icons.jsx';
import * as authService from '../../services/authService';

/** Shared header and session action for authenticated dashboards. */
export function DashboardHeader({ title, subtitle }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-[#101828]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-6 text-[#6A7282]">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#4B5563] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Cerrar sesión"
      >
        {loading ? <SpinnerIcon className="h-4 w-4 text-[#0AADA8]" /> : <LogOutIcon className="h-4 w-4" />}
        Cerrar sesión
      </button>
    </div>
  );
}