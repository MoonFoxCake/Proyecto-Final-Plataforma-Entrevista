import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpinnerIcon } from '../auth/icons.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import * as authService from '../../services/authService.js';

export const ADMIN_SECTIONS = [
  ['dashboard', 'Dashboard', 'Resumen general del sistema', '▦'], ['processes', 'Procesos', 'Gestión de procesos de selección', '▣'],
  ['companies', 'Empresas', 'Usuarios y organizaciones', '▥'], ['candidates', 'Candidatos', 'Directorio global de candidatos', '♙'],
  ['results', 'Resultados', 'Resultados y métricas', '⌁'], ['reports', 'Reportes', 'Informes de la plataforma', '▤'],
  ['settings', 'Configuración', 'Preferencias del sistema', '⚙'],
].map(([id, label, description, icon]) => ({ id, label, description, icon }));
const initials = (name = '') => name.split(' ').filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'AD';

export function AdminSidebar({ activeSection, onSelect }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = user?.displayName || 'Administrador';
  const handleLogout = async () => { setLoggingOut(true); try { await authService.logout(); navigate('/login', { replace: true }); } finally { setLoggingOut(false); } };
  return <aside className="bg-[#112C4E] text-white lg:sticky lg:top-0 lg:h-screen lg:w-[222px] lg:shrink-0"><div className="flex min-h-full flex-col">
    <div className="flex h-[62px] items-center border-b border-white/10 px-5"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10B3AE] font-display text-sm font-bold">N</div><span className="ml-3 font-display text-sm font-bold">NexoPerfil</span><button type="button" onClick={handleLogout} disabled={loggingOut} className="ml-auto rounded-lg px-3 py-2 text-xs text-[#C5D0DF] hover:bg-white/5 lg:hidden">{loggingOut ? 'Saliendo...' : 'Cerrar sesión'}</button></div>
    <div className="border-b border-white/10 px-2 py-3 lg:flex-1 lg:border-0 lg:py-6"><p className="mb-2 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7388A4] lg:block">Principal</p><nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1" aria-label="Navegación administrativa">{ADMIN_SECTIONS.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={item.id === activeSection ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors lg:w-full ${item.id === activeSection ? 'bg-[#0B586F] text-white' : 'text-[#C5D0DF] hover:bg-white/5 hover:text-white'}`}><span className={item.id === activeSection ? 'text-[#11C5BE]' : 'text-[#91A4BD]'}>{item.icon}</span><span className="flex-1 text-left">{item.label}</span>{item.id === 'candidates' && <span className="rounded-full bg-[#F59E0B] px-1.5 text-[10px] font-bold">2</span>}</button>)}</nav></div>
    <div className="hidden border-t border-white/10 p-3 lg:block"><div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0EB5B0] text-[10px] font-bold">{initials(displayName)}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{displayName}</p><p className="text-[10px] text-[#8EA2BC]">Administrador</p></div></div><button type="button" onClick={handleLogout} disabled={loggingOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-[#C5D0DF] hover:bg-white/5 hover:text-white disabled:opacity-60">{loggingOut ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <span>↪</span>} Cerrar sesión</button></div>
  </div></aside>;
}

export function AdminPlaceholderView({ section }) { return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Próximamente</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">{section?.label}</h1><p className="mt-2 text-sm text-[#6A7282]">{section?.description}. Esta sección está preparada para una siguiente iteración.</p><div className="mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center text-sm text-[#94A3B8]">Contenido pendiente de implementación</div></div></div>; }
