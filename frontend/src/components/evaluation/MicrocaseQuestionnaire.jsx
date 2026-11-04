import { useEffect, useRef, useState } from 'react';
import { submitEvaluation } from '../../services/invitationService.js';
import { CompletedPanel, ConfirmPanel, QuestionProgress } from './EvaluationPanels.jsx';
const OPTIONS = ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'];
const formatTime = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

/** Microcase participant flow. Preview mode uses the same screens but never persists answers. */
export function MicrocaseQuestionnaire({ token, microcase, preview = false, onExitPreview }) {
  const questions = microcase?.questions || [];
  const limitSeconds = Math.max(1, Number(microcase?.timeLimitMinutes || 15)) * 60;
  const storageKey = !preview && token ? `microcase-deadline:${token}` : null;
  const [deadline, setDeadline] = useState(() => { if (!storageKey) return null; const saved = Number(window.sessionStorage.getItem(storageKey)); return Number.isFinite(saved) && saved > Date.now() ? saved : null; });
  const [started, setStarted] = useState(() => Boolean(deadline));
  const [remaining, setRemaining] = useState(limitSeconds);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState(() => deadline ? 'story' : 'intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submittedAt, setSubmittedAt] = useState(null);
  const finishing = useRef(false);
  const question = questions[index];

  const sendAnswers = async (timedOut = false, currentAnswers = answers) => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true); setError('');
    try {
      if (!preview && currentAnswers.length) {
        const result = await submitEvaluation(token, currentAnswers);
        if (result?.state !== 'COMPLETED') throw new Error('Este acceso ya no permite enviar la evaluación.');
        setSubmittedAt(result.submittedAt || new Date().toISOString());
      } else setSubmittedAt(new Date().toISOString());
      if (storageKey) window.sessionStorage.removeItem(storageKey);
      setPhase(timedOut ? 'timeout-completed' : 'completed');
    } catch (requestError) {
      finishing.current = false;
      setError(requestError.response?.data?.error?.message || requestError.message || 'No se pudo enviar la evaluación.');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!started || !deadline || phase === 'completed' || phase === 'timeout-completed') return undefined;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) sendAnswers(true);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [started, deadline, phase]);

  if (!questions.length) return <main className="mx-auto max-w-2xl p-8 text-center">No hay preguntas asignadas. Contacta a la empresa.</main>;
  if (phase === 'completed' || phase === 'timeout-completed') return <>{preview && <div className="mx-auto max-w-xl px-5 pt-6"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Vista previa: las respuestas no se guardaron.</div></div>}<CompletedPanel submittedAt={submittedAt} footnote={phase === 'timeout-completed' ? 'El tiempo terminó y se enviaron las respuestas registradas.' : 'Microcaso completado'} />{phase === 'timeout-completed' && <p className="mx-auto -mt-10 max-w-xl px-5 text-center text-sm text-amber-700">El tiempo límite terminó. Se enviaron automáticamente las respuestas que habías seleccionado.</p>}</>;

  if (phase === 'intro') return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <section className="rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-8">
        <span className="inline-flex rounded-md bg-[#E8F7F6] px-2.5 py-1 text-xs font-semibold text-[#087D79]">Evaluación · Fase C</span>
        <h1 className="mt-4 font-display text-2xl font-bold text-[#10233A]">Análisis de un microcaso</h1>
        <p className="mt-2 text-sm leading-6 text-[#56677B]">Leerás una situación y responderás una pregunta por cada habilidad evaluada. No hay respuestas correctas o incorrectas: nos interesa conocer tu criterio y cómo abordarías la situación.</p>
        <ol className="mt-6 space-y-4">
          {[[`Lee la historia del caso`, 'Analiza cuidadosamente la situación que se presenta. Podrás leerla antes de comenzar a responder.'], ['Responde las preguntas', 'Se te presentará una pregunta por cada habilidad seleccionada, utilizando una escala de cinco opciones.'], ['Avanza sin regresar', 'Cuando pases a la siguiente pregunta, no podrás volver a la anterior ni consultar nuevamente la historia.']].map(([title, description], i) => <li key={title} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F7F6] text-sm font-bold text-[#0A8F8A]">{i + 1}</span><div><p className="text-sm font-semibold text-[#10233A]">{title}</p><p className="mt-0.5 text-sm text-[#64748B]">{description}</p></div></li>)}
        </ol>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><p className="font-semibold">Importante</p><p className="mt-1">Una vez que avances, <strong>no podrás regresar</strong> a la historia ni a las preguntas anteriores. Administra tu tiempo y revisa tu selección antes de continuar.</p></div>
        <div className="mt-4 rounded-xl bg-[#F6F9FC] p-4 text-sm text-[#56677B]">
          <p>◷ &nbsp;Tendrás <strong>{microcase.timeLimitMinutes || 15} minutos en total</strong> para completar el microcaso.</p>
          <p className="mt-2">⏱ &nbsp;El tiempo comienza cuando pulses «Comenzar» y seguirá corriendo durante la lectura y todas las preguntas.</p>
          <p className="mt-2">✎ &nbsp;Cada pregunta se responde seleccionando una opción de la escala Likert.</p>
          <p className="mt-2">▣ &nbsp;Al terminar el tiempo, la evaluación se cerrará automáticamente y se enviarán las respuestas que hayas registrado.</p>
          <p className="mt-2">♙ &nbsp;El acceso es personal. No cierres la ventana durante la evaluación.</p>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {preview && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Vista previa del candidato · Las respuestas no se guardan.</p>}
        <button type="button" onClick={() => { const endAt = Date.now() + limitSeconds * 1000; if (storageKey) window.sessionStorage.setItem(storageKey, String(endAt)); setDeadline(endAt); setRemaining(limitSeconds); setStarted(true); setPhase('story'); }} className="mt-6 w-full rounded-xl bg-[#168D89] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#117A76]">Comenzar →</button>
      </section>
    </main>
  );

  const advance = () => {
    if (selected === null) return;
    const next = [...answers, { questionId: question.questionId, value: selected + 1 }];
    setAnswers(next); setSelected(null);
    if (index === questions.length - 1) setPhase('confirm'); else setIndex((current) => current + 1);
  };

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
      {preview && <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><strong>Vista previa del candidato · Las respuestas no se guardan.</strong><button type="button" onClick={onExitPreview} className="font-semibold underline">Volver al banco</button></div>}
      <div className="mb-5 flex items-center justify-between text-sm text-[#64748B]"><span>Microcaso · {microcase.name}</span><span className={`rounded-lg px-3 py-2 font-bold tabular-nums ${remaining <= 60 ? 'bg-red-50 text-red-700' : 'bg-[#E8F7F6] text-[#087D79]'}`}>⏱ {formatTime(remaining)}</span></div>
      {phase === 'story' ? <section className="rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-9"><span className="inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0A8F8A]">Historia del microcaso</span><h1 className="mt-5 text-2xl font-bold text-[#10233A]">{microcase.name}</h1><p className="mt-5 whitespace-pre-wrap text-base leading-8 text-[#334E68]">{microcase.story}</p><p className="mt-6 text-xs text-[#8A98A9]">Al continuar, la historia dejará de estar disponible.</p><div className="mt-6 flex justify-end"><button type="button" onClick={() => setPhase('questions')} className="rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white">Continuar a las preguntas →</button></div></section> : phase === 'confirm' ? <section className="rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm"><h1 className="text-2xl font-bold text-[#10233A]">Resumen del microcaso</h1><p className="mt-2 text-sm text-[#64748B]">Has respondido {answers.length} de {questions.length} preguntas.</p><div className="mt-5 space-y-3">{questions.map((q, i) => <div key={q.questionId} className="rounded-xl bg-[#F6F9FC] p-4"><p className="text-xs font-semibold text-[#0A8F8A]">{q.sectionTitle}</p><p className="mt-1 text-sm font-medium text-[#334E68]">{q.question}</p><p className="mt-2 text-sm text-[#64748B]">{OPTIONS[(answers.find(a => a.questionId === q.questionId)?.value || 1) - 1]}</p></div>)}</div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<button type="button" disabled={busy} onClick={() => preview ? (setSubmittedAt(new Date().toISOString()), setPhase('completed')) : sendAnswers(false)} className="mt-6 w-full rounded-xl bg-[#13A9A4] px-6 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Enviando...' : 'Confirmar y enviar evaluación →'}</button></section> : <><QuestionProgress moduleLabel="Microcaso" current={index + 1} total={questions.length} /><section className="rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-8"><span className="inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]">{question.sectionTitle}</span><h2 className="mt-5 text-lg font-semibold leading-8 text-[#10233A]">{question.question}</h2><p className="mt-2 text-sm text-[#7C8AA0]">Selecciona qué tan de acuerdo estás con esta afirmación.</p><div className="mt-9" role="radiogroup" aria-label="Escala Likert de cinco opciones"><div className="relative mx-3 h-10"><div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#DDE5EC]"/><div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#18A9A4] transition-all" style={{width:selected===null?'0%':`${selected*25}%`}}/>{OPTIONS.map((label, i) => <button key={label} type="button" role="radio" aria-checked={selected===i} aria-label={label} onClick={() => setSelected(i)} className={`absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow ${selected!==null&&i<=selected?'bg-[#18A9A4]':'bg-[#AEBCCA]'} ${selected===i?'scale-125':''}`} style={{left:`${i*25}%`}}/>)}</div><div className="mt-2 grid grid-cols-5 text-center text-xs font-semibold text-[#7C8AA0]">{OPTIONS.map((label,i)=><span key={label} className={selected===i?'text-[#0A8F8A]':''}>{i+1}</span>)}</div><div className="mt-3 flex justify-between text-xs text-[#8A98A9]"><span>Muy en desacuerdo</span><span>Muy de acuerdo</span></div><p className="mt-6 min-h-6 text-center text-sm font-semibold text-[#0A8F8A]">{selected===null?'Selecciona una opción para continuar':OPTIONS[selected]}</p></div></section><div className="mt-6 flex justify-end"><button type="button" onClick={advance} disabled={selected===null} className="rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white disabled:bg-[#BCC7D1]">{index===questions.length-1?'Ver resumen →':'Continuar →'}</button></div></>}
    </main>
  );
}

