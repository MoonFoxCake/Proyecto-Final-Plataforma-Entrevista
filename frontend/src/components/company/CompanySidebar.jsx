import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpinnerIcon } from '../auth/icons.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import * as authService from '../../services/authService.js';

export const COMPANY_SECTIONS = [
  ['dashboard', 'Dashboard', 'Resumen de actividad', '▦'], ['events', 'Eventos', 'Procesos de selección', '▣'],
  ['candidates', 'Candidatos', 'Candidatos por evento', '♙'], ['reports', 'Resultados', 'Resultados de la empresa', '▤'],
].map(([id, label, description, icon]) => ({ id, label, description, icon }));
const initials = (name = '') => name.split(' ').filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'EM';

export function CompanySidebar({ activeSection, onSelect = () => {} }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = user?.displayName || 'Empresa';
  const handleLogout = async () => { setLoggingOut(true); try { await authService.logout(); navigate('/login', { replace: true }); } finally { setLoggingOut(false); } };
  return <aside className="bg-[#0B2035] text-white lg:sticky lg:top-0 lg:h-screen lg:w-[228px] lg:shrink-0"><div className="flex min-h-full flex-col">
    <div className="flex h-[72px] items-center border-b border-white/10 px-5"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#635BDF] font-display text-sm font-bold">N</div><div className="ml-3"><p className="font-display text-sm font-bold">NexoPerfil</p><p className="text-[10px] text-[#7890A8]">Empresa</p></div><button type="button" onClick={handleLogout} className="ml-auto text-xs text-[#C5D0DF] lg:hidden">Cerrar sesión</button></div>
    <div className="border-b border-white/10 px-3 py-3 lg:flex-1 lg:border-0 lg:py-6"><p className="mb-2 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#71869C] lg:block">Menú</p><nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1" aria-label="Navegación de empresa">{COMPANY_SECTIONS.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium lg:w-full ${item.id === activeSection ? 'bg-[#07576B] text-white' : 'text-[#C4D0DC] hover:bg-white/5 hover:text-white'}`}><span className={item.id === activeSection ? 'text-[#12C4BD]' : 'text-[#8CA0B4]'}>{item.icon}</span><span>{item.label}</span></button>)}</nav></div>
    <div className="hidden border-t border-white/10 p-3 lg:block"><div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#635BDF] text-[10px] font-bold">{initials(displayName)}</div><div className="min-w-0"><p className="truncate text-xs font-semibold">{displayName}</p><p className="text-[10px] text-[#7890A8]">Empresa contratante</p></div></div><button type="button" onClick={handleLogout} disabled={loggingOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-[#C4D0DC] hover:bg-white/5 disabled:opacity-60">{loggingOut ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <span>↪</span>} Cerrar sesión</button></div>
  </div></aside>;
}

export function CompanyPlaceholderView({ section }) { return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Próximamente</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">{section?.label}</h1><p className="mt-2 text-sm text-[#6A7282]">{section?.description}. Esta sección se desarrollará en una siguiente iteración.</p><div className="mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center text-sm text-[#94A3B8]">Contenido pendiente de implementación</div></div></div>; }
