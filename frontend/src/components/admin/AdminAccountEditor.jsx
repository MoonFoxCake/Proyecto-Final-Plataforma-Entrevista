import { useState } from 'react';
import { CaseBankDialog } from './CaseBankDialog.jsx';
import { ADMIN_PERMISSION_CATALOG, can } from '../../utils/adminPermissions.js';
const FIELD = 'mt-1.5 w-full rounded-xl border border-[#D9E2EA] bg-white px-3 py-2.5 text-sm text-[#10233A] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30';
const PRESETS = [
  ['Evaluador', ['results.view', 'results.deliver']],
  ['Gestor de contenido', ['questions.manage', 'macrocases.manage', 'microcases.manage']],
  ['Gestor de cuentas', ['admins.view', 'admins.create', 'admins.manage', 'users.view']],
];
export function AdminAccountEditor({ account, actor, onClose, onSave }) {
  const [name, setName] = useState(account?.displayName || '');
  const [username, setUsername] = useState(account?.username || '');
  const [access, setAccess] = useState(account?.adminAccess === 'full' ? 'full' : 'restricted');
  const [permissions, setPermissions] = useState(account?.permissions || []);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fullAllowed = ['owner', 'full'].includes(actor?.adminAccess);
  const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose(); } };
  const change = (setter) => (event) => { setter(event.target.value); setDirty(true); setError(''); };
  const save = async () => {
    if (name.trim().length < 2 || (!account && !/^[a-z][a-z0-9._-]{2,39}$/.test(username.trim().toLowerCase()))) { setError('Indica un nombre y un usuario válido de 3 a 40 caracteres, empezando con una letra.'); return; }
    setBusy(true); setError('');
    try { await onSave({ displayName: name.trim(), adminAccess: access, permissions: access === 'full' ? [] : permissions, ...(!account ? { username: username.trim().toLowerCase() } : {}) }); }
    catch (e) { setError(e.response?.data?.error?.message || 'No se pudo guardar la cuenta.'); }
    finally { setBusy(false); }
  };
  const groups = [...new Set(ADMIN_PERMISSION_CATALOG.map((entry) => entry.group))];
  return <CaseBankDialog wide title={account ? 'Editar administrador' : 'Nuevo administrador'} description="Controla quién puede consultar, evaluar, gestionar contenido o administrar cuentas." onClose={close} busy={busy}
    footer={<>
      {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {discard ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>Hay cambios sin guardar. ¿Quieres descartarlos?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDiscard(false)} className="rounded-xl border px-3 py-2.5 font-semibold">Seguir editando</button><button type="button" onClick={onClose} className="rounded-xl bg-red-700 px-3 py-2.5 font-semibold text-white">Descartar cambios</button></div></div>
        : <div className="flex flex-wrap justify-between gap-3"><span className="self-center text-xs text-[#64748B]">{access === 'full' ? 'Todos los permisos administrativos' : `${permissions.length} permisos seleccionados`}</span><div className="flex gap-2"><button type="button" disabled={busy} onClick={close} className="rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm">Cancelar</button><button type="button" disabled={busy} onClick={save} className="rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Guardando…' : account ? 'Guardar cambios' : 'Crear cuenta'}</button></div></div>}
    </>}>
    <fieldset disabled={busy} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Nombre de la persona<input value={name} maxLength={120} onChange={change(setName)} className={FIELD} /></label><label className="block text-sm font-medium">Nombre de usuario<input value={username || account?.email || ''} disabled={Boolean(account)} autoComplete="off" maxLength={40} onChange={change(setUsername)} className={FIELD} placeholder="Ej.: evaluador.maria" /></label></div>
      {!account && <p className="rounded-xl bg-[#F7F9FC] p-4 text-xs leading-6 text-[#64748B]">No se necesita un correo. Se generará una contraseña aleatoria y se mostrará una sola vez después de crear la cuenta. La persona podrá cambiarla desde «Mi contraseña».</p>}
      <section><h3 className="font-display font-bold text-[#10233A]">Nivel de acceso</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{[['restricted', 'Permisos específicos', 'Selecciona solo las acciones que necesita esta persona.'], ['full', 'Control total', 'Acceso a todas las funciones administrativas, excepto modificar al propietario.']].map(([id, label, description]) => <label key={id} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${access === id ? 'border-[#A7E4DE] bg-[#F0FFFE]' : 'border-[#DDE5EC]'} ${id === 'full' && !fullAllowed ? 'opacity-50' : ''}`}><input type="radio" name="admin-access" value={id} checked={access === id} disabled={id === 'full' && !fullAllowed} onChange={change(setAccess)} className="mt-1 accent-[#0AADA8]" /><span><span className="block font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-[#64748B]">{description}</span></span></label>)}</div></section>
      {access === 'restricted' && <section className="space-y-5"><div><h3 className="font-display font-bold text-[#10233A]">Permisos</h3><p className="mt-1 text-xs leading-5 text-[#64748B]">Solo puedes conceder permisos que poseas. Las plantillas se pueden ajustar.</p></div><div className="flex flex-wrap gap-2">{PRESETS.map(([label, preset]) => <button key={label} type="button" disabled={!preset.every((permission) => can(actor, permission))} onClick={() => { setPermissions(preset); setDirty(true); }} className="rounded-xl border border-[#D9E2EA] px-3 py-2 text-xs font-semibold text-[#087D79] disabled:opacity-40">{label}</button>)}<button type="button" onClick={() => { setPermissions([]); setDirty(true); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#64748B]">Limpiar</button></div>
        {groups.map((group) => <div key={group}><h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#64748B]">{group}</h4><div className="grid gap-3 sm:grid-cols-2">{ADMIN_PERMISSION_CATALOG.filter((entry) => entry.group === group).map((entry) => <label key={entry.id} className={`flex items-start gap-3 rounded-xl border p-3 ${permissions.includes(entry.id) ? 'border-[#A7E4DE] bg-[#F0FFFE]' : 'border-[#E5EAF0]'} ${!can(actor, entry.id) ? 'opacity-50' : ''}`}><input type="checkbox" disabled={!can(actor, entry.id)} checked={permissions.includes(entry.id)} onChange={(e) => { setPermissions((old) => e.target.checked ? [...old, entry.id] : old.filter((id) => id !== entry.id)); setDirty(true); }} className="mt-1 h-4 w-4 shrink-0 accent-[#0AADA8]" /><span><span className="block text-xs font-semibold">{entry.label}</span><span className="mt-1 block text-xs leading-5 text-[#64748B]">{entry.description}</span></span></label>)}</div></div>)}
      </section>}
    </fieldset>
  </CaseBankDialog>;
}
