import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SpinnerIcon } from '../components/auth/icons.jsx';

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
  maxCharacters: 500,
  defaultTimeLimit: 180,
  sections: [],
};

const MAX_NARRATIVE_LENGTH = 8000;

const newId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const emptyQuestion = () => ({ id: newId('question'), text: '', audioFile: null });
const emptySection = () => ({ id: newId('section'), title: '', narrative: '', narrativeAudio: {}, narrativeAudioFile: null, questions: [emptyQuestion()] });

const ALLOWED_AUDIO = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const FILTERS = [
  ['all', 'Todos'],
  ['active', 'Activos'],
  ['inactive', 'Inactivos'],
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
      + questions.filter((question) => !question.text?.trim()).length,
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
    <article className={`flex flex-col rounded-2xl border bg-white shadow-sm transition ${item.active ? 'border-[#BFE5E2]' : 'border-[#DDE5EC]'}`}>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold text-[#101828]">{item.name}</h2>
          <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-[#64748B]">{item.description || 'Sin descripción'}</p>
        </div>
        <ActiveSwitch active={item.active} busy={busy} name={item.name} onToggle={onToggleActive} />
      </div>

      <div className="flex flex-wrap gap-2 px-5">
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{plural(summary.sections, 'sección', 'secciones')}</span>
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{plural(summary.questions, 'pregunta', 'preguntas')}</span>
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{item.maxCharacters} caracteres</span>
        <span className="rounded-lg bg-[#F6F9FC] px-2.5 py-1 text-xs font-medium text-[#475569]">{formatTimeLimit(item.defaultTimeLimit)}</span>
      </div>

      {/* Same height whatever the status, so cards in a row line up. */}
      <div className="mt-3 flex h-10 items-center px-5">
        {summary.incomplete > 0 ? (
          <p
            title={unusable ? 'Está activo, pero no se asignará a ningún evento hasta que tenga al menos una sección con texto y preguntas.' : 'Las secciones sin texto o sin preguntas, y las preguntas sin texto, no se muestran a los candidatos.'}
            className="w-full truncate rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
          >
            {plural(summary.incomplete, 'elemento incompleto', 'elementos incompletos')} · {unusable ? 'no se asignará a eventos' : 'no se usarán'}. Edita para completarlo.
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
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#475569]">{section.narrative || <span className="italic text-[#94A3B8]">Sin texto narrativo</span>}</p>
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
        <button type="button" onClick={onDelete} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#B42318] hover:bg-red-50">Eliminar</button>
        <div className="flex gap-2">
          <Link to={`/admin/macrocases/${item.id}/preview`} className="rounded-xl border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] hover:border-[#0AADA8] hover:text-[#087D79]">Vista previa</Link>
          <button type="button" onClick={onEdit} className="rounded-xl bg-[#0AADA8] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#089490]">Editar</button>
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

  const loadMacroCases = async () => {
    try {
      setLoading(true);
      setMacrocasos(await getMacroCases());
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMacroCases();
  }, []);

  const counts = useMemo(() => ({
    all: macrocasos.length,
    active: macrocasos.filter((item) => item.active).length,
    inactive: macrocasos.filter((item) => !item.active).length,
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
    .filter((item) => (filter === 'all' ? true : filter === 'active' ? item.active : !item.active))
    .filter((item) => `${item.name} ${item.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));

  const openCreate = () => {
    audio.stop();
    setEditing(null);
    setForm({ ...EMPTY_FORM, sections: [emptySection()] });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (item) => {
    audio.stop();
    setEditing(item);
    setForm({
      name: item.name || '',
      description: item.description || '',
      instructions: item.instructions || '',
      maxCharacters: item.maxCharacters || 500,
      defaultTimeLimit: item.defaultTimeLimit ?? 180,
      sections: sectionsOf(item).map((section) => ({
        id: section.id,
        title: section.title || '',
        narrative: section.narrative || '',
        narrativeAudio: section.narrativeAudio || {},
        narrativeAudioFile: null,
        questions: section.questions.map((question) => ({ ...question, audioFile: null })),
      })),
    });
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

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateSections = (change) => setForm((current) => ({ ...current, sections: change(current.sections) }));

  const addSection = () => updateSections((sections) => [...sections, emptySection()]);

  const removeSection = (sectionId) => updateSections((sections) => sections.filter((section) => section.id !== sectionId));

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

  const removeQuestion = (sectionId, questionId) => updateQuestions(sectionId, (questions) => questions.filter((question) => question.id !== questionId));

  const updateQuestion = (sectionId, questionId, changes) => updateQuestions(sectionId, (questions) => questions.map((question) => (
    question.id === questionId ? { ...question, ...changes } : question
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
    if (!form.name.trim()) return 'Indica el nombre del macrocaso.';
    if (!(Number(form.maxCharacters) > 0)) return 'El máximo de caracteres debe ser mayor que 0.';
    if (!(Number(form.defaultTimeLimit) >= 0)) return 'El tiempo por pregunta no puede ser negativo.';
    if (form.sections.length === 0) return 'Agrega al menos una sección.';
    for (const [index, section] of form.sections.entries()) {
      if (!section.narrative.trim()) return `La sección ${index + 1} necesita su texto narrativo: es lo que lee y escucha el candidato.`;
      if (section.questions.length === 0) return `La sección ${index + 1} necesita al menos una pregunta.`;
      if (section.questions.some((question) => !question.text?.trim())) {
        return `Cada pregunta de la sección ${index + 1} necesita su texto: es lo que lee el asistente y ve el candidato.`;
      }
    }
    return '';
  };

  const saveMacrocase = async () => {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    try {
      setSaving(true);
      setFormError('');

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        instructions: form.instructions.trim(),
        maxCharacters: Number(form.maxCharacters),
        defaultTimeLimit: Number(form.defaultTimeLimit),
        // Audio fields are managed by the backend: it generates the voice
        // of every narrative and question whose text changed.
        sections: form.sections.map((section) => ({
          id: section.id,
          title: section.title.trim(),
          narrative: section.narrative.trim(),
          ...(section.resetNarrativeAudio ? { resetNarrativeAudio: true } : {}),
          questions: section.questions.map((question) => ({
            id: question.id,
            text: question.text.trim(),
            ...(question.resetAudio ? { resetAudio: true } : {}),
          })),
        })),
      };

      let saved = editing ? await updateMacroCase(editing.id, payload) : await createMacroCase(payload);

      for (const section of form.sections) {
        if (section.narrativeAudioFile) {
          saved = await uploadMacroCaseAudio(saved.id, { sectionId: section.id }, section.narrativeAudioFile);
        }
        for (const question of section.questions.filter((item) => item.audioFile)) {
          saved = await uploadMacroCaseAudio(saved.id, { questionId: question.id }, question.audioFile);
        }
      }

      const failed = voiceSummary(saved).errors;
      await loadMacroCases();
      closeForm();
      setNotice(failed
        ? { tone: 'warning', text: `"${saved.name}" se guardó, pero ${failed === 1 ? 'una voz no pudo generarse' : `${failed} voces no pudieron generarse`}. Esos textos se leerán con la voz del navegador.` }
        : { tone: 'success', text: `"${saved.name}" se guardó correctamente.` });
    } catch (error) {
      setFormError(error.message);
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

  const handleDelete = async (item) => {
    const confirmed = window.confirm(
      `¿Eliminar "${item.name}"? Esta acción no se puede deshacer. Los eventos que ya lo usan en su Módulo B no se verán afectados.`
    );
    if (!confirmed) return;

    try {
      audio.stop();
      await deleteMacroCase(item.id);
      await loadMacroCases();
      setNotice({ tone: 'success', text: `"${item.name}" se eliminó del banco.` });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
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
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Banco de macrocasos</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#64748B]">Los macrocasos activos forman el banco. Cuando una empresa envía el Módulo B, a su evento se le asigna uno al azar y todos sus candidatos reciben ese mismo caso.</p>
          </div>
          <button type="button" onClick={openCreate} className="shrink-0 rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490]">+ Nuevo macrocaso</button>
        </div>

        {notice && (
          <div className={`mt-6 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${noticeTone[notice.tone]}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso" className="text-base leading-none opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        {!loading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="En el banco (activos)" value={`${counts.active} de ${counts.all}`} hint={usableActive < counts.active ? `${counts.active - usableActive} sin secciones completas` : 'Disponibles para asignar'} />
            <StatCard label="Secciones y preguntas" value={`${voices.sections} · ${voices.questions}`} hint="Entre todos los macrocasos" />
            <StatCard label="Voces listas" value={`${voices.ready}/${voices.total}`} hint={voices.errors ? `${voices.errors} con error al generar` : 'Narraciones y preguntas, generadas o subidas'} />
          </div>
        )}

        {!loading && counts.all > 0 && usableActive === 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No hay macrocasos activos con secciones completas: las empresas no podrán enviar el Módulo B. Activa al menos uno.</p>
        )}

        {!loading && counts.all > 0 && (
          <div className="mt-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-xl border border-[#DDE5EC] bg-white p-1" role="tablist" aria-label="Filtrar macrocasos">
              {FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${filter === id ? 'bg-[#0AADA8] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}
                >
                  {label} <span className={filter === id ? 'text-white/80' : 'text-[#94A3B8]'}>{counts[id]}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre…"
              aria-label="Buscar macrocaso"
              className="w-full rounded-xl border border-[#DDE5EC] bg-white px-3.5 py-2 text-sm focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20 sm:w-64"
            />
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-[#64748B]"><SpinnerIcon className="mr-2 h-5 w-5 animate-spin" /> Cargando macrocasos...</div>
        ) : counts.all === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center">
            <p className="font-semibold text-[#334155]">Aún no hay macrocasos</p>
            <p className="mt-1 text-sm text-[#94A3B8]">Crea el primero: un caso dividido en secciones, cada una con su texto y las preguntas que hará el asistente virtual.</p>
            <button type="button" onClick={openCreate} className="mt-5 rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490]">+ Nuevo macrocaso</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#94A3B8]">Ningún macrocaso coincide con el filtro.</div>
        ) : (
          <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
            {visible.map((item) => (
              <MacrocaseCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                expanded={expandedId === item.id}
                onToggleExpanded={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                onToggleActive={() => toggleActive(item)}
                onEdit={() => openEdit(item)}
                onDelete={() => handleDelete(item)}
                audio={audio}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B1A2B]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="macrocase-form-title">
          <div className="mx-auto my-6 max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#EEF2F6] px-6 py-5">
              <div>
                <h2 id="macrocase-form-title" className="font-display text-xl font-bold text-[#101828]">{editing ? 'Editar macrocaso' : 'Nuevo macrocaso'}</h2>
                <p className="mt-0.5 text-xs text-[#64748B]">Al guardar se genera la voz de las narraciones y preguntas nuevas o modificadas.</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Cerrar" className="rounded-lg p-1 text-2xl leading-none text-[#94A3B8] hover:bg-[#F6F9FC] hover:text-[#475569]">×</button>
            </div>

            <div className="space-y-8 px-6 py-6">
              <FormSection title="Información general">
                <label className="block text-xs font-medium text-[#475569]">
                  Nombre
                  <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ej.: Caperucita Roja" className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-[#475569]">
                  Descripción breve <span className="font-normal text-[#94A3B8]">(solo para administradores)</span>
                  <input value={form.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Ej.: Dilema ético con varios personajes" className={inputClass} />
                </label>
                <label className="block text-xs font-medium text-[#475569]">
                  Instrucciones para el candidato <span className="font-normal text-[#94A3B8]">(opcional · se muestran en la pantalla de introducción)</span>
                  <textarea value={form.instructions} onChange={(e) => updateField('instructions', e.target.value)} maxLength={2000} rows={3} placeholder="Ej.: Imagina que trabajas en…" className={`${inputClass} resize-y leading-6`} />
                </label>
              </FormSection>

              <FormSection title="Respuestas" description="Se aplica a todas las preguntas de este macrocaso.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-[#475569]">
                    Máximo de caracteres por respuesta
                    <input type="number" min="1" value={form.maxCharacters} onChange={(e) => updateField('maxCharacters', e.target.value)} className={inputClass} />
                  </label>
                  <label className="block text-xs font-medium text-[#475569]">
                    Tiempo por pregunta (segundos)
                    <input type="number" min="0" step="30" value={form.defaultTimeLimit} onChange={(e) => updateField('defaultTimeLimit', e.target.value)} className={inputClass} />
                    <span className="mt-1 block font-normal text-[#94A3B8]">{formatTimeLimit(form.defaultTimeLimit)} · 0 = sin límite. Corre desde que el asistente termina de leer.</span>
                  </label>
                </div>
              </FormSection>

              <FormSection
                title={`Secciones (${form.sections.length})`}
                description="El candidato recorre las secciones en orden: el asistente narra el texto de cada una y luego le hace sus preguntas. Al pasar a las preguntas, el texto de la sección deja de estar visible."
              >
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
                            <button type="button" onClick={() => removeSection(section.id)} className="ml-1 text-xs font-semibold text-[#B42318] hover:underline">Quitar sección</button>
                          </div>
                        </div>

                        <label className="mt-3 block text-xs font-medium text-[#475569]">
                          Título <span className="font-normal text-[#94A3B8]">(opcional)</span>
                          <input value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} maxLength={120} placeholder="Ej.: El encargo" className={inputClass} />
                        </label>

                        <label className="mt-3 block text-xs font-medium text-[#475569]">
                          Texto narrativo
                          <textarea
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
                                <button type="button" onClick={() => removeQuestion(section.id, question.id)} className="text-xs font-semibold text-[#B42318] hover:underline">Quitar</button>
                              </div>
                              <textarea
                                value={question.text || ''}
                                onChange={(e) => updateQuestion(section.id, question.id, { text: e.target.value })}
                                maxLength={500}
                                rows={2}
                                aria-label={`Texto de la pregunta ${index + 1} de la sección ${sectionIndex + 1}`}
                                placeholder="¿Qué haría usted en el lugar de…?"
                                className={`${inputClass} resize-y`}
                              />
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
                <p className="text-xs text-[#94A3B8]">Un audio propio reemplaza la voz generada de esa narración o pregunta. MP3, WAV, OGG o WEBM, hasta 10 MB.</p>
              </FormSection>
            </div>

            <div className="sticky bottom-0 rounded-b-2xl border-t border-[#EEF2F6] bg-white px-6 py-4">
              {formError && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{formError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeForm} className="rounded-xl border border-[#D9E2EA] px-5 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F6F9FC]">Cancelar</button>
                <button type="button" disabled={saving} onClick={saveMacrocase} className="inline-flex items-center rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-60">
                  {saving && <SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? 'Guardando y generando voz...' : editing ? 'Guardar cambios' : 'Crear macrocaso'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
