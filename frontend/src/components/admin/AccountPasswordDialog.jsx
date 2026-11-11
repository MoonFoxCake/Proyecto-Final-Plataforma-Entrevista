import { useState } from 'react';
import { CaseBankDialog } from './CaseBankDialog.jsx';
import { changePassword } from '../../services/authService.js';
export function AccountPasswordDialog({ onClose }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const save = async () => {
    if (password.length < 12 || password.length > 128 || password !== confirmation) { setError('Usa entre 12 y 128 caracteres y confirma la misma contraseña.'); return; }
    setBusy(true); setError('');
    try { await changePassword(current, password); setDone(true); setCurrent(''); setPassword(''); setConfirmation(''); }
    catch { setError('No se pudo cambiar la contraseña. Revisa la contraseña actual y vuelve a intentarlo.'); }
    finally { setBusy(false); }
  };
  const field = 'mt-1.5 w-full rounded-xl border border-[#D9E2EA] p-3 text-sm text-[#10233A]';
  return <CaseBankDialog title="Mi contraseña" onClose={onClose} busy={busy} description="Cambiar tu contraseña requiere confirmar la actual." footer={<div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm">{done ? 'Cerrar' : 'Cancelar'}</button>{!done && <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>}</div>}>
    {done ? <p role="status" className="rounded-xl bg-[#F0FFFE] p-4 text-sm text-[#087D79]">Contraseña actualizada correctamente.</p> : <fieldset disabled={busy} className="space-y-4"><label className="block text-sm font-medium">Contraseña actual<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} /></label><label className="block text-sm font-medium">Nueva contraseña<input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></label><label className="block text-sm font-medium">Confirmar nueva contraseña<input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={field} /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}</fieldset>}
  </CaseBankDialog>;
}
