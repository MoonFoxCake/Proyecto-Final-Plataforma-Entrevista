import { AccountPasswordDialog } from './AccountPasswordDialog.jsx';
import { canSection } from '../../utils/adminPermissions.js';
import { useEffect, useState } from 'react';
import * as adminReviewService from '../../services/adminReviewService.js';
import { pendingReports } from '../../pages/adminProcesses.js';
import { useNavigate } from 'react-router-dom';
import { SpinnerIcon } from '../auth/icons.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import * as authService from '../../services/authService.js';

export const ADMIN_SECTIONS = [
  [
    'dashboard',
    'Dashboard',
    'Resumen general del sistema',
    '▦',
  ],
  [
    'companies',
    'Empresas',
    'Usuarios y organizaciones',
    '▥',
  ],
  [
    'question-bank',
    'Banco de Preguntas',
    'Grupos versionados del Módulo A',
    '▤',
  ],
  [
    'macrocasos',
    'Banco de Macrocasos',
    'Escenarios utilizados en la Fase 2',
    '◇',
  ],
  [
    'microcasos',
    'Banco de Microcasos',
    'Historias y habilidades para la Fase 3',
    '◈',
  ],
  [
    'results',
    'Resultados',
    'Procesos, respuestas y entrega de PDF',
    '⌁',
  ],
  ['settings', 'Configuración', 'Textos, planes y correos', '⚙'],
  ['accounts', 'Accesos y usuarios', 'Administradores, permisos y cuentas', '♙'],
].map(([id, label, description, icon]) => ({
  id,
  label,
  description,
  icon,
}));

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

// Pending PDFs shown on "Resultados", shared by every admin page for a short while.
const PENDING_TTL_MS = 30_000;
let pendingCache = { at: 0, value: null, request: null };
/** After a delivery the count is read again on the next page. */
export const refreshPendingResults = () => { pendingCache = { ...pendingCache, at: 0 }; };

function usePendingResults(enabled) {
  const [count, setCount] = useState(pendingCache.value);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    if (Date.now() - pendingCache.at > PENDING_TTL_MS) {
      pendingCache.request ||= Promise.resolve().then(() => adminReviewService.getProcesses())
        .then((processes) => { pendingCache = { at: Date.now(), value: (processes || []).reduce((total, process) => total + pendingReports(process), 0), request: null }; })
        .catch(() => { pendingCache = { ...pendingCache, request: null }; });
    }
    Promise.resolve(pendingCache.request).then(() => { if (!cancelled) setCount(pendingCache.value); });
    return () => { cancelled = true; };
  }, [enabled]);
  return enabled ? count : null;
}

export function AdminSidebar({ activeSection, onSelect }) {
  const { user, profile } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const pendingResults = usePendingResults(canSection(profile, 'results'));
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = profile?.displayName || user?.displayName || 'Administrador';

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await authService.logout();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <aside className="bg-[#112C4E] text-white lg:sticky lg:top-0 lg:h-screen lg:w-[222px] lg:shrink-0">
      <div className="flex min-h-full flex-col">

        {/* Header */}
        <div className="flex h-[62px] items-center border-b border-white/10 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10B3AE] font-display text-sm font-bold">
            N
          </div>

          <span className="ml-3 font-display text-sm font-bold">
            NexoPerfil
          </span>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="ml-auto rounded-lg px-3 py-2 text-xs text-[#C5D0DF] hover:bg-white/5 lg:hidden"
          >
            {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
          </button>
        </div>

        {/* Navigation */}
        <div className="border-b border-white/10 px-2 py-3 lg:flex-1 lg:border-0 lg:py-6">
          <p className="mb-2 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7388A4] lg:block">
            Administración
          </p>

          <nav
            className="flex gap-1 overflow-x-auto lg:block lg:space-y-1"
            aria-label="Navegación administrativa"
          >
            {ADMIN_SECTIONS.filter((item) => canSection(profile, item.id)).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={
                  item.id === activeSection ? 'page' : undefined
                }
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors lg:w-full ${
                  item.id === activeSection
                    ? 'bg-[#0B586F] text-white'
                    : 'text-[#C5D0DF] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span
                  className={
                    item.id === activeSection
                      ? 'text-[#11C5BE]'
                      : 'text-[#91A4BD]'
                  }
                >
                  {item.icon}
                </span>

                <span className="flex-1 text-left">
                  {item.label}
                </span>
                {item.id === 'results' && pendingResults > 0 && (
                  <span title={`${pendingResults} PDF por entregar`} className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-[#112C4E]">
                    {pendingResults}<span className="sr-only"> PDF por entregar</span>
                  </span>
                )}

              </button>
            ))}
          </nav>
        </div>

        <div className="px-3 pb-3"><button type="button" onClick={() => setShowPassword(true)} className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[#C5D0DF] hover:bg-white/5">Mi contraseña</button></div>
        {showPassword && <AccountPasswordDialog onClose={() => setShowPassword(false)} />}
        {/* User */}
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0EB5B0] text-[10px] font-bold">
              {initials(displayName)}
            </div>

            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">
                {displayName}
              </p>

              <p className="text-[10px] text-[#8EA2BC]">
                {profile?.adminAccess === 'owner' ? 'Propietario' : profile?.adminAccess === 'full' ? 'Administrador completo' : 'Administrador restringido'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-[#C5D0DF] hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            {loggingOut ? (
              <SpinnerIcon className="h-4 w-4 animate-spin" />
            ) : (
              <span>↪</span>
            )}

            {loggingOut ? 'Saliendo...' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AdminPlaceholderView({ section }) {
  return (
    <div className="p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">
          Próximamente
        </p>

        <h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">
          {section?.label}
        </h1>

        <p className="mt-2 text-sm text-[#6A7282]">
          {section?.description}. Esta sección está preparada para una
          siguiente iteración.
        </p>

        <div className="mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center text-sm text-[#94A3B8]">
          Contenido pendiente de implementación
        </div>
      </div>
    </div>
  );
}
