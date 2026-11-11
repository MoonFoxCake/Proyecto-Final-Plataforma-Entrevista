import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { CaseBankDialog } from '../components/admin/CaseBankDialog.jsx';
import { AdminAccountEditor } from '../components/admin/AdminAccountEditor.jsx';
import { can, canAny, canManageAccount, ADMIN_PERMISSION_CATALOG } from '../utils/adminPermissions.js';
import * as api from '../services/adminAccountsApi.js';
const PRIMARY = 'rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-40';
const SECONDARY = 'rounded-xl border border-[#D9E2EA] bg-white px-3 py-2.5 text-xs font-semibold text-[#334E68] disabled:opacity-40';
const FIELD = 'w-full rounded-xl border border-[#D9E2EA] bg-white px-3 py-2.5 text-sm text-[#475569]';
const accessLabel = (account) => ({ owner: 'Propietario', full: 'Control total', restricted: 'Restringido' }[account.adminAccess] || 'Sin configurar');
const statusLabel = (account) => ({ active: 'Activa', disabled: 'Desactivada', deletion_pending: 'Eliminación pendiente' }[account.status] || 'Activa');
const adminPermissions = ['admins.view', 'admins.create', 'admins.manage', 'admins.delete'];
const userPermissions = ['users.view', 'users.delete'];

export function AdminAccountsPage() {
  const { profile } = useAuth();
  const seeAdmins = canAny(profile, adminPermissions);
  const seeUsers = canAny(profile, userPermissions);
  const [tab, setTab] = useState(seeAdmins ? 'admins' : 'users');
  const [admins, setAdmins] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [action, setAction] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState('');
  const requestId = useRef(0);
  const reload = async () => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    const result = await Promise.allSettled([seeAdmins ? api.listAdminAccounts() : Promise.resolve([]), seeUsers ? api.listUserAccounts() : Promise.resolve([])]);
    if (id !== requestId.current) return;
    if (result[0].status === 'fulfilled') setAdmins(result[0].value);
    if (result[1].status === 'fulfilled') setUsers(result[1].value);
    const refreshed = result.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []);
    setAction((current) => current ? { ...current, account: refreshed.find((account) => account.id === current.account.id) || current.account } : null);
    if (result.some((entry) => entry.status === 'rejected')) setError('No se pudo cargar alguna lista de cuentas. Actualiza antes de realizar cambios.');
    setLoading(false);
  };
  useEffect(() => { reload(); return () => { requestId.current += 1; }; }, [seeAdmins, seeUsers]);
  const currentTab = tab === 'admins' && seeAdmins ? 'admins' : 'users';
  const accounts = currentTab === 'admins' ? admins : users;
  const visible = accounts.filter((account) => `${account.displayName} ${account.username} ${account.email} ${account.companyName}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))
    .filter((account) => filter === 'all' || (filter === 'active' ? account.status === 'active' : account.status !== 'active'))
    .sort((a, b) => Number(b.adminAccess === 'owner') - Number(a.adminAccess === 'owner') || a.displayName.localeCompare(b.displayName, 'es'));
  const pages = Math.max(1, Math.ceil(visible.length / 8));
  const currentPage = Math.min(page, pages);
  const upsert = (saved) => setAdmins((old) => old.some((value) => value.id === saved.id) ? old.map((value) => value.id === saved.id ? saved : value) : [saved, ...old]);
  const save = async (payload) => {
    if (editor.account) { const saved = await api.updateAdminAccount(editor.account, payload); upsert(saved); setNotice('Permisos actualizados. Las restricciones se aplican en las próximas solicitudes de esa cuenta.'); }
    else { const created = await api.createAdminAccount(payload); upsert(created.account); setCredentials(created); }
    setEditor(null); setSearch(''); setFilter('all'); setPage(1);
  };
  const openAction = (account, kind) => { setAction({ account, kind }); setActionError(''); setConfirm(''); setPassword(''); setRepeat(''); };
  const runAction = async () => {
    if (action.kind === 'password' && (password.length < 12 || password.length > 128 || password !== repeat)) { setActionError('Usa de 12 a 128 caracteres y confirma la misma contraseña.'); return; }
    setBusy(true); setActionError('');
    try {
      if (action.kind === 'delete') {
        await api.deleteAccount(action.account, confirm);
        setAdmins((old) => old.filter((account) => account.id !== action.account.id)); setUsers((old) => old.filter((account) => account.id !== action.account.id));
        setNotice('Acceso eliminado. Los procesos y datos de evaluación se conservan.');
      } else if (action.kind === 'password') { upsert(await api.resetAdminPassword(action.account, password)); setNotice('Contraseña restablecida. Entrega la nueva contraseña por un canal privado. Las sesiones anteriores fueron revocadas.'); }
      else { upsert(await api.setAdminStatus(action.account, action.account.status === 'active' ? 'disabled' : 'active')); setNotice('Estado de la cuenta actualizado.'); }
      setAction(null); setPassword(''); setRepeat('');
    } catch (e) { setActionError(e.response?.data?.error?.message || 'No se pudo completar la operación.'); await reload(); }
    finally { setBusy(false); }
  };
  const copyCredentials = async () => {
    try { await navigator.clipboard.writeText(`Usuario: ${credentials.account.username}\nContraseña temporal: ${credentials.temporaryPassword}`); setCopied('Credenciales copiadas.'); }
    catch { setCopied('No se pudo copiar automáticamente. Copia los datos visibles manualmente.'); }
  };
  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1 basis-[28rem]"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Accesos y usuarios</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Define responsabilidades, administra permisos y controla el acceso a la plataforma.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading || busy} onClick={reload} className={SECONDARY}>Actualizar</button>{can(profile, 'admins.create') && <button type="button" onClick={() => { setEditor({ account: null }); setNotice(''); }} className={PRIMARY}>+ Nuevo administrador</button>}</div></header>
    {notice && <div role="status" className="mt-5 flex justify-between gap-3 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-sm text-[#087D79]"><p>{notice}</p><button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}
    <section aria-label="Resumen de cuentas" className="mt-6 grid gap-4 sm:grid-cols-3">{[[seeAdmins ? 'Administradores' : 'Usuarios', seeAdmins ? admins.length : users.length, 'Cuentas visibles según tus permisos'], ['Cuentas activas', [...admins, ...users].filter((account) => account.status === 'active').length, 'Con acceso habilitado'], ['Tu nivel de acceso', accessLabel(profile || {}), 'La cuenta propietaria está protegida']].map(([label, value, hint]) => <div key={label} className="rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-[#64748B]">{label}</p><p className="mt-2 font-display text-2xl font-bold text-[#10233A]">{loading ? '—' : value}</p><p className="mt-1 text-xs text-[#64748B]">{hint}</p></div>)}</section>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-3"><div role="group" aria-label="Tipo de cuentas" className="inline-flex rounded-xl border border-[#DDE5EC] bg-white p-1">{seeAdmins && <button type="button" aria-pressed={currentTab === 'admins'} onClick={() => { setTab('admins'); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${currentTab === 'admins' ? 'bg-[#0AADA8] text-white' : 'text-[#64748B]'}`}>Administradores</button>}{seeUsers && <button type="button" aria-pressed={currentTab === 'users'} onClick={() => { setTab('users'); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${currentTab === 'users' ? 'bg-[#0AADA8] text-white' : 'text-[#64748B]'}`}>Usuarios</button>}</div><div className="flex flex-wrap gap-3"><label className="text-xs font-semibold text-[#475569]">Buscar cuenta<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${FIELD} mt-1.5 block`} placeholder="Nombre, usuario o correo…" /></label><label className="text-xs font-semibold text-[#475569]">Estado<select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className={`${FIELD} mt-1.5 block`}><option value="all">Todos</option><option value="active">Activas</option><option value="disabled">Desactivadas o pendientes</option></select></label></div></div>
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{error}</p><button type="button" onClick={reload} className="mt-2 font-semibold underline">Reintentar</button></div>}
    {loading ? <p role="status" className="py-16 text-center text-sm text-[#64748B]">Cargando cuentas…</p> : <><p role="status" className="mt-4 text-xs text-[#64748B]">{visible.length} de {accounts.length} cuentas</p><div className="mt-4 space-y-3">{visible.slice((currentPage - 1) * 8, currentPage * 8).map((account) => {
      const manageable = canManageAccount(profile, account);
      const isAdmin = account.role === 'admin';
      const canEdit = isAdmin && manageable && can(profile, 'admins.manage') && account.status !== 'deletion_pending';
      const canDelete = manageable && can(profile, isAdmin ? 'admins.delete' : 'users.delete');
      return <article key={account.id} aria-label={account.displayName} className="rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-display font-bold text-[#10233A]">{account.displayName || 'Sin nombre'}</h2>{isAdmin && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.adminAccess === 'owner' ? 'bg-indigo-50 text-indigo-700' : 'bg-[#E0F7F6] text-[#087D79]'}`}>{accessLabel(account)}</span>}<span className={`rounded-full px-2.5 py-1 text-xs ${account.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{statusLabel(account)}</span>{account.id === profile?.id && <span className="text-xs text-[#64748B]">Tu cuenta</span>}</div><p className="mt-2 break-all text-sm text-[#64748B]">{account.username ? `Usuario: ${account.username}` : account.email}</p>{account.companyName && <p className="mt-1 text-xs text-[#64748B]">{account.companyName}</p>}</div><div className="flex flex-wrap gap-2">{canEdit && <><button type="button" onClick={() => setEditor({ account })} className={SECONDARY}>Editar permisos</button><button type="button" onClick={() => openAction(account, 'status')} className={SECONDARY}>{account.status === 'active' ? 'Desactivar' : 'Reactivar'}</button>{account.status === 'active' && <button type="button" onClick={() => openAction(account, 'password')} className={SECONDARY}>Restablecer contraseña</button>}</>}{canDelete && <button type="button" onClick={() => openAction(account, 'delete')} className="rounded-xl border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-700">{account.status === 'deletion_pending' ? 'Reintentar eliminación' : 'Eliminar cuenta'}</button>}</div></div>
        {isAdmin && <details className="mt-4 border-t border-[#EEF2F6] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#087D79]">Ver alcance de permisos</summary><div className="mt-3 flex flex-wrap gap-2">{['owner', 'full'].includes(account.adminAccess) ? <p className="text-xs leading-6 text-[#64748B]">{account.adminAccess === 'owner' ? 'Cuenta propietaria con control total. Su recuperación se realiza desde el servidor.' : 'Todos los permisos administrativos. La cuenta propietaria permanece protegida.'}</p> : account.permissions.length ? account.permissions.map((permission) => <span key={permission} className="rounded-lg bg-[#F6F9FC] px-2 py-1 text-xs text-[#475569]">{ADMIN_PERMISSION_CATALOG.find((entry) => entry.id === permission)?.label || permission}</span>) : <p className="text-xs text-amber-800">Sin permisos asignados. El propietario debe configurar el acceso.</p>}</div></details>}
      </article>;
    })}</div>{!visible.length && !error && <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#64748B]">No hay cuentas que coincidan con los filtros.</div>}{pages > 1 && <nav aria-label="Páginas de cuentas" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B]"><span>Página {currentPage} de {pages}</span><div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={SECONDARY}>Anterior</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={SECONDARY}>Siguiente</button></div></nav>}</>}
    {editor && <AdminAccountEditor account={editor.account} actor={profile} onClose={() => setEditor(null)} onSave={save} />}
    {credentials && <CaseBankDialog title="Cuenta creada" onClose={() => { setCredentials(null); setCopied(''); }} footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={copyCredentials} className={SECONDARY}>Copiar credenciales</button><button type="button" onClick={() => { setCredentials(null); setCopied(''); }} className={PRIMARY}>Cerrar</button></div>}><p className="text-sm leading-6 text-[#64748B]">Entrega estos datos por un canal privado. La contraseña temporal se muestra una sola vez y no se guarda en el panel.</p><dl className="mt-5 space-y-3 rounded-xl bg-[#F7F9FC] p-4 text-sm"><div><dt className="text-xs text-[#64748B]">Usuario</dt><dd className="mt-1 select-all break-all font-semibold">{credentials.account.username}</dd></div><div><dt className="text-xs text-[#64748B]">Contraseña temporal</dt><dd className="mt-1 select-all break-all font-mono">{credentials.temporaryPassword}</dd></div></dl><p className="mt-3 text-xs leading-5 text-[#64748B]">Al iniciar sesión, la persona puede definir su contraseña desde «Mi contraseña». No se envían correos automáticamente.</p>{copied && <p role="status" className="mt-3 text-xs text-[#087D79]">{copied}</p>}</CaseBankDialog>}
    {action && <CaseBankDialog title={action.kind === 'delete' ? 'Eliminar cuenta' : action.kind === 'password' ? 'Restablecer contraseña' : action.account.status === 'active' ? 'Desactivar cuenta' : 'Reactivar cuenta'} busy={busy} onClose={() => { if (!busy) { setAction(null); setPassword(''); setRepeat(''); } }} footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => { setAction(null); setPassword(''); setRepeat(''); }} className={SECONDARY}>Cancelar</button><button type="button" disabled={busy || (action.kind === 'delete' && confirm !== (action.account.username || action.account.email))} onClick={runAction} className={action.kind === 'delete' ? 'rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40' : PRIMARY}>{busy ? 'Procesando…' : 'Confirmar'}</button></div>}>
      <p className="break-words text-sm leading-7 text-[#475569]">Cuenta: <b>{action.account.displayName}</b> · {action.account.username || action.account.email}</p>
      {action.kind === 'delete' && <><p className="mt-3 text-sm leading-6 text-red-700">Se eliminará el acceso de esta persona. Esta acción no se puede deshacer. Los procesos, empresas y respuestas de evaluación se conservarán.</p><label className="mt-4 block text-xs font-semibold text-[#475569]">Escribe {action.account.username || action.account.email} para confirmar<input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={`${FIELD} mt-1.5`} /></label></>}
      {action.kind === 'status' && <p className="mt-3 text-sm leading-6 text-[#64748B]">{action.account.status === 'active' ? 'Se bloqueará el acceso de esta cuenta y se revocarán sus sesiones. Sus permisos se conservarán para una posible reactivación.' : 'Esta cuenta podrá volver a iniciar sesión con sus permisos asignados.'}</p>}
      {action.kind === 'password' && <fieldset disabled={busy} className="mt-4 space-y-4"><p className="text-xs leading-6 text-[#64748B]">Se revocarán las sesiones anteriores. Entrega la nueva contraseña por un canal privado.</p><label className="block text-xs font-semibold text-[#475569]">Nueva contraseña<input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${FIELD} mt-1.5`} /></label><label className="block text-xs font-semibold text-[#475569]">Confirmar nueva contraseña<input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={`${FIELD} mt-1.5`} /></label></fieldset>}
      {actionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
    </CaseBankDialog>}
  </div></div>;
}
