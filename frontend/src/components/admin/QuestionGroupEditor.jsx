import { useEffect, useRef, useState } from 'react';
import { CaseBankDialog, CaseEditorSteps } from './CaseBankDialog.jsx';
import { SpinnerIcon } from '../auth/icons.jsx';

const question = () => ({ id: crypto.randomUUID(), text: '', dimension: '' });
const FIELD = 'mt-1.5 w-full rounded-xl border border-[#D9E2EA] bg-white px-3.5 py-2.5 text-sm text-[#10233A] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30';
const SECONDARY = 'rounded-xl border border-[#D9E2EA] px-3 py-2.5 text-sm font-semibold text-[#475569] disabled:opacity-40';
const PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-40';

export function QuestionGroupEditor({ group, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ name: group?.name || '', description: group?.description || '', timeLimitMinutes: group?.timeLimitMinutes ?? 0, questions: group?.questions.map((q) => ({ ...q })) || [question()] }));
  const original = useRef(JSON.stringify(form));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(null);
  const [discard, setDiscard] = useState(false);
  const [undo, setUndo] = useState(null);
  const body = useRef(null);
  useEffect(() => { if (focus) { document.getElementById(focus)?.focus(); setFocus(null); } }, [step, focus]);
  const patch = (key, value) => { setForm((old) => ({ ...old, [key]: value })); setUndo(null); setError(''); };
  const close = () => { if (!busy) { if (JSON.stringify(form) === original.current) onClose(); else setDiscard(true); } };
  const go = (target) => { setStep(target); setError(''); body.current?.closest('dialog')?.scrollTo?.({ top: 0 }); };
  const move = (index, offset) => {
    const next = [...form.questions];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    patch('questions', next);
  };
  const save = async () => {
    if (!form.name.trim()) { setError('Escribe el nombre del grupo.'); setStep(0); setFocus('group-name'); return; }
    const empty = form.questions.findIndex((q) => !q.text.trim());
    if (!form.questions.length || empty !== -1) { setError('Cada pregunta necesita su texto.'); setStep(1); setFocus(`group-question-${empty}`); return; }
    const minutes = Number(form.timeLimitMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) { setError('El tiempo límite debe ser un número entero entre 0 y 240 minutos.'); setStep(0); setFocus('group-time'); return; }
    setBusy(true); setError('');
    try { await onSave({ ...form, timeLimitMinutes: minutes, name: form.name.trim(), description: form.description.trim(), questions: form.questions.map((q) => ({ ...q, text: q.text.trim(), dimension: q.dimension.trim() })), ...(group ? { baseVersion: group.version } : {}) }); }
    catch (requestError) { setError(requestError.response?.data?.error?.message || requestError.message || 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  return <CaseBankDialog wide title={group ? `Nueva versión · ${group.name}` : 'Nuevo grupo de preguntas'} description={group ? `Editas la versión ${group.version}. Al guardar se creará la versión ${group.version + 1}.` : 'Organiza un instrumento Likert completo para el Módulo A.'} busy={busy} onClose={close}
    footer={<>
      {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {discard ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>Tienes cambios sin guardar. ¿Quieres descartarlos?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDiscard(false)} className={SECONDARY}>Seguir editando</button><button type="button" onClick={onClose} className="rounded-xl bg-red-700 px-3 py-2.5 font-semibold text-white">Descartar cambios</button></div></div>
        : <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={close} disabled={busy} className={SECONDARY}>Cancelar</button><div className="flex gap-2">{step > 0 && <button type="button" onClick={() => go(step - 1)} aria-label="Anterior" disabled={busy} className={SECONDARY}>←</button>}{step < 2 ? <button type="button" onClick={() => go(step + 1)} className={PRIMARY}>Continuar →</button> : <button type="button" aria-label={busy ? "Guardando…" : group ? "Crear versión" : "Crear grupo"} disabled={busy} onClick={save} className={PRIMARY}>{busy && <SpinnerIcon className="h-4 w-4 animate-spin" />}<span className="sm:hidden">{busy ? 'Guardando…' : group ? 'Versionar' : 'Crear'}</span><span className="hidden sm:inline">{busy ? 'Guardando…' : group ? 'Crear versión' : 'Crear grupo'}</span></button>}</div></div>}
    </>}>
    <div ref={body}><CaseEditorSteps steps={['Información', 'Preguntas', 'Revisión']} current={step} onChange={go} busy={busy} />
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        {step === 0 && <>
          <div><h3 className="font-display text-lg font-bold">Información del grupo</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Cada proceso recibe todas las preguntas de una versión, en el orden definido aquí.</p></div>
          <label className="block text-sm font-medium">Nombre del grupo<input id="group-name" maxLength={120} value={form.name} onChange={(e) => patch('name', e.target.value)} className={FIELD} placeholder="Ej.: Habilidades éticas · Instrumento A" /></label>
          <label className="block text-sm font-medium">Descripción (opcional)<textarea maxLength={1000} rows={3} value={form.description} onChange={(e) => patch('description', e.target.value)} className={FIELD} /></label>
          <label className="block text-sm font-medium">Tiempo límite total (minutos)<input id="group-time" type="number" min="0" max="240" step="1" value={form.timeLimitMinutes} onChange={(e) => patch('timeLimitMinutes', e.target.value)} className={FIELD} /><span className="mt-1 block text-xs font-normal text-[#64748B]">0 significa sin límite. Si se agota, se envían las respuestas registradas.</span></label>
          <p className="rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-xs leading-6 text-[#087D79]">Las versiones anteriores y los procesos que ya recibieron preguntas se conservan. {group?.active ? 'La nueva versión quedará disponible para los próximos procesos porque este grupo está activo.' : 'El grupo debe estar activo para participar en la selección de nuevos procesos.'}</p>
        </>}
        {step === 1 && <>
          <div><h3 className="font-display text-lg font-bold">Preguntas del instrumento</h3><p className="mt-1 text-sm text-[#64748B]">Entre 1 y 100 afirmaciones. Todas se responden mediante una escala Likert de 1 a 5.</p></div>
          {undo && <div role="status" className="flex justify-between gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><span>Pregunta retirada.</span><button type="button" onClick={() => { setForm(undo); setUndo(null); }} className="font-bold underline">Deshacer</button></div>}
          {form.questions.map((q, index) => <section key={q.id} className="rounded-2xl border border-[#BFE5E2] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-[#087D79]">Pregunta {index + 1}</h4><div className="flex gap-1"><button type="button" aria-label={`Subir pregunta ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg px-2 py-1 disabled:opacity-30">↑</button><button type="button" aria-label={`Bajar pregunta ${index + 1}`} disabled={index === form.questions.length - 1} onClick={() => move(index, 1)} className="rounded-lg px-2 py-1 disabled:opacity-30">↓</button><button type="button" disabled={form.questions.length === 1} aria-label={`Quitar pregunta ${index + 1}`} onClick={() => { patch('questions', form.questions.filter((x) => x.id !== q.id)); setUndo(form); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-30">Quitar</button></div></div>
            <label className="mt-3 block text-xs font-medium text-[#475569]">Texto de la pregunta {index + 1}<textarea id={`group-question-${index}`} rows={3} maxLength={1000} value={q.text} onChange={(e) => patch('questions', form.questions.map((x) => x.id === q.id ? { ...x, text: e.target.value } : x))} className={FIELD} placeholder="Escribe una afirmación clara…" /></label>
            <label className="mt-3 block text-xs font-medium text-[#475569]">Habilidad o dimensión {index + 1} (opcional)<input maxLength={80} value={q.dimension} onChange={(e) => patch('questions', form.questions.map((x) => x.id === q.id ? { ...x, dimension: e.target.value } : x))} className={FIELD} placeholder="Ej.: Comunicación" /></label>
          </section>)}
          <button type="button" disabled={form.questions.length >= 100} onClick={() => patch('questions', [...form.questions, question()])} className="w-full rounded-xl border-2 border-dashed border-[#9ED9D5] py-3 text-sm font-semibold text-[#087D79] disabled:opacity-40">+ Agregar pregunta ({form.questions.length}/100)</button>
        </>}
        {step === 2 && <>
          <h3 className="font-display text-lg font-bold">Revisa antes de guardar</h3><div className="rounded-xl bg-[#F7F9FC] p-4"><p className="break-words font-semibold">{form.name || 'Grupo sin nombre'}</p><p className="mt-1 text-xs text-[#64748B]">Versión {group ? group.version + 1 : 1} · {form.questions.length} preguntas · {group?.active ? 'Activo' : 'Inactivo'}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#64748B]">{form.description}</p></div>
          <ol className="list-inside list-decimal space-y-3 text-sm leading-6 text-[#475569]">{form.questions.map((q) => <li key={q.id} className="whitespace-pre-wrap break-words rounded-xl border border-[#E5EAF0] p-3">{q.text || <span className="text-red-700">Pregunta sin texto</span>}{q.dimension && <span className="mt-1 block text-xs font-semibold text-[#087D79]">{q.dimension}</span>}</li>)}</ol>
          <div className="rounded-xl bg-[#F0FFFE] p-4 text-xs leading-6 text-[#087D79]"><b>Escala Likert</b><p>1 · Totalmente en desacuerdo<br />2 · En desacuerdo<br />3 · Neutral<br />4 · De acuerdo<br />5 · Totalmente de acuerdo</p></div>
          <p className="text-xs leading-6 text-[#64748B]">{group ? 'Esta acción conserva la versión anterior y crea una nueva. Los procesos existentes mantienen su instrumento asignado.' : 'El grupo se creará inactivo. Revísalo en la vista previa y actívalo cuando esté listo.'}</p>
        </>}
      </fieldset>
    </div>
  </CaseBankDialog>;
}
