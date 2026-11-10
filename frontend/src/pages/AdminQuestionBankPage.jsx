import { useEffect, useRef, useState } from 'react';
import * as api from '../services/questionBankApi.js';
import { CaseBankDialog } from '../components/admin/CaseBankDialog.jsx';
import { QuestionGroupEditor } from '../components/admin/QuestionGroupEditor.jsx';
import { LikertQuestionnaire } from '../components/evaluation/LikertQuestionnaire.jsx';
import { SpinnerIcon } from '../components/auth/icons.jsx';

const PRIMARY = 'rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-40';
const SECONDARY = 'rounded-xl border border-[#D9E2EA] bg-white px-3 py-2.5 text-xs font-semibold text-[#334E68] hover:border-[#0AADA8] disabled:opacity-40';
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export function AdminQuestionBankPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const reload = async () => {
    const id = ++requestId.current;
    setLoading(true); setLoadError('');
    try { const data = await api.listQuestionGroups(); if (id === requestId.current) setGroups(data); }
    catch (e) { if (id === requestId.current) setLoadError(e.response?.data?.error?.message || 'No se pudo cargar el banco.'); }
    finally { if (id === requestId.current) setLoading(false); }
  };
  useEffect(() => { reload(); return () => { requestId.current += 1; }; }, []);
  const upsert = (saved) => setGroups((old) => old.some((group) => group.id === saved.id) ? old.map((group) => group.id === saved.id ? saved : group) : [saved, ...old]);
  const save = async (payload) => {
    const saved = editor.group ? await api.updateQuestionGroup(editor.group.id, payload) : await api.createQuestionGroup(payload);
    upsert(saved); setEditor(null); setNotice(`«${saved.name}» guardado como versión ${saved.version}.`); setSearch(''); setFilter('all'); setPage(1);
  };
  const changeStatus = async (group, active) => {
    setBusy(true); setError('');
    try { const saved = await api.setQuestionGroupActive(group, active); upsert(saved); setNotice(`«${saved.name}» ${active ? 'activo para nuevos procesos' : 'desactivado'}. Los procesos existentes conservan sus preguntas.`); setConfirmation(null); }
    catch (e) { setError(e.response?.data?.error?.message || e.message || 'No se pudo cambiar el estado.'); }
    finally { setBusy(false); }
  };
  const showHistory = async (group) => {
    setHistory({ group, versions: null, error: '' });
    try { const versions = await api.getQuestionGroupVersions(group.id); setHistory((old) => old?.group.id === group.id ? { ...old, versions } : old); }
    catch (e) { setHistory((old) => old?.group.id === group.id ? { ...old, error: 'No se pudo cargar el historial. Intenta nuevamente.' } : old); }
  };
  const counts = { all: groups.length, active: groups.filter((group) => group.active).length, inactive: groups.filter((group) => !group.active).length };
  const visible = groups.filter((group) => filter === 'all' || (filter === 'active' ? group.active : !group.active))
    .filter((group) => normalize([group.name, group.description, ...group.questions.map((q) => q.dimension)].join(' ')).includes(normalize(search.trim())))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
  const pages = Math.max(1, Math.ceil(visible.length / 6));
  const currentPage = Math.min(page, pages);
  const clear = () => { setSearch(''); setFilter('all'); setPage(1); };

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1 basis-[28rem]"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Módulo A</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Banco de Preguntas</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Gestiona grupos versionados de preguntas Likert. Cada proceso recibe un grupo activo al azar y todos sus participantes contestan la misma versión.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading || busy} onClick={reload} className={SECONDARY}>Actualizar</button><button type="button" onClick={() => { setEditor({ group: null }); setError(''); setNotice(''); }} className={PRIMARY}>+ Nuevo grupo</button></div></header>
    {notice && <div role="status" className="mt-5 flex justify-between gap-3 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-sm text-[#087D79]"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}
    {error && !confirmation && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section aria-label="Resumen del banco" className="mt-6 grid gap-4 sm:grid-cols-3">{[['Grupos activos', `${counts.active} de ${counts.all}`, 'Elegibles para nuevos procesos'], ['Preguntas en el banco', groups.reduce((n, group) => n + group.questions.length, 0), 'En la versión actual de cada grupo'], ['Versiones registradas', groups.reduce((n, group) => n + group.version, 0), 'Historial conservado para consulta']].map(([label, value, hint]) => <div key={label} className="rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-[#64748B]">{label}</p><p className="mt-2 font-display text-2xl font-bold text-[#10233A]">{loading || loadError ? '—' : value}</p><p className="mt-1 text-xs text-[#64748B]">{hint}</p></div>)}</section>
    {!loading && !loadError && counts.active === 0 && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No hay grupos activos. Activa al menos uno para que las empresas puedan crear nuevos procesos.</p>}
    <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div role="group" aria-label="Filtrar grupos" className="inline-flex self-start rounded-xl border border-[#DDE5EC] bg-white p-1">{[['all', 'Todos'], ['active', 'Activos'], ['inactive', 'Inactivos']].map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${filter === id ? 'bg-[#0AADA8] text-white' : 'text-[#475569]'}`}>{label} <span className="ml-1 text-xs opacity-70">{loading || loadError ? '—' : counts[id]}</span></button>)}</div><label className="block text-xs font-semibold text-[#475569]">Buscar grupo<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Nombre, descripción o dimensión…" className="mt-1.5 block w-full rounded-xl border border-[#DDE5EC] bg-white px-3 py-2.5 text-sm sm:w-80" /></label></div>
    {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#64748B]"><SpinnerIcon className="h-5 w-5 animate-spin" />Cargando grupos…</div> : loadError ? <div role="alert" className="mt-6 rounded-xl bg-red-50 p-6 text-center text-sm text-red-700"><p>{loadError}</p><button type="button" onClick={reload} className={`${SECONDARY} mt-4`}>Reintentar</button></div> : <>
      <div className="mt-4 flex justify-between gap-3 text-xs text-[#64748B]"><p role="status">{visible.length} de {groups.length} grupos · Activos primero</p>{(filter !== 'all' || search) && <button type="button" onClick={clear} className="font-semibold text-[#087D79]">Limpiar filtros</button>}</div>
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">{visible.slice((currentPage - 1) * 6, currentPage * 6).map((group) => <article key={group.id} aria-label={group.name} className={`min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm ${group.active ? 'border-[#BFE5E2]' : 'border-[#DDE5EC]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5"><div className="min-w-0 flex-1"><h2 className="break-words font-display text-lg font-bold text-[#101828]">{group.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#64748B]">{group.description || 'Sin descripción'}</p></div><button type="button" role="switch" aria-checked={group.active} aria-label={`${group.active ? 'Desactivar' : 'Activar'} ${group.name}`} disabled={busy} onClick={() => { setError(''); if (group.active) setConfirmation(group); else changeStatus(group, true); }} className="flex items-center gap-2 text-xs text-[#64748B] disabled:opacity-40"><span className={`relative h-6 w-10 rounded-full ${group.active ? 'bg-[#0AADA8]' : 'bg-[#CBD5E1]'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white ${group.active ? 'left-5' : 'left-1'}`} /></span>{group.active ? 'Activo' : 'Inactivo'}</button></div>
        <div className="flex flex-wrap gap-2 px-5 text-xs font-medium text-[#475569]"><span className="rounded-lg bg-[#E0F7F6] px-2.5 py-1 text-[#087D79]">Versión {group.version}</span><span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1">{group.questions.length} preguntas</span><span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1">Likert 1–5</span></div>
        <details className="mt-4 border-t border-[#EEF2F6]"><summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[#334E68]">Ver preguntas de esta versión</summary><ol className="list-inside list-decimal space-y-3 border-t border-[#EEF2F6] bg-[#FAFCFE] p-5 text-sm leading-6 text-[#475569]">{group.questions.map((q) => <li key={q.id} className="whitespace-pre-wrap break-words">{q.text}{q.dimension && <span className="block text-xs text-[#087D79]">{q.dimension}</span>}</li>)}</ol></details>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#EEF2F6] p-4"><button type="button" onClick={() => showHistory(group)} className={SECONDARY}>Historial</button><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreview(group)} className={SECONDARY}>Vista previa</button><button type="button" disabled={busy} onClick={() => { setEditor({ group }); setNotice(''); }} className={`${PRIMARY} text-xs`}>Editar / nueva versión</button></div></div>
      </article>)}</div>
      {!visible.length && <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#64748B]">No hay grupos que coincidan con los filtros.<button type="button" onClick={clear} className="ml-2 font-semibold text-[#087D79] underline">Ver todos</button></div>}
      {pages > 1 && <nav aria-label="Páginas de grupos" className="mt-5 flex flex-wrap justify-between gap-3 text-xs text-[#64748B]"><span>Página {currentPage} de {pages}</span><div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={SECONDARY}>Anterior</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={SECONDARY}>Siguiente</button></div></nav>}
    </>}
    {editor && <QuestionGroupEditor group={editor.group} onClose={() => setEditor(null)} onSave={save} />}
    {preview && <CaseBankDialog wide title={`Vista previa · ${preview.name} · v${preview.version}`} description="Simulación: las respuestas no se guardan." onClose={() => setPreview(null)}><LikertQuestionnaire key={`${preview.id}-${preview.version}`} questionnaire={preview} preview /></CaseBankDialog>}
    {history && <CaseBankDialog wide title={`Historial · ${history.group.name}`} description="Las versiones son inmutables. Los procesos conservan la versión que recibieron al crearse." onClose={() => setHistory(null)}>
      {history.error ? <div role="alert" className="text-sm text-red-700"><p>{history.error}</p><button type="button" onClick={() => showHistory(history.group)} className={`${SECONDARY} mt-3`}>Reintentar</button></div> : !history.versions ? <p role="status" className="text-sm text-[#64748B]">Cargando versiones…</p> : <div className="space-y-4">{history.versions.map((version) => <section key={version.version} className="rounded-xl border border-[#DDE5EC] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Versión {version.version}{version.version === history.group.version ? ' · Actual' : ''}</h3><p className="mt-1 text-xs text-[#64748B]">{version.questions.length} preguntas · {new Date(version.updatedAt).toLocaleString('es-GT')}</p></div><button type="button" onClick={() => { setHistory(null); setPreview(version); }} className={SECONDARY}>Simular versión {version.version}</button></div><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[#087D79]">Consultar contenido</summary><h4 className="mt-3 break-words text-sm font-semibold">{version.name}</h4><p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#64748B]">{version.description}</p><ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-[#475569]">{version.questions.map((q) => <li key={q.id} className="whitespace-pre-wrap break-words">{q.text}{q.dimension && <span className="ml-2 text-xs text-[#087D79]">({q.dimension})</span>}</li>)}</ol></details></section>)}</div>}
    </CaseBankDialog>}
    {confirmation && <CaseBankDialog title="Desactivar grupo" onClose={() => { if (!busy) setConfirmation(null); }} busy={busy} footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => setConfirmation(null)} className={SECONDARY}>Cancelar</button><button type="button" disabled={busy} onClick={() => changeStatus(confirmation, false)} className={PRIMARY}>{busy ? 'Procesando…' : 'Desactivar'}</button></div>}><p className="break-words text-sm leading-7 text-[#475569]">«<b>{confirmation.name}</b>» no se elegirá para nuevos procesos. Los procesos existentes conservarán sus preguntas y podrán completarse.</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</CaseBankDialog>}
  </div></div>;
}
