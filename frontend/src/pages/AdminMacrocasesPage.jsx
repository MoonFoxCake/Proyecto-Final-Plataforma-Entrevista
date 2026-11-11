import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import { CaseBankDialog, CaseEditorSteps } from '../components/admin/CaseBankDialog.jsx';

import {
  getMacroCases,
  createMacroCase,
  updateMacroCase,
  activateMacroCase,
  deactivateMacroCase,
  deleteMacroCase,
  uploadMacroCaseAudio,
} from '../services/macrocaseApi';
import { usableSections } from '../components/evaluation/macrocase/macrocaseSources.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  instructions: '',
  defaultTimeLimit: 180,
  sections: [],
};

const MAX_NARRATIVE_LENGTH = 8000;
const PAGE_SIZE = 6;
const EDITOR_STEPS = ['Información', 'Respuestas', 'Secciones y preguntas'];
const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

const newId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const OPTIONS_PER_QUESTION = 4;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const emptyOptions = () => Array.from({ length: OPTIONS_PER_QUESTION }, () => ({ id: newId('option'), text: '' }));
/** Always exactly four option slots in the form, keeping the stored ones. */
const formOptions = (options = []) => [...options].sort(byOrder).slice(0, OPTIONS_PER_QUESTION)
  .concat(emptyOptions()).slice(0, OPTIONS_PER_QUESTION);
const emptyQuestion = () => ({ id: newId('question'), text: '', audioFile: null, options: emptyOptions() });
const completeOptions = (question) => (question.options || []).filter((option) => option.text?.trim()).length === OPTIONS_PER_QUESTION;
const emptySection = () => ({ id: newId('section'), title: '', narrative: '', narrativeAudio: {}, narrativeAudioFile: null, questions: [emptyQuestion()] });

const ALLOWED_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const FILTERS = [
  ['all', 'Todos'],
  ['active', 'Activos'],
  ['inactive', 'Inactivos'],
  ['incomplete', 'Por completar'],
  ['voice-error', 'Error de voz'],
];

const inputClass = 'mt-1.5 w-full rounded-xl border border-[#D9E2EA] bg-white px-3.5 py-2.5 text-sm text-[#10233A] placeholder:text-[#9AA8B8] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

function sectionsOf(item) {
  return [...(item.sections || [])].sort(byOrder).map((section) => ({
    ...section,
    questions: [...(section.questions || [])].sort(byOrder),
  }));
}

/** A narrative as a voiced item: `{ text, ...audio }`, like a question. */
const narrativeVoice = (section) => ({ ...(section.narrativeAudio || {}), text: section.narrative || '' });

/**
 * Where a question's voice comes from. `inForm`: the text may have been
 * edited since the voice was generated, so it will be regenerated on save.
 */
function voiceState(question, inForm = false) {
  const text = (question.text || '').trim();
  // Uploads made before generated voices existed have no `audioSource`.
  if (question.audioUrl && (question.audioSource === 'upload' || !question.audioSource)) return 'uploaded';
  if (question.audioSource === 'tts' && question.audioUrl && question.ttsText === text) return 'generated';
  if (!text) return 'empty';
  if (inForm) return 'pending';
  if (question.ttsError) return 'error';
  return 'missing';
}

const VOICE_BADGES = {
  generated: ['bg-[#E8F7F6] text-[#087D79]', 'Voz generada'],
  uploaded: ['bg-[#EEF6FF] text-[#315B88]', 'Audio subido'],
  pending: ['bg-amber-50 text-amber-700', 'Se generará al guardar'],
  error: ['bg-red-50 text-red-700', 'Error al generar la voz'],
  missing: ['bg-[#F1F5F9] text-[#64748B]', 'Sin voz · voz del navegador'],
  empty: ['bg-[#F1F5F9] text-[#64748B]', 'Sin texto'],
};

function VoiceBadge({ question, inForm = false }) {
  const state = voiceState(question, inForm);
  const [tone, label] = VOICE_BADGES[state];
  return (
    <span title={state === 'error' ? question.ttsError : undefined} className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

/**
 * Counts for a macrocase card. `incomplete`: sections without narrative or
 * questions, and questions without text — candidates never get those.
 * Voices cover every narrative and question that has text.
 */
function voiceSummary(item) {
  const sections = sectionsOf(item);
  const questions = sections.flatMap((section) => section.questions);
  const voiced = sections.flatMap((section) => [
    ...(section.narrative?.trim() ? [narrativeVoice(section)] : []),
    ...section.questions.filter((question) => question.text?.trim()),
  ]);
  const states = voiced.map((voice) => voiceState(voice));
  return {
    sections: sections.length,
    questions: questions.length,
    incomplete: sections.filter((section) => !section.narrative?.trim() || section.questions.length === 0).length
      + questions.filter((question) => !question.text?.trim() || !completeOptions(question)).length,
    total: voiced.length,
    ready: states.filter((state) => state === 'generated' || state === 'uploaded').length,
    errors: states.filter((state) => state === 'error').length,
  };
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function formatTimeLimit(seconds) {
  const value = Number(seconds);
  if (!value) return 'Sin límite de tiempo';
  if (value % 60 === 0) return `${value / 60} min por pregunta`;
  return value > 60 ? `${Math.floor(value / 60)} min ${value % 60} s por pregunta` : `${value} s por pregunta`;
}

/** One shared <audio> for the whole page, so only one question plays at a time. */
function useAudioPreview() {
  const audioRef = useRef(null);
  const [playingKey, setPlayingKey] = useState(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = (key, url) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => setPlayingKey(null));
      audioRef.current.addEventListener('error', () => setPlayingKey(null));
    }
    const audio = audioRef.current;
    if (playingKey === key) {
      audio.pause();
      setPlayingKey(null);
      return;
    }
    audio.pause();
    audio.src = url;
    audio.play().then(() => setPlayingKey(key)).catch(() => setPlayingKey(null));
  };

  const stop = () => {
    audioRef.current?.pause();
    setPlayingKey(null);
  };

  return { playingKey, toggle, stop };
}

function PlayButton({ playing, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? `Detener ${label}` : `Escuchar ${label}`}
      title={playing ? 'Detener' : 'Escuchar'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${playing ? 'border-[#0AADA8] bg-[#0AADA8] text-white' : 'border-[#D9E2EA] bg-white text-[#334E68] hover:border-[#0AADA8] hover:text-[#087D79]'}`}
    >
      {playing ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx="1" /><rect x="9.5" y="3" width="3" height="10" rx="1" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5" fill="currentColor" aria-hidden="true"><path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.4-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" /></svg>
      )}
    </button>
  );
}

function ActiveSwitch({ active, busy, onToggle, name }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? 'Desactivar' : 'Activar'} ${name}`}
      disabled={busy}
      onClick={onToggle}
      className="group flex shrink-0 items-center gap-2 disabled:opacity-60"
    >
      <span className={`text-xs font-semibold ${active ? 'text-[#087D79]' : 'text-[#7C8AA0]'}`}>{active ? 'Activo' : 'Inactivo'}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${active ? 'bg-[#0AADA8]' : 'bg-[#CBD5E1]'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${active ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-[#DDE5EC] bg-white p-4 shadow-sm">
      <p className="text-xs text-[#7C8AA0]">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-[#10233A]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[#64748B]">{hint}</p>}
    </div>
  );
}

function MacrocaseCard({ item, busy, expanded, onToggleExpanded, onToggleActive, onEdit, onDelete, audio }) {
  const sections = sectionsOf(item);
  const summary = voiceSummary(item);
  const unusable = item.active && usableSections(item).length === 0;

  return (
    <article aria-label={item.name} className={`flex min-w-0 flex-col rounded-2xl border bg-white shadow-sm transition ${item.active ? 'border-[#BFE5E2]' : 'border-[#DDE5EC]'}`}>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 className="break-words font-display text-lg font-bold text-[#101828]">{item.name}</h2>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-[#64748B]">{item.description || 'Sin descripción'}</p>
        </div>
        <ActiveSwitch active={item.active} busy={busy || (!item.active && usableSections(item).length === 0)} name={item.name} onToggle={onToggleActive} />
      </div>

      <div className="flex flex-wrap gap-2 px-5">
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{plural(summary.sections, 'sección', 'secciones')}</span>
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{plural(summary.questions, 'pregunta', 'preguntas')}</span>
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">Marca con X · 4 opciones</span>
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{formatTimeLimit(item.defaultTimeLimit)}</span>
      </div>

      {/* Same height whatever the status, so cards in a row line up. */}
      <div className="mt-3 flex h-10 items-center px-5">
        {summary.incomplete > 0 || sections.length === 0 ? (
          <p
            title={unusable ? 'Está activo, pero no se asignará a ningún evento hasta que tenga al menos una sección con texto y preguntas completas.' : 'Las secciones sin texto o sin preguntas, y las preguntas sin texto o sin sus 4 opciones, no se muestran a los candidatos.'}
            className="w-full truncate rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
          >
            {sections.length === 0 ? 'Sin secciones' : plural(summary.incomplete, 'elemento incompleto', 'elementos incompletos')} · {unusable ? 'no se asignará a eventos' : 'revisa el contenido'}. Edita para completarlo.
          </p>
        ) : summary.errors > 0 ? (
          <p title="Edita y guarda el macrocaso para volver a generar la voz." className="w-full truncate rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">{summary.errors} {summary.errors === 1 ? 'voz' : 'voces'} con error · edita y guarda para reintentar</p>
        ) : (
          <div className="flex w-full items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E6EDF3]">
              <div className="h-full rounded-full bg-[#0AADA8]" style={{ width: `${summary.total ? (summary.ready / summary.total) * 100 : 0}%` }} />
            </div>
            <span className="shrink-0 text-xs font-medium text-[#475569]">{summary.ready}/{summary.total} voces listas</span>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-[#EEF2F6]">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-[#334E68] hover:bg-[#FAFBFC]"
        >
          {expanded ? 'Ocultar secciones' : 'Ver secciones'}
          <svg viewBox="0 0 16 16" className={`h-4 w-4 text-[#7C8AA0] transition ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {expanded && (
          <ol className="divide-y divide-[#EEF2F6] border-t border-[#EEF2F6]">
            {sections.length === 0 && <li className="px-5 py-4 text-sm text-[#94A3B8]">Este macrocaso no tiene secciones.</li>}
            {sections.map((section, sectionIndex) => {
              const narrativeKey = `${item.id}:${section.id}:narrativa`;
              const narrative = narrativeVoice(section);
              return (
                <li key={section.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#0A8F8A]">Sección {sectionIndex + 1}{section.title ? ` · ${section.title}` : ''}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#475569]">{section.narrative || <span className="italic text-[#94A3B8]">Sin texto narrativo</span>}</p>
                      <div className="mt-1"><VoiceBadge question={narrative} /></div>
                    </div>
                    {narrative.audioUrl && (
                      <PlayButton playing={audio.playingKey === narrativeKey} onClick={() => audio.toggle(narrativeKey, narrative.audioUrl)} label={`la narración de la sección ${sectionIndex + 1}`} />
                    )}
                  </div>
                  <ol className="mt-3 space-y-2 border-l-2 border-[#E8F7F6] pl-3">
                    {section.questions.length === 0 && <li className="text-sm text-[#94A3B8]">Sin preguntas.</li>}
                    {section.questions.map((question, index) => {
                      const key = `${item.id}:${question.id}`;
                      return (
                        <li key={question.id} className="flex items-start gap-3">
                          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8F7F6] text-[11px] font-bold text-[#0A8F8A]">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-6 text-[#10233A]">{question.text || <span className="italic text-[#94A3B8]">Sin texto</span>}</p>
                            {(question.options || []).length > 0 && (
                              <ul className="mt-1 grid gap-0.5 text-xs text-[#56677B]">
                                {[...question.options].sort(byOrder).map((option, optionIndex) => <li key={option.id}><span className="font-semibold text-[#7C8AA0]">{OPTION_LETTERS[optionIndex]}.</span> {option.text}</li>)}
                              </ul>
                            )}
                            <div className="mt-1"><VoiceBadge question={question} /></div>
                          </div>
                          {question.audioUrl && (
                            <PlayButton playing={audio.playingKey === key} onClick={() => audio.toggle(key, question.audioUrl)} label={`la pregunta ${index + 1} de la sección ${sectionIndex + 1}`} />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#EEF2F6] px-5 py-3">
        <button type="button" disabled={busy} onClick={onDelete} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#B42318] hover:bg-red-50">Eliminar</button>
        <div className="flex gap-2">
          <Link to={`/admin/macrocases/${item.id}/preview`} className="rounded-xl border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] hover:border-[#0AADA8] hover:text-[#087D79]">Vista previa</Link>
          <button type="button" disabled={busy} onClick={onEdit} className="rounded-xl bg-[#0AADA8] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#089490]">Editar</button>
        </div>
      </div>
    </article>
  );
}

/** Play / voice status / upload / restore row for a narrative or a question in the form. */
function VoiceControls({ voice, file, playKey, label, audio, onUpload, onRestore }) {
  const uploaded = voiceState(voice) === 'uploaded';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {voice.audioUrl && !file && (
        <PlayButton playing={audio.playingKey === playKey} onClick={() => audio.toggle(playKey, voice.audioUrl)} label={label} />
      )}
      {file
        ? <span className="inline-flex rounded-full bg-[#EEF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#315B88]">Se subirá: {file.name}</span>
        : <VoiceBadge question={voice} inForm />}
      <span className="flex-1" />
      {uploaded && !file && (
        <button type="button" onClick={onRestore} className="text-xs font-semibold text-[#0A8F8A] hover:underline">Usar voz generada</button>
      )}
      <label className="cursor-pointer rounded-lg border border-[#D9E2EA] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] hover:border-[#0AADA8] hover:text-[#087D79]">
        {uploaded || file ? 'Cambiar audio' : 'Subir audio propio'}
        <input
          type="file"
          accept=".mp3,.wav,.ogg,.webm,audio/mpeg,audio/wav,audio/ogg,audio/webm"
          onChange={(e) => onUpload(e.target.files?.[0])}
          className="sr-only"
        />
      </label>
    </div>
  );
}

function FormSection({ title, description, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-base font-bold text-[#10233A]">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-[#64748B]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function AdminMacrocasesPage() {
  const [macrocasos, setMacrocasos] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const audio = useAudioPreview();
  const [step, setStep] = useState(0);
  const [discard, setDiscard] = useState(false);
  const [undo, setUndo] = useState(null);
  const [focusField, setFocusField] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationError, setConfirmationError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const baseline = useRef('');
  const persistedId = useRef(null);
  const formBody = useRef(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (focusField) { document.getElementById(focusField)?.focus(); setFocusField(null); }
  }, [step, focusField]);


  const loadMacroCases = async () => {
    const id = ++requestId.current;
    setLoadError('');
    try {
      setLoading(true);
      const items = await getMacroCases();
      if (id === requestId.current) setMacrocasos(items);
    } catch (error) {
      if (id === requestId.current) setLoadError(error.message || 'No se pudieron cargar los macrocasos.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadMacroCases();
    return () => { requestId.current += 1; };
  }, []);

  const counts = useMemo(() => ({
    all: macrocasos.length,
    active: macrocasos.filter((item) => item.active).length,
    inactive: macrocasos.filter((item) => !item.active).length,
    incomplete: macrocasos.filter((item) => !sectionsOf(item).length || voiceSummary(item).incomplete > 0).length,
    'voice-error': macrocasos.filter((item) => voiceSummary(item).errors > 0).length,
  }), [macrocasos]);

  const usableActive = macrocasos.filter((item) => item.active && usableSections(item).length > 0).length;
  const voices = macrocasos.reduce((total, item) => {
    const summary = voiceSummary(item);
    return {
      ready: total.ready + summary.ready,
      total: total.total + summary.total,
      errors: total.errors + summary.errors,
      sections: total.sections + summary.sections,
      questions: total.questions + summary.questions,
    };
  }, { ready: 0, total: 0, errors: 0, sections: 0, questions: 0 });

  const visible = macrocasos
    .filter((item) => filter === 'all' || (filter === 'active' ? item.active : filter === 'inactive' ? !item.active : filter === 'incomplete' ? !sectionsOf(item).length || voiceSummary(item).incomplete > 0 : voiceSummary(item).errors > 0))
    .filter((item) => normalizeSearch([item.name, item.description, ...sectionsOf(item).map((section) => section.title)].join(' ')).includes(normalizeSearch(search.trim())))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const paginated = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const clearFilters = () => { setFilter('all'); setSearch(''); setPage(1); };
  const upsert = (saved) => setMacrocasos((current) => current.some((item) => item.id === saved.id)
    ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);

  const openCreate = () => {
    audio.stop();
    setEditing(null);
    const next = { ...EMPTY_FORM, sections: [emptySection()] };
    setForm(next);
    baseline.current = JSON.stringify(next);
    persistedId.current = null;
    setStep(0); setDiscard(false); setUndo(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (item) => {
    audio.stop();
    setEditing(item);
    const next = {
      name: item.name || '',
      description: item.description || '',
      instructions: item.instructions || '',
      defaultTimeLimit: item.defaultTimeLimit ?? 180,
      sections: sectionsOf(item).map((section) => ({
        id: section.id,
        title: section.title || '',
        narrative: section.narrative || '',
        narrativeAudio: section.narrativeAudio || {},
        narrativeAudioFile: null,
        questions: section.questions.map((question) => ({ ...question, audioFile: null, options: formOptions(question.options) })),
      })),
    };
    setForm(next);
    baseline.current = JSON.stringify(next);
    persistedId.current = item.id;
    setStep(0); setDiscard(false); setUndo(null);
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    audio.stop();
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const requestCloseForm = () => {
    if (saving) return;
    audio.stop();
    if (JSON.stringify(form) !== baseline.current) setDiscard(true); else closeForm();
  };
  const goToStep = (target) => {
    audio.stop(); setStep(target); setFormError(''); setUndo(null);
    formBody.current?.closest('dialog')?.scrollTo?.({ top: 0 });
  };

  const updateField = (field, value) => {
    setUndo(null); setFormError('');
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateSections = (change) => { setUndo(null); setFormError(''); setForm((current) => ({ ...current, sections: change(current.sections) })); };

  const addSection = () => updateSections((sections) => [...sections, emptySection()]);

  const removeSection = (sectionId) => { updateSections((sections) => sections.filter((section) => section.id !== sectionId)); setUndo(form); };

  const moveSection = (sectionId, offset) => updateSections((sections) => {
    const index = sections.findIndex((section) => section.id === sectionId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= sections.length) return sections;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const updateSection = (sectionId, changes) => updateSections((sections) => sections.map((section) => (
    section.id === sectionId ? { ...section, ...changes } : section
  )));

  const updateQuestions = (sectionId, change) => updateSections((sections) => sections.map((section) => (
    section.id === sectionId ? { ...section, questions: change(section.questions) } : section
  )));

  const addQuestion = (sectionId) => updateQuestions(sectionId, (questions) => [...questions, emptyQuestion()]);

  const removeQuestion = (sectionId, questionId) => { updateQuestions(sectionId, (questions) => questions.filter((question) => question.id !== questionId)); setUndo(form); };

  const updateQuestion = (sectionId, questionId, changes) => updateQuestions(sectionId, (questions) => questions.map((question) => (
    question.id === questionId ? { ...question, ...changes } : question
  )));

  const updateOption = (sectionId, questionId, optionId, text) => updateQuestions(sectionId, (questions) => questions.map((question) => (
    question.id === questionId
      ? { ...question, options: question.options.map((option) => (option.id === optionId ? { ...option, text } : option)) }
      : question
  )));

  /** `target`: `{ sectionId }` for the narrative, `{ sectionId, questionId }` for a question. */
  const handleAudioChange = ({ sectionId, questionId }, file) => {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) {
      setFormError('El audio no puede superar los 10 MB.');
      return;
    }
    if (!ALLOWED_AUDIO.includes(file.type)) {
      setFormError('Usa un archivo de audio MP3, WAV, OGG o WEBM.');
      return;
    }
    setFormError('');
    if (questionId) updateQuestion(sectionId, questionId, { audioName: file.name, audioFile: file });
    else updateSection(sectionId, { narrativeAudioFile: file });
  };

  // Drops the uploaded audio: on save the backend generates the voice again.
  const restoreGeneratedVoice = ({ sectionId, questionId }) => {
    if (questionId) {
      updateQuestion(sectionId, questionId, { resetAudio: true, audioSource: '', audioUrl: '', audioName: '', audioFile: null });
    } else {
      updateSection(sectionId, { resetNarrativeAudio: true, narrativeAudio: {}, narrativeAudioFile: null });
    }
  };

  const validate = () => {
    if (!form.name.trim()) return { step: 0, field: 'macrocase-name', message: 'Indica el nombre del macrocaso.' };
    if (form.defaultTimeLimit === '' || !Number.isInteger(Number(form.defaultTimeLimit)) || Number(form.defaultTimeLimit) < 0) return { step: 1, field: 'macrocase-time', message: 'El tiempo por pregunta debe ser un número entero igual o mayor que 0.' };
    if (form.sections.length === 0) return { step: 2, message: 'Agrega al menos una sección.' };
    for (const [index, section] of form.sections.entries()) {
      if (!section.narrative.trim()) return { step: 2, field: `narrative-${section.id}`, message: `La sección ${index + 1} necesita su texto narrativo: es lo que lee y escucha el candidato.` };
      if (section.questions.length === 0) return { step: 2, message: `La sección ${index + 1} necesita al menos una pregunta.` };
      const missing = section.questions.find((question) => !question.text?.trim());
      if (missing) return { step: 2, field: `question-${missing.id}`, message: `Cada pregunta de la sección ${index + 1} necesita su texto: es lo que lee el asistente y ve el candidato.` };
      for (const [questionIndex, question] of section.questions.entries()) {
        const emptyOption = question.options.find((option) => !option.text.trim());
        if (emptyOption) return { step: 2, field: `option-${emptyOption.id}`, message: `La pregunta ${questionIndex + 1} de la sección ${index + 1} necesita sus 4 opciones de respuesta, ni más ni menos.` };
        const texts = question.options.map((option) => option.text.trim().toLocaleLowerCase('es'));
        if (new Set(texts).size !== OPTIONS_PER_QUESTION) return { step: 2, field: `option-${question.options[0].id}`, message: `La pregunta ${questionIndex + 1} de la sección ${index + 1} tiene opciones repetidas.` };
      }
    }
    return null;
  };

  const saveMacrocase = async () => {
    const problem = validate();
    if (problem) {
      setFormError(problem.message); setStep(problem.step); setFocusField(problem.field);
      return;
    }

    let contentSaved = false;
    try {
      setSaving(true);
      setFormError('');

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        instructions: form.instructions.trim(),
        responseType: 'choice',
        defaultTimeLimit: Number(form.defaultTimeLimit),
        // Audio fields are managed by the backend: it generates the voice
        // of every narrative, question and option whose text changed.
        sections: form.sections.map((section) => ({
          id: section.id,
          title: section.title.trim(),
          narrative: section.narrative.trim(),
          ...(section.resetNarrativeAudio ? { resetNarrativeAudio: true } : {}),
          questions: section.questions.map((question) => ({
            id: question.id,
            text: question.text.trim(),
            ...(question.resetAudio ? { resetAudio: true } : {}),
            options: question.options.map((option) => ({ id: option.id, text: option.text.trim() })),
          })),
        })),
      };

      let saved = persistedId.current ? await updateMacroCase(persistedId.current, payload) : await createMacroCase(payload);
      persistedId.current = saved.id;
      contentSaved = true;
      upsert(saved);

      for (const section of form.sections) {
        if (section.narrativeAudioFile) {
          saved = await uploadMacroCaseAudio(saved.id, { sectionId: section.id }, section.narrativeAudioFile);
        }
        for (const question of section.questions.filter((item) => item.audioFile)) {
          saved = await uploadMacroCaseAudio(saved.id, { questionId: question.id }, question.audioFile);
        }
      }

      const failed = voiceSummary(saved).errors;
      upsert(saved);
      closeForm();
      clearFilters();
      setNotice(failed
        ? { tone: 'warning', text: `"${saved.name}" se guardó, pero ${failed === 1 ? 'una voz no pudo generarse' : `${failed} voces no pudieron generarse`}. Esos textos se leerán con la voz del navegador.` }
        : { tone: 'success', text: `"${saved.name}" se guardó correctamente.` });
    } catch (error) {
      if (contentSaved) await loadMacroCases();
      setFormError(contentSaved ? `El contenido se guardó, pero no se completó la carga de audio. Puedes reintentar sin crear otro macrocaso. ${error.message || ''}` : error.message || 'No se pudo guardar el macrocaso.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    setBusyId(item.id);
    try {
      if (item.active) await deactivateMacroCase(item.id);
      else await activateMacroCase(item.id);
      await loadMacroCases();
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  };

  const askConfirmation = (item, kind) => {
    audio.stop(); setConfirmationError(''); setConfirmation({ item, kind });
  };
  const confirmAction = async () => {
    const { item, kind } = confirmation;
    setBusyId(item.id); setConfirmationError('');
    try {
      if (kind === 'delete') {
        await deleteMacroCase(item.id);
        setMacrocasos((current) => current.filter((value) => value.id !== item.id));
      } else {
        const saved = await deactivateMacroCase(item.id);
        upsert(saved);
      }
      setConfirmation(null);
      setNotice({ tone: 'success', text: `"${item.name}" ${kind === 'delete' ? 'se eliminó del banco' : 'se desactivó'}.` });
    } catch (error) { setConfirmationError(error.message || 'No se pudo completar la operación.'); }
    finally { setBusyId(null); }
  };

  const noticeTone = {
    success: 'border-[#A7E4DE] bg-[#F0FFFE] text-[#087D79]',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-700',
  };

  return (
    <div className="p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Fase B</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Banco de Macrocasos</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#64748B]">Los macrocasos activos forman el banco. Cuando una empresa envía el Módulo B, a su evento se le asigna uno al azar y todos sus candidatos reciben ese mismo caso.</p>
          </div>
          <button type="button" onClick={openCreate} disabled={Boolean(busyId)} className="shrink-0 rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490]">+ Nuevo macrocaso</button>
        </div>

        {notice && (
          <div className={`mt-6 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${noticeTone[notice.tone]}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso" className="text-base leading-none opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        {!loading && !loadError && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="En el banco (activos)" value={`${counts.active} de ${counts.all}`} hint={usableActive < counts.active ? `${counts.active - usableActive} sin secciones completas` : 'Disponibles para asignar'} />
            <StatCard label="Secciones y preguntas" value={`${voices.sections} · ${voices.questions}`} hint="Entre todos los macrocasos" />
            <StatCard label="Voces listas" value={`${voices.ready}/${voices.total}`} hint={voices.errors ? `${voices.errors} con error al generar` : 'Narraciones y preguntas, generadas o subidas'} />
          </div>
        )}

        {!loading && !loadError && counts.all > 0 && usableActive === 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No hay macrocasos activos con secciones completas: las empresas no podrán enviar el Módulo B. Activa al menos uno.</p>
        )}

        {!loading && !loadError && counts.all > 0 && (
          <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[#DDE5EC] bg-white p-1" role="group" aria-label="Filtrar macrocasos">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => { setFilter(id); setPage(1); }}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${filter === id ? 'bg-[#0AADA8] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}
                >
                  {label} <span className={filter === id ? 'text-white/80' : 'text-[#94A3B8]'}>{counts[id]}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Nombre, descripción o sección…"
              aria-label="Buscar macrocaso"
              className="w-full rounded-xl border border-[#DDE5EC] bg-white px-3.5 py-2 text-sm focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20 sm:w-64"
            />
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-[#64748B]"><SpinnerIcon className="mr-2 h-5 w-5 animate-spin" /> Cargando macrocasos...</div>
        ) : loadError ? (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><p className="text-sm text-red-700">{loadError}</p><button type="button" onClick={loadMacroCases} className="mt-4 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700">Reintentar</button></div>
        ) : counts.all === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center">
            <p className="font-semibold text-[#334155]">Aún no hay macrocasos</p>
            <p className="mt-1 text-sm text-[#94A3B8]">Crea el primero: un caso dividido en secciones, cada una con su texto y las preguntas que hará el asistente virtual.</p>
            <button type="button" onClick={openCreate} className="mt-5 rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490]">+ Nuevo macrocaso</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#94A3B8]">Ningún macrocaso coincide con el filtro. <button type="button" onClick={clearFilters} className="ml-2 font-semibold text-[#087D79] underline">Limpiar filtros</button></div>
        ) : (
          <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
            {paginated.map((item) => (
              <MacrocaseCard
                key={item.id}
                item={item}
                busy={Boolean(busyId)}
                expanded={expandedId === item.id}
                onToggleExpanded={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                onToggleActive={() => item.active ? askConfirmation(item, 'deactivate') : toggleActive(item)}
                onEdit={() => openEdit(item)}
                onDelete={() => askConfirmation(item, 'delete')}
                audio={audio}
              />
            ))}
          </div>
        )}
        {!loading && !loadError && counts.all > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B]">
          <p role="status">{visible.length} de {counts.all} macrocasos · Activos primero</p>
          {visible.length > 0 && (search || filter !== 'all') && <button type="button" onClick={clearFilters} className="font-semibold text-[#087D79] underline">Limpiar filtros</button>}
          {pages > 1 && <nav aria-label="Páginas de macrocasos" className="flex items-center gap-3"><span>Página {currentPage} de {pages}</span><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-xl border border-[#D9E2EA] bg-white px-3 py-2 font-semibold disabled:opacity-40">Anterior</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded-xl border border-[#D9E2EA] bg-white px-3 py-2 font-semibold disabled:opacity-40">Siguiente</button></nav>}
        </div>}
      </div>

      {showForm && (
        <CaseBankDialog wide title={editing ? 'Editar macrocaso' : 'Nuevo macrocaso'} description="Organiza el caso por secciones. Las voces nuevas o modificadas se generan al guardar." onClose={requestCloseForm} busy={saving}
          footer={<>
            {formError && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{formError}</p>}
            {discard ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Tienes cambios sin guardar.</p><p className="mt-1">¿Quieres descartarlos y cerrar el editor?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setDiscard(false)} className="rounded-xl border border-[#D9E2EA] px-4 py-2.5 font-semibold">Seguir editando</button><button type="button" onClick={closeForm} className="rounded-xl bg-red-700 px-4 py-2.5 font-semibold text-white">Descartar cambios</button></div></div>
              : <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" disabled={saving} onClick={requestCloseForm} className="rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F6F9FC] disabled:opacity-40">Cancelar</button>
                <div className="flex flex-wrap gap-2">
                  {step > 0 && <button type="button" aria-label="Anterior" disabled={saving} onClick={() => goToStep(step - 1)} className="rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569] disabled:opacity-40"><span aria-hidden="true" className="sm:hidden">←</span><span className="hidden sm:inline">Anterior</span></button>}
                  {step < 2 ? <button type="button" onClick={() => goToStep(step + 1)} className="rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490]">Continuar →</button>
                    : <button type="button" disabled={saving} onClick={saveMacrocase} aria-label={saving ? 'Guardando y generando voz' : editing ? 'Guardar cambios' : 'Crear macrocaso'} className="inline-flex items-center gap-2 rounded-xl bg-[#0AADA8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-50">{saving && <SpinnerIcon className="h-4 w-4 animate-spin" />}<span className="sm:hidden">{saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}</span><span className="hidden sm:inline">{saving ? 'Guardando y generando voz…' : editing ? 'Guardar cambios' : 'Crear macrocaso'}</span></button>}
                </div>
              </div>}
          </>}>
            <div ref={formBody}><CaseEditorSteps steps={EDITOR_STEPS} current={step} onChange={goToStep} busy={saving} /><fieldset disabled={saving} className="min-w-0 space-y-6">
              {step === 0 && <FormSection title="Información general">
                <label className="block text-xs font-medium text-[#475569]">
                  Nombre
                  <input id="macrocase-name" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ej.: Caperucita Roja" className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-[#475569]">
                  Descripción breve <span className="font-normal text-[#94A3B8]">(solo para administradores)</span>
                  <input value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Ej.: Dilema ético con varios personajes" className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-[#475569]">
                  Instrucciones para el candidato <span className="font-normal text-[#94A3B8]">(opcional · se muestran en la pantalla de introducción)</span>
                  <textarea value={form.instructions} onChange={(e) => updateField('instructions', e.target.value)} maxLength={2000} rows={3} placeholder="Ej.: Imagina que trabajas en…" className={`${inputClass} resize-y leading-6`} />
                </label>
              </FormSection>}

              {step === 1 && <FormSection title="Respuestas" description="Todas las preguntas se responden marcando con una X una sola de sus opciones.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#BDE7E3] bg-[#F0FFFE] p-4 text-sm text-[#087D79]"><p className="font-semibold">Marca con X · 4 opciones</p><p className="mt-2 text-xs leading-6">Cada pregunta lleva exactamente 4 opciones. El asistente lee la pregunta y sus opciones, y cada candidato las ve en un orden aleatorio.</p></div>
                  <label className="block text-xs font-medium text-[#475569]">
                    Tiempo por pregunta (segundos)
                    <input id="macrocase-time" aria-label="Tiempo por pregunta (segundos)" type="number" min="0" step="1" value={form.defaultTimeLimit} onChange={(e) => updateField('defaultTimeLimit', e.target.value)} className={inputClass} />
                    <span className="mt-1 block font-normal text-[#94A3B8]">{formatTimeLimit(form.defaultTimeLimit)} · 0 = sin límite. Corre desde que el asistente termina de leer.</span>
                  </label>
                </div>
              </FormSection>}

              {step === 2 && <FormSection
                title={`Secciones (${form.sections.length})`}
                description="Cada pregunta lleva 4 opciones de respuesta. El candidato recorre las secciones en orden: el asistente narra el texto de cada una y luego le hace sus preguntas, leyendo también las opciones. Al pasar a las preguntas, el texto de la sección deja de estar visible."
              >
                {undo && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><span>Contenido retirado. Puedes recuperar la última eliminación.</span><button type="button" onClick={() => { setForm(undo); setUndo(null); }} className="font-semibold underline">Deshacer</button></div>}
                <ol className="space-y-5">
                  {form.sections.map((section, sectionIndex) => {
                    const narrative = narrativeVoice(section);
                    return (
                      <li key={section.id} className="rounded-2xl border border-[#BFE5E2] bg-white p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-bold text-[#087D79]">Sección {sectionIndex + 1}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => moveSection(section.id, -1)} disabled={sectionIndex === 0} aria-label={`Subir la sección ${sectionIndex + 1}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#475569] hover:bg-[#F6F9FC] disabled:opacity-30">↑</button>
                            <button type="button" onClick={() => moveSection(section.id, 1)} disabled={sectionIndex === form.sections.length - 1} aria-label={`Bajar la sección ${sectionIndex + 1}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#475569] hover:bg-[#F6F9FC] disabled:opacity-30">↓</button>
                            <button type="button" disabled={form.sections.length === 1} onClick={() => removeSection(section.id)} className="ml-1 text-xs font-semibold text-[#B42318] hover:underline disabled:opacity-30">Quitar sección</button>
                          </div>
                        </div>

                        <label className="mt-3 block text-xs font-medium text-[#475569]">
                          Título <span className="font-normal text-[#94A3B8]">(opcional)</span>
                          <input aria-label={`Título de la sección ${sectionIndex + 1}`} value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} maxLength={120} placeholder="Ej.: El encargo" className={inputClass} />
                        </label>

                        <label className="mt-3 block text-xs font-medium text-[#475569]">
                          Texto narrativo
                          <textarea
                            id={`narrative-${section.id}`}
                            aria-label={`Texto narrativo de la sección ${sectionIndex + 1}`}
                            value={section.narrative}
                            onChange={(e) => updateSection(section.id, { narrative: e.target.value })}
                            maxLength={MAX_NARRATIVE_LENGTH}
                            rows={7}
                            placeholder="Había una vez…"
                            className={`${inputClass} resize-y leading-6`}
                          />
                        </label>
                        <p className="mt-1 text-right text-xs text-[#94A3B8]">{section.narrative.length.toLocaleString('es-GT')} / {MAX_NARRATIVE_LENGTH.toLocaleString('es-GT')} caracteres · separa los párrafos con una línea en blanco</p>
                        <VoiceControls
                          voice={narrative}
                          file={section.narrativeAudioFile}
                          playKey={`form:${section.id}:narrativa`}
                          label={`la narración de la sección ${sectionIndex + 1}`}
                          audio={audio}
                          onUpload={(file) => handleAudioChange({ sectionId: section.id }, file)}
                          onRestore={() => restoreGeneratedVoice({ sectionId: section.id })}
                        />

                        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#475569]">Preguntas de esta sección ({section.questions.length})</p>
                        <ol className="mt-2 space-y-3">
                          {section.questions.map((question, index) => (
                            <li key={question.id} className="rounded-xl border border-[#DDE5EC] bg-[#FAFBFC] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-bold uppercase tracking-wide text-[#0A8F8A]">Pregunta {index + 1}</span>
                                <button type="button" aria-label={`Quitar pregunta ${index + 1} de sección ${sectionIndex + 1}`} onClick={() => removeQuestion(section.id, question.id)} className="text-xs font-semibold text-[#B42318] hover:underline">Quitar</button>
                              </div>
                              <textarea
                                id={`question-${question.id}`}
                                value={question.text || ''}
                                onChange={(e) => updateQuestion(section.id, question.id, { text: e.target.value })}
                                maxLength={500}
                                rows={2}
                                aria-label={`Texto de la pregunta ${index + 1} de la sección ${sectionIndex + 1}`}
                                placeholder="Ej.: ¿Qué debería hacer Daniel ante la decisión de su supervisor?"
                                className={`${inputClass} resize-y`}
                              />
                              <fieldset className="mt-3">
                                <legend className="text-xs font-medium text-[#475569]">Opciones de respuesta <span className="font-normal text-[#94A3B8]">(exactamente 4 · el candidato marca una)</span></legend>
                                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                                  {question.options.map((option, optionIndex) => (
                                    <label key={option.id} className="flex items-center gap-2">
                                      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#D9E2EA] bg-white text-xs font-bold text-[#7C8AA0]">{OPTION_LETTERS[optionIndex]}</span>
                                      <input
                                        id={`option-${option.id}`}
                                        value={option.text}
                                        onChange={(e) => updateOption(section.id, question.id, option.id, e.target.value)}
                                        maxLength={300}
                                        aria-label={`Opción ${OPTION_LETTERS[optionIndex]} de la pregunta ${index + 1} de la sección ${sectionIndex + 1}`}
                                        placeholder={`Opción ${OPTION_LETTERS[optionIndex]}`}
                                        className={`${inputClass} mt-0`}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </fieldset>
                              <VoiceControls
                                voice={question}
                                file={question.audioFile}
                                playKey={`form:${question.id}`}
                                label={`la pregunta ${index + 1}`}
                                audio={audio}
                                onUpload={(file) => handleAudioChange({ sectionId: section.id, questionId: question.id }, file)}
                                onRestore={() => restoreGeneratedVoice({ sectionId: section.id, questionId: question.id })}
                              />
                            </li>
                          ))}
                        </ol>
                        <button type="button" onClick={() => addQuestion(section.id)} className="mt-3 w-full rounded-xl border border-dashed border-[#9ED9D5] py-2.5 text-sm font-semibold text-[#087D79] hover:bg-[#F4FBFB]">+ Agregar pregunta</button>
                      </li>
                    );
                  })}
                </ol>
                <button type="button" onClick={addSection} className="w-full rounded-xl border-2 border-dashed border-[#9ED9D5] py-3 text-sm font-semibold text-[#087D79] hover:bg-[#F4FBFB]">+ Agregar sección</button>
                <p className="text-xs text-[#94A3B8]">Un audio propio reemplaza la voz generada de esa narración o pregunta. MP3, WAV, OGG o WEBM, hasta 10 MB. Las opciones siempre usan la voz generada.</p>
              </FormSection>}
            </fieldset></div>

        </CaseBankDialog>
      )}
      {confirmation && <CaseBankDialog title={confirmation.kind === 'delete' ? 'Eliminar macrocaso' : 'Desactivar macrocaso'} busy={Boolean(busyId)} onClose={() => { if (!busyId) setConfirmation(null); }}
        footer={<div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={Boolean(busyId)} onClick={() => setConfirmation(null)} className="rounded-xl border border-[#D9E2EA] px-4 py-2.5 text-sm font-semibold text-[#475569]">Cancelar</button><button type="button" disabled={Boolean(busyId)} onClick={confirmAction} className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${confirmation.kind === 'delete' ? 'bg-red-700' : 'bg-[#0AADA8]'}`}>{busyId ? 'Procesando…' : confirmation.kind === 'delete' ? 'Eliminar macrocaso' : 'Desactivar'}</button></div>}>
        <p className="break-words text-sm leading-7 text-[#475569]">{confirmation.kind === 'delete' ? <>Se eliminará «<strong>{confirmation.item.name}</strong>» del banco. Esta acción no se puede deshacer.</> : <>«<strong>{confirmation.item.name}</strong>» dejará de estar disponible para nuevas asignaciones. Podrás volver a activarlo desde este banco.</>}</p>
        {confirmationError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{confirmationError}</p>}
      </CaseBankDialog>}
    </div>
  );
}
