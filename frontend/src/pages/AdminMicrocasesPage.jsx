import { useEffect, useRef, useState } from 'react';
import * as api from '../services/microcaseApi.js';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import { MicrocaseDialog } from '../components/admin/MicrocaseDialog.jsx';
import { MicrocaseEditor } from '../components/admin/MicrocaseEditor.jsx';
import { MicrocaseQuestionnaire } from '../components/evaluation/MicrocaseQuestionnaire.jsx';
import { isReady, normalizeSearch, questionCount, questionsOf, sectionsOf, usableSection } from './adminMicrocases.js';

const PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-50';
const SECONDARY = 'rounded-xl border border-[#D9E2EA] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#334E68] hover:border-[#0AADA8] hover:text-[#087D79] disabled:opacity-40';
const FIELD = 'w-full rounded-xl border border-[#DDE5EC] bg-white px-3.5 py-2.5 text-sm text-[#475569] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20';
const PAGE_SIZE = 6;
const plural = (n, single, multiple) => `${n} ${n === 1 ? single : multiple}`;

function MicrocaseCard({ item, busy, onEdit, onPreview, onToggle, onDelete }) {
  const sections = sectionsOf(item);
  const complete = isReady(item);
  return <article aria-label={item.name} className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${item.active ? 'border-[#BFE5E2]' : 'border-[#DDE5EC]'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 p-5">
      <div className="min-w-0 flex-1"><h2 className="break-words font-display text-lg font-bold text-[#101828]">{item.name}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#64748B]">{item.description || 'Sin descripción'}</p></div>
      <button type="button" role="switch" aria-checked={Boolean(item.active)} aria-label={`${item.active ? 'Desactivar' : 'Activar'} ${item.name}`} disabled={busy || (!item.active && !complete)} onClick={onToggle}
        title={!item.active && !complete ? 'Completa la historia y al menos una pregunta por habilidad para activar.' : undefined}
        className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 text-xs font-medium text-[#64748B] disabled:cursor-not-allowed disabled:opacity-50">
        <span className={`relative h-6 w-10 rounded-full transition ${item.active ? 'bg-[#0AADA8]' : 'bg-[#CBD5E1]'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${item.active ? 'left-5' : 'left-1'}`} /></span>{item.active ? 'Activo' : 'Inactivo'}
      </button>
    </div>
    <div className="flex flex-wrap gap-2 px-5 text-xs font-medium text-[#475569]">
      {[plural(sections.length, 'habilidad', 'habilidades'), plural(questionCount(item), 'pregunta', 'preguntas'), `${item.timeLimitMinutes ?? 15} min en total`].map((label) => <span key={label} className="rounded-lg bg-[#F6F9FC] px-2.5 py-1">{label}</span>)}
    </div>
    <p className={`mx-5 mb-4 mt-3 rounded-lg px-3 py-2 text-xs leading-5 ${complete ? 'bg-[#F0FFFE] text-[#087D79]' : 'bg-amber-50 text-amber-800'}`}>{complete ? 'Contenido completo · Una pregunta aleatoria por habilidad seleccionada.' : 'Contenido incompleto · Completa la historia y las preguntas antes de activarlo.'}</p>
    <details className="border-t border-[#EEF2F6]">
      <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[#334E68] hover:bg-[#FAFBFC]">Ver historia y habilidades</summary>
      <div className="space-y-4 border-t border-[#EEF2F6] bg-[#FAFCFE] p-5">
        <div><h3 className="text-xs font-bold uppercase tracking-wide text-[#087D79]">Historia</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#475569]">{item.story || 'Sin historia.'}</p></div>
        {sections.map((section, index) => <section key={section.id} className="rounded-xl border border-[#E5EAF0] bg-white p-4"><h3 className="break-words text-sm font-semibold text-[#10233A]">{index + 1}. {section.title || 'Habilidad sin nombre'}</h3>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-[#475569]">{questionsOf(section).map((question) => <li key={question.id} className="whitespace-pre-wrap break-words">{question.text}</li>)}</ol>
          {!questionsOf(section).length && <p className="mt-2 text-xs text-amber-800">Sin preguntas disponibles.</p>}
        </section>)}
        {!sections.length && <p className="text-xs text-amber-800">Este microcaso aún no tiene habilidades.</p>}
      </div>
    </details>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF2F6] p-4">
      <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg px-2 py-2 text-xs font-semibold text-[#B42318] hover:bg-red-50 disabled:opacity-40">Eliminar</button>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !item.story?.trim() || !sections.some(usableSection)} onClick={onPreview} className={SECONDARY}>Vista previa</button><button type="button" disabled={busy} onClick={onEdit} className={`${PRIMARY} text-xs`}>Editar</button></div>
    </div>
  </article>;
}

function MicrocasePreview({ item, onClose }) {
  const eligible = sectionsOf(item).filter(usableSection);
  const [selected, setSelected] = useState(() => eligible.map((section) => section.id));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try {
      const data = await api.previewMicrocase(item.id, selected);
      if (!data.sections?.length || data.sections.some((section) => !section.selectedQuestion?.text)) throw new Error('Hay habilidades sin una pregunta disponible. Revisa el contenido antes de iniciar.');
      setResult(data);
    } catch (requestError) { setError(requestError.message || 'No se pudo iniciar la vista previa.'); }
    finally { setBusy(false); }
  };
  return <MicrocaseDialog wide title={result ? 'Vista previa del candidato' : `Vista previa · ${item.name}`} description="Simulación: las respuestas no se guardan ni afectan evaluaciones reales." onClose={onClose} busy={busy}
    footer={!result && <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={onClose} disabled={busy} className={SECONDARY}>Cancelar</button><button type="button" disabled={busy || !selected.length} onClick={run} className={PRIMARY}>{busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}{busy ? 'Preparando…' : 'Iniciar vista previa'}</button></div>}>
    {result ? <><button type="button" onClick={() => setResult(null)} className="mb-3 text-xs font-semibold text-[#087D79] hover:underline">← Cambiar habilidades</button><MicrocaseQuestionnaire preview onExitPreview={onClose} microcase={{ name: result.name, story: result.story, timeLimitMinutes: item.timeLimitMinutes ?? 15, questions: result.sections.map((section) => ({ questionId: section.selectedQuestion.id, sectionTitle: section.title, question: section.selectedQuestion.text })) }} /></>
      : <><p className="text-sm leading-6 text-[#64748B]">Selecciona las habilidades que evaluaría la empresa. Se elegirá una pregunta al azar de cada habilidad seleccionada.</p>
        {eligible.length !== (item.sections || []).length && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Las habilidades incompletas no están disponibles en esta simulación.</p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{eligible.map((section) => <label key={section.id} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${selected.includes(section.id) ? 'border-[#A7E4DE] bg-[#F0FFFE]' : 'border-[#DDE5EC]'}`}>
          <input type="checkbox" disabled={busy} checked={selected.includes(section.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))} className="mt-1 h-4 w-4 shrink-0 accent-[#0AADA8]" />
          <span className="min-w-0"><span className="block break-words font-semibold">{section.title}</span><span className="mt-1 block text-xs text-[#64748B]">{plural(questionsOf(section).length, 'pregunta disponible', 'preguntas disponibles')}</span></span>
        </label>)}</div><p className="mt-4 text-xs text-[#64748B]">{selected.length} habilidades seleccionadas · {item.timeLimitMinutes ?? 15} minutos en total</p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </>}
  </MicrocaseDialog>;
}

export function AdminMicrocasesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const requestId = useRef(0);
  const reload = async () => {
    const id = ++requestId.current;
    setLoading(true); setLoadError('');
    try { const data = await api.listMicrocases(); if (id === requestId.current) setItems(data); }
    catch (error) { if (id === requestId.current) setLoadError(error.message || 'No se pudieron cargar los microcasos.'); }
    finally { if (id === requestId.current) setLoading(false); }
  };
  useEffect(() => { reload(); return () => { requestId.current += 1; }; }, []);
  const openEditor = (item = null) => { setActionError(''); setNotice(''); setEditor({ item }); };
  const save = async (payload) => {
    const saved = editor.item ? await api.updateMicrocase(editor.item.id, payload) : await api.createMicrocase(payload);
    setItems((current) => editor.item ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
    setNotice(editor.item ? 'Cambios del microcaso guardados.' : 'Microcaso creado como inactivo. Revisa su contenido y actívalo cuando esté listo.');
    setEditor(null); setSearch(''); setFilter('all'); setPage(1);
  };
  const activate = async (item) => {
    setBusyId(item.id); setActionError(''); setNotice('');
    try { const saved = await api.activateMicrocase(item.id); setItems((current) => current.map((value) => value.id === item.id ? saved : value)); setNotice(`«${item.name}» está activo y disponible para las empresas.`); }
    catch (error) { setActionError(error.message || 'No se pudo activar el microcaso.'); }
    finally { setBusyId(null); }
  };
  const confirmAction = async () => {
    const { item, kind } = confirmation;
    setBusyId(item.id); setActionError('');
    try {
      if (kind === 'delete') { await api.deleteMicrocase(item.id); setItems((current) => current.filter((value) => value.id !== item.id)); }
      else { const saved = await api.deactivateMicrocase(item.id); setItems((current) => current.map((value) => value.id === item.id ? saved : value)); }
      setNotice(kind === 'delete' ? 'Microcaso eliminado.' : 'Microcaso desactivado.'); setConfirmation(null);
    } catch (error) { setActionError(error.message || 'No se pudo completar la operación.'); }
    finally { setBusyId(null); }
  };
  const counts = { all: items.length, active: items.filter((item) => item.active).length, inactive: items.filter((item) => !item.active).length, incomplete: items.filter((item) => !isReady(item)).length };
  const visible = items.filter((item) => filter === 'all' || (filter === 'active' ? item.active : filter === 'inactive' ? !item.active : !isReady(item)))
    .filter((item) => normalizeSearch([item.name, item.description, ...sectionsOf(item).map((section) => section.title)].join(' ')).includes(normalizeSearch(search.trim())))
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.name || '').localeCompare(b.name || '', 'es'));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const paginated = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetFilters = () => { setFilter('all'); setSearch(''); setPage(1); };

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Fase C</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Banco de Microcasos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">Crea historias, organiza preguntas por habilidad y revisa la experiencia del participante antes de activar cada microcaso.</p></div><button type="button" onClick={() => openEditor()} disabled={Boolean(busyId)} className={PRIMARY}>+ Nuevo microcaso</button></header>
    {notice && <div role="status" className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-sm text-[#087D79]"><p>{notice}</p><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')} className="font-bold">×</button></div>}
    {actionError && !confirmation && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</p>}
    <section aria-label="Resumen de microcasos" className="mt-6 grid gap-4 sm:grid-cols-3">
      {[
        ['En el banco (activos)', `${counts.active} de ${counts.all}`, 'Disponibles para asignar a evaluaciones'],
        ['Habilidades y preguntas', `${items.reduce((n, item) => n + sectionsOf(item).length, 0)} · ${items.reduce((n, item) => n + questionCount(item), 0)}`, 'Contenido de todos los microcasos'],
        ['Por completar', counts.incomplete, 'Requieren contenido antes de activarse'],
      ].map(([label, value, hint]) => <div key={label} className="rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-[#64748B]">{label}</p><p className="mt-2 font-display text-2xl font-bold text-[#10233A]">{loading || loadError ? '—' : value}</p><p className="mt-1 text-xs text-[#64748B]">{hint}</p></div>)}
    </section>
    <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div role="group" aria-label="Filtrar microcasos" className="inline-flex flex-wrap gap-1 self-start rounded-xl border border-[#DDE5EC] bg-white p-1">{[['all', 'Todos'], ['active', 'Activos'], ['inactive', 'Inactivos'], ['incomplete', 'Por completar']].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === id ? 'bg-[#0AADA8] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}>{label} <span className="ml-1 opacity-70">{loading || loadError ? '—' : counts[id]}</span></button>)}</div>
      <div className="w-full sm:max-w-xs"><label htmlFor="microcase-search" className="mb-1.5 block text-xs font-semibold text-[#475569]">Buscar microcaso</label><input id="microcase-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={FIELD} placeholder="Nombre, descripción o habilidad…" /></div>
    </div>
    {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#64748B]"><SpinnerIcon className="h-5 w-5 animate-spin" />Cargando microcasos…</div>
      : loadError ? <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><p className="text-sm text-red-700">{loadError}</p><button type="button" onClick={reload} className={`${SECONDARY} mt-4`}>Reintentar</button></div>
        : <><div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-[#64748B]"><p role="status">{visible.length} de {items.length} microcasos · Activos primero</p>{(search || filter !== 'all') && <button type="button" onClick={resetFilters} className="font-semibold text-[#087D79] hover:underline">Limpiar filtros</button>}</div>
          <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">{paginated.map((item) => <MicrocaseCard key={item.id} item={item} busy={Boolean(busyId)} onEdit={() => openEditor(item)} onPreview={() => setPreview(item)} onToggle={() => { if (item.active) { setActionError(''); setConfirmation({ kind: 'deactivate', item }); } else activate(item); }} onDelete={() => { setActionError(''); setConfirmation({ kind: 'delete', item }); }} />)}</div>
          {!visible.length && <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center"><h2 className="font-semibold text-[#334155]">{items.length ? 'Ningún microcaso coincide con los filtros' : 'Aún no hay microcasos'}</h2><p className="mt-2 text-sm text-[#64748B]">{items.length ? 'Prueba otro nombre o habilidad, o limpia los filtros.' : 'Crea una historia y agrega preguntas para cada habilidad que quieras evaluar.'}</p><button type="button" onClick={items.length ? resetFilters : () => openEditor()} className={`${PRIMARY} mt-5`}>{items.length ? 'Ver todos los microcasos' : '+ Crear el primer microcaso'}</button></div>}
          {pages > 1 && <nav aria-label="Páginas de microcasos" className="mt-6 flex items-center justify-between gap-3"><span className="text-xs text-[#64748B]">Página {currentPage} de {pages}</span><div className="flex gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={SECONDARY}>Anterior</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={SECONDARY}>Siguiente</button></div></nav>}
        </>}
    {editor && <MicrocaseEditor item={editor.item} onClose={() => setEditor(null)} onSave={save} />}
    {preview && <MicrocasePreview item={preview} onClose={() => setPreview(null)} />}
    {confirmation && <MicrocaseDialog title={confirmation.kind === 'delete' ? 'Eliminar microcaso' : 'Desactivar microcaso'} onClose={() => { if (!busyId) { setConfirmation(null); setActionError(''); } }} busy={Boolean(busyId)}
      footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={Boolean(busyId)} onClick={() => { setConfirmation(null); setActionError(''); }} className={SECONDARY}>Cancelar</button><button type="button" disabled={Boolean(busyId)} onClick={confirmAction} className={confirmation.kind === 'delete' ? 'rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40' : PRIMARY}>{busyId ? 'Procesando…' : confirmation.kind === 'delete' ? 'Eliminar microcaso' : 'Desactivar'}</button></div>}>
      <p className="break-words text-sm leading-7 text-[#475569]">{confirmation.kind === 'delete' ? <>Se eliminará «<strong>{confirmation.item.name}</strong>» del banco. Esta acción no se puede deshacer.</> : <>«<strong>{confirmation.item.name}</strong>» dejará de estar disponible para nuevas asignaciones. Podrás volver a activarlo desde este banco.</>}</p>
      {actionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
    </MicrocaseDialog>}
  </div></div>;
}
