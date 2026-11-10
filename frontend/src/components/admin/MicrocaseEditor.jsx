import { useEffect, useRef, useState } from 'react';
import { MicrocaseDialog } from './MicrocaseDialog.jsx';
import { SpinnerIcon } from '../auth/icons.jsx';
import { blankMicrocase, editForm, isReady, microcasePayload, moveItem, newQuestion, newSection, questionCount, validateMicrocase } from '../../pages/adminMicrocases.js';

const FIELD = 'mt-1.5 w-full rounded-xl border border-[#D9E2EA] bg-white px-3.5 py-2.5 text-sm text-[#10233A] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20';
const SECONDARY = 'rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F6F9FC] disabled:opacity-40';
const PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-50';
const STEPS = ['Información', 'Historia', 'Habilidades y preguntas'];

export function MicrocaseEditor({ item, onClose, onSave }) {
  const [form, setForm] = useState(() => item ? editForm(item) : blankMicrocase());
  const initial = useRef(JSON.stringify(form));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [undo, setUndo] = useState(null);
  const [focusField, setFocusField] = useState(null);
  const content = useRef(null);
  useEffect(() => {
    if (focusField) { document.getElementById(focusField)?.focus(); setFocusField(null); }
  }, [step, focusField]);
  const patch = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setError(''); setUndo(null); };
  const updateSection = (id, changes) => patch('sections', form.sections.map((section) => section.id === id ? { ...section, ...changes } : section));
  const requestClose = () => {
    if (saving) return;
    if (JSON.stringify(form) !== initial.current) setDiscard(true); else onClose();
  };
  const go = (target) => {
    setStep(target); setError(''); setUndo(null);
    content.current?.closest('dialog')?.scrollTo?.({ top: 0 });
  };
  const remove = (sections) => { patch('sections', sections); setUndo(form); };
  const save = async () => {
    const issue = validateMicrocase(form);
    if (issue) { setStep(issue.step); setError(issue.message); setFocusField(issue.field); return; }
    setSaving(true); setError('');
    try { await onSave(microcasePayload(form)); }
    catch (requestError) { setError(requestError.message || 'No se pudo guardar el microcaso.'); }
    finally { setSaving(false); }
  };

  return <MicrocaseDialog wide title={item ? 'Editar microcaso' : 'Nuevo microcaso'} description="Crea una historia y organiza el banco de preguntas por habilidades." onClose={requestClose} busy={saving}
    footer={<>
      {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {discard ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Tienes cambios sin guardar.</p><p className="mt-1">¿Quieres descartarlos y cerrar el editor?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDiscard(false)} className={SECONDARY}>Seguir editando</button><button type="button" onClick={onClose} className="rounded-xl bg-red-700 px-4 py-2.5 font-semibold text-white">Descartar cambios</button></div></div>
        : <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={requestClose} disabled={saving} className={SECONDARY}>Cancelar</button><div className="flex flex-wrap gap-2">
          {step > 0 && <button type="button" aria-label="Anterior" onClick={() => go(step - 1)} disabled={saving} className={SECONDARY}><span aria-hidden="true" className="sm:hidden">←</span><span className="hidden sm:inline">Anterior</span></button>}
          {step < 2 ? <button type="button" onClick={() => go(step + 1)} className={PRIMARY}>Continuar →</button> : <button type="button" aria-label={saving ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear microcaso'} onClick={save} disabled={saving} className={PRIMARY}>{saving && <SpinnerIcon className="h-4 w-4 animate-spin" />}<span className="sm:hidden">{saving ? 'Guardando…' : item ? 'Guardar' : 'Crear'}</span><span className="hidden sm:inline">{saving ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear microcaso'}</span></button>}
        </div></div>}
    </>}>
    <div ref={content}>
      <nav aria-label="Pasos del editor" className="mb-6 grid grid-cols-3 gap-2">
        {STEPS.map((label, index) => <button key={label} type="button" disabled={saving} onClick={() => go(index)} aria-current={step === index ? 'step' : undefined}
          className={`rounded-xl border px-2 py-3 text-left text-xs font-semibold sm:px-4 ${step === index ? 'border-[#A7E4DE] bg-[#E0F7F6] text-[#087D79]' : 'border-[#E5EAF0] text-[#64748B] hover:bg-[#F7F9FC]'}`}><span className="mb-1 block text-[10px] uppercase tracking-wide">Paso {index + 1}</span>{label}</button>)}
      </nav>
      <fieldset disabled={saving} className="min-w-0">
        {step === 0 && <div className="space-y-5">
          <div><h3 className="font-display text-lg font-bold">Información general</h3><p className="mt-1 text-sm text-[#64748B]">Identifica el caso y define el tiempo total de evaluación.</p></div>
          <label className="block text-sm font-medium" htmlFor="microcase-name">Nombre del microcaso<input id="microcase-name" value={form.name} onChange={(event) => patch('name', event.target.value)} className={FIELD} placeholder="Ej.: Una decisión en equipo" /></label>
          <label className="block text-sm font-medium">Descripción breve (opcional)<input value={form.description} onChange={(event) => patch('description', event.target.value)} className={FIELD} placeholder="Una referencia para identificarlo en el banco" /></label>
          <label className="block text-sm font-medium" htmlFor="microcase-time">Tiempo límite general (minutos)<input id="microcase-time" type="number" min="1" max="240" step="1" value={form.timeLimitMinutes} onChange={(event) => patch('timeLimitMinutes', event.target.value)} className={FIELD} /></label>
          <p className="rounded-xl border border-[#DDE8F2] bg-[#F7F9FC] p-4 text-xs leading-6 text-[#64748B]">Entre 1 y 240 minutos. El contador comienza cuando el participante pulsa «Comenzar» e incluye la lectura de la historia y todas las preguntas.</p>
          {item?.active && <label className="flex items-center gap-3 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-sm font-semibold text-[#087D79]"><input type="checkbox" className="h-4 w-4 accent-[#0AADA8]" checked={form.active} onChange={(event) => patch('active', event.target.checked)} />Mantener activo</label>}
          {!item && <p className="text-xs leading-5 text-[#64748B]">El nuevo microcaso se guarda como inactivo. Podrás revisarlo y activarlo desde el banco cuando esté completo.</p>}
        </div>}
        {step === 1 && <div>
          <h3 className="font-display text-lg font-bold">Historia del microcaso</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Describe la situación que leerá el participante antes de responder. Separa los párrafos con una línea en blanco.</p>
          <label htmlFor="microcase-story" className="mt-5 block text-sm font-medium">Texto de la historia</label>
          <textarea id="microcase-story" value={form.story} onChange={(event) => patch('story', event.target.value)} rows={12} className={`${FIELD} resize-y leading-7`} placeholder="Presenta el contexto, los personajes y el dilema…" />
          <p className="mt-2 text-right text-xs text-[#64748B]">{form.story.length.toLocaleString('es-GT')} caracteres</p>
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-800">Al pasar a las preguntas, el participante ya no podrá consultar esta historia. Incluye toda la información necesaria para comprender la situación.</p>
        </div>}
        {step === 2 && <div className="space-y-5">
          <div><h3 className="font-display text-lg font-bold">Habilidades y preguntas</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Se elige una pregunta al azar por cada habilidad seleccionada por la empresa. Agrega variantes para ampliar el banco.</p></div>
          {undo && <div role="status" className="flex flex-wrap justify-between gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><span>Contenido retirado. Puedes recuperar la última eliminación.</span><button type="button" onClick={() => { setForm(undo); setUndo(null); }} className="font-bold underline">Deshacer</button></div>}
          {form.sections.map((section, index) => <section key={section.id} className="rounded-2xl border border-[#BFE5E2] p-4 sm:p-5" aria-label={`Habilidad ${index + 1}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-[#087D79]">Habilidad {index + 1}</h4><div className="flex items-center gap-1">
              <button type="button" aria-label={`Subir habilidad ${index + 1}`} disabled={index === 0} onClick={() => patch('sections', moveItem(form.sections, index, -1))} className="rounded-lg px-2 py-1 text-sm hover:bg-[#F1F5F9] disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Bajar habilidad ${index + 1}`} disabled={index === form.sections.length - 1} onClick={() => patch('sections', moveItem(form.sections, index, 1))} className="rounded-lg px-2 py-1 text-sm hover:bg-[#F1F5F9] disabled:opacity-30">↓</button>
              <button type="button" disabled={form.sections.length === 1} onClick={() => remove(form.sections.filter((value) => value.id !== section.id))} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-30">Quitar habilidad</button>
            </div></div>
            <label htmlFor={`skill-${section.id}`} className="block text-xs font-medium text-[#475569]">Nombre de la habilidad {index + 1}</label>
            <input id={`skill-${section.id}`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} className={FIELD} />
            <div className="mt-4 space-y-3">{section.questions.map((question, questionIndex) => <div key={question.id} className="rounded-xl border border-[#DDE5EC] bg-[#FAFBFC] p-3">
              <div className="flex items-center justify-between gap-2"><label htmlFor={`question-${question.id}`} className="text-xs font-semibold text-[#475569]">Pregunta {questionIndex + 1}</label><button type="button" aria-label={`Quitar pregunta ${questionIndex + 1} de habilidad ${index + 1}`} onClick={() => remove(form.sections.map((value) => value.id === section.id ? { ...value, questions: value.questions.filter((q) => q.id !== question.id) } : value))} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Quitar</button></div>
              <textarea id={`question-${question.id}`} aria-label={`Texto de la pregunta ${questionIndex + 1} de habilidad ${index + 1}`} rows={2} value={question.text} onChange={(event) => updateSection(section.id, { questions: section.questions.map((q) => q.id === question.id ? { ...q, text: event.target.value } : q) })} className={`${FIELD} resize-y`} placeholder="Escribe una afirmación para responder con la escala Likert…" />
            </div>)}</div>
            {!section.questions.length && <p className="mt-3 text-xs text-amber-800">Sin preguntas. Podrás guardar el microcaso como inactivo, pero deberás completar esta habilidad antes de activarlo.</p>}
            <button type="button" onClick={() => updateSection(section.id, { questions: [...section.questions, newQuestion()] })} className="mt-3 w-full rounded-xl border border-dashed border-[#9ED9D5] py-2.5 text-sm font-semibold text-[#087D79] hover:bg-[#F4FBFB]">+ Agregar pregunta</button>
          </section>)}
          <button type="button" onClick={() => patch('sections', [...form.sections, newSection(`Habilidades éticas ${form.sections.length + 1}`)])} className="w-full rounded-xl border-2 border-dashed border-[#9ED9D5] py-3 text-sm font-semibold text-[#087D79]">+ Agregar habilidad</button>
          <div className="rounded-xl bg-[#F7F9FC] p-4"><p className="text-sm font-semibold">Escala de respuesta del participante</p><div className="mt-3 grid gap-2 sm:grid-cols-5">{['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'].map((label, index) => <div key={label} className="rounded-lg border border-[#DDE5EC] bg-white p-2 text-center text-xs text-[#64748B]"><b className="mb-1 block text-[#087D79]">{index + 1}</b>{label}</div>)}</div></div>
          <p className={`rounded-xl border p-4 text-xs leading-6 ${isReady(form) ? 'border-[#A7E4DE] bg-[#F0FFFE] text-[#087D79]' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{form.sections.length} habilidades · {questionCount(form)} preguntas con texto · {form.timeLimitMinutes || '—'} minutos. {isReady(form) ? 'Contenido completo para revisar y activar.' : 'Completa la historia y al menos una pregunta por habilidad para poder activarlo.'} Las preguntas vacías no se guardan.</p>
        </div>}
      </fieldset>
    </div>
  </MicrocaseDialog>;
}
