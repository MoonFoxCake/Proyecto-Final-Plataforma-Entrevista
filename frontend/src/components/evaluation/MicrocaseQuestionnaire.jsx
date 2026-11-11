import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompletedPanel, QuestionProgress } from './EvaluationPanels.jsx';
import { createLocalTimedSource, createRemoteTimedSource } from './timedSources.js';

const OPTIONS = ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'];
const RETRY_MS = 3000;
const formatTime = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
const errorText = (error, fallback) => error.response?.data?.error?.message || error.message || fallback;

/**
 * Likert evaluation with a total time limit: Module C (a story plus one
 * question per skill) and Module A when its question group sets a time.
 *
 * The server keeps the clock and every answer, so reloading resumes at the
 * same question with the time that was left. When the time runs out, what
 * was answered is submitted. Preview mode uses the same screens and stores
 * nothing.
 */
export function MicrocaseQuestionnaire({ token, microcase, preview = false, onExitPreview, onCompleted, onClosed }) {
  const questions = useMemo(() => microcase?.questions || [], [microcase]);
  const hasStory = Boolean(microcase?.story);
  const limitMinutes = Number(microcase?.timeLimitMinutes || 15);
  const source = useMemo(() => (preview ? createLocalTimedSource(microcase) : createRemoteTimedSource(token)), [preview, microcase, token]);
  const [view, setView] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [remaining, setRemaining] = useState(limitMinutes * 60);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const finishing = useRef(false);
  const retryAt = useRef(0);
  // Read when the time runs out, without restarting the countdown effect.
  const latest = useRef({ selected: null, view: null });
  latest.current = { selected, view };

  const close = useCallback((outcome) => {
    if (outcome?.state === 'COMPLETED') {
      setResult({ submittedAt: outcome.submittedAt || new Date().toISOString(), timedOut: false });
      onCompleted?.();
      return;
    }
    if (onClosed) onClosed(outcome?.state);
    else setError('Este acceso ya no permite continuar la evaluación.');
  }, [onClosed, onCompleted]);

  const apply = useCallback((next) => {
    if (next?.state !== 'VALID') {
      close(next);
      return;
    }
    setView(next);
    if (next.step !== 'intro' && next.remainingSeconds !== null) {
      setDeadline(Date.now() + next.remainingSeconds * 1000);
      setRemaining(next.remainingSeconds);
    }
  }, [close]);

  useEffect(() => {
    let active = true;
    source.state()
      .then((next) => { if (active) apply(next); })
      .catch((requestError) => { if (active) setError(errorText(requestError, 'No se pudo cargar la evaluación.')); });
    return () => { active = false; };
  }, [source, apply]);

  const finish = useCallback(async (timedOut) => {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    setError('');
    try {
      const { selected: pending, view: current } = latest.current;
      const question = current?.step === 'questions' ? questions[current.questionIndex] : null;
      // A selection not yet confirmed still counts when the time runs out.
      if (timedOut && question && pending !== null) {
        await source.action({ type: 'ANSWER', questionId: question.questionId, value: pending + 1 });
      }
      const outcome = await source.finish();
      if (outcome?.state !== 'COMPLETED') {
        close(outcome);
        return;
      }
      setResult({ submittedAt: outcome.submittedAt || new Date().toISOString(), timedOut });
      onCompleted?.();
    } catch (requestError) {
      finishing.current = false;
      retryAt.current = Date.now() + RETRY_MS;
      setError(errorText(requestError, 'No se pudo enviar la evaluación.'));
    } finally {
      setBusy(false);
    }
  }, [close, onCompleted, questions, source]);

  useEffect(() => {
    if (!deadline || result) return undefined;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0 && Date.now() >= retryAt.current) finish(true);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline, result, finish]);

  const send = async (action) => {
    setBusy(true);
    setError('');
    try {
      apply(await source.action(action));
      return true;
    } catch (requestError) {
      setError(errorText(requestError, 'No se pudo guardar. Intenta nuevamente.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (selected === null || busy) return;
    const question = questions[view.questionIndex];
    if (await send({ type: 'ANSWER', questionId: question.questionId, value: selected + 1 })) setSelected(null);
  };

  if (!questions.length) return <main className="mx-auto max-w-2xl p-8 text-center">No hay preguntas asignadas. Contacta a la empresa.</main>;

  if (result) {
    return <>
      {preview && <div className="mx-auto max-w-xl px-5 pt-6"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Vista previa: las respuestas no se guardaron.</div></div>}
      <CompletedPanel submittedAt={result.submittedAt} footnote={result.timedOut ? 'El tiempo terminó y se enviaron las respuestas registradas.' : 'Evaluación · NexoPerfil'} />
    </>;
  }

  if (!view) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-[#64748B]">{error || 'Cargando evaluación...'}</div>;

  if (view.step === 'intro') {
    const steps = [
      ...(hasStory ? [['Lee la historia del caso', 'Analiza cuidadosamente la situación que se presenta. Podrás leerla antes de comenzar a responder.']] : []),
      ['Responde las preguntas', 'Se te presentará una pregunta a la vez, utilizando una escala de cinco opciones.'],
      ['Avanza sin regresar', hasStory ? 'Cuando pases a la siguiente pregunta, no podrás volver a la anterior ni consultar nuevamente la historia.' : 'Cuando pases a la siguiente pregunta, no podrás volver a la anterior.'],
    ];
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <section className="rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-8">
          <span className="inline-flex rounded-md bg-[#E8F7F6] px-2.5 py-1 text-xs font-semibold text-[#087D79]">Evaluación</span>
          <h1 className="mt-4 font-display text-2xl font-bold text-[#10233A]">{hasStory ? 'Análisis de un microcaso' : 'Cuestionario'}</h1>
          <p className="mt-2 text-sm leading-6 text-[#56677B]">{hasStory ? 'Leerás una situación y responderás una pregunta por cada habilidad evaluada. ' : ''}No hay respuestas correctas o incorrectas: nos interesa conocer tu criterio.</p>
          <ol className="mt-6 space-y-4">
            {steps.map(([title, description], index) => <li key={title} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F7F6] text-sm font-bold text-[#0A8F8A]">{index + 1}</span><div><p className="text-sm font-semibold text-[#10233A]">{title}</p><p className="mt-0.5 text-sm text-[#64748B]">{description}</p></div></li>)}
          </ol>
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><p className="font-semibold">Importante</p><p className="mt-1">Una vez que avances, <strong>no podrás regresar</strong>. Administra tu tiempo y revisa tu selección antes de continuar.</p></div>
          <div className="mt-4 rounded-xl bg-[#F6F9FC] p-4 text-sm text-[#56677B]">
            <p>◷ &nbsp;Tendrás <strong>{limitMinutes} minutos en total</strong> para completar la evaluación.</p>
            <p className="mt-2">⏱ &nbsp;El tiempo comienza cuando pulses «Comenzar» y no se detiene, aunque recargues la página.</p>
            <p className="mt-2">▣ &nbsp;Al terminar el tiempo, la evaluación se cerrará automáticamente y se enviarán las respuestas que hayas registrado.</p>
            <p className="mt-2">♙ &nbsp;El acceso es personal.</p>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {preview && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Vista previa del candidato · Las respuestas no se guardan.</p>}
          <button type="button" disabled={busy} onClick={() => send({ type: 'START' })} className="mt-6 w-full rounded-xl bg-[#168D89] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#117A76] disabled:opacity-60">Comenzar →</button>
        </section>
      </main>
    );
  }

  const question = questions[view.questionIndex];
  const valueOf = (id) => view.answers.find((answer) => answer.questionId === id)?.value;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
      {preview && <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><strong>Vista previa del candidato · Las respuestas no se guardan.</strong><button type="button" onClick={onExitPreview} className="font-semibold underline">Volver al banco</button></div>}
      <div className="mb-5 flex items-center justify-between text-sm text-[#64748B]"><span>{hasStory ? `Microcaso · ${microcase.name}` : microcase.name}</span><span role="timer" className={`rounded-lg px-3 py-2 font-bold tabular-nums ${remaining <= 60 ? 'bg-red-50 text-red-700' : 'bg-[#E8F7F6] text-[#087D79]'}`}>⏱ {formatTime(remaining)}</span></div>
      {view.step === 'story' && <section className="rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-9"><span className="inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0A8F8A]">Historia del microcaso</span><h1 className="mt-5 text-2xl font-bold text-[#10233A]">{microcase.name}</h1><p className="mt-5 whitespace-pre-wrap text-base leading-8 text-[#334E68]">{microcase.story}</p><p className="mt-6 text-xs text-[#8A98A9]">Al continuar, la historia dejará de estar disponible.</p>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end"><button type="button" disabled={busy} onClick={() => send({ type: 'STORY_DONE' })} className="rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">Continuar a las preguntas →</button></div></section>}
      {view.step === 'review' && <section className="rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm"><h1 className="text-2xl font-bold text-[#10233A]">Resumen de tus respuestas</h1><p className="mt-2 text-sm text-[#64748B]">Has respondido {view.answers.length} de {questions.length} preguntas.</p><div className="mt-5 space-y-3">{questions.map((item) => <div key={item.questionId} className="rounded-xl bg-[#F6F9FC] p-4"><p className="text-xs font-semibold text-[#0A8F8A]">{item.sectionTitle}</p><p className="mt-1 text-sm font-medium text-[#334E68]">{item.question}</p><p className="mt-2 text-sm text-[#64748B]">{OPTIONS[(valueOf(item.questionId) || 1) - 1]}</p></div>)}</div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<button type="button" disabled={busy} onClick={() => finish(false)} className="mt-6 w-full rounded-xl bg-[#13A9A4] px-6 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Enviando...' : 'Confirmar y enviar evaluación →'}</button></section>}
      {view.step === 'questions' && question && <>
        <QuestionProgress moduleLabel="Evaluación" current={view.questionIndex + 1} total={questions.length} />
        <section className="rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-8">
          <span className="inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]">{question.sectionTitle}</span>
          <h2 className="mt-5 text-lg font-semibold leading-8 text-[#10233A]">{question.question}</h2>
          <p className="mt-2 text-sm text-[#7C8AA0]">Selecciona qué tan de acuerdo estás con esta afirmación.</p>
          <div className="mt-9" role="radiogroup" aria-label="Escala Likert de cinco opciones">
            <div className="relative mx-3 h-10">
              <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#DDE5EC]" />
              <div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#18A9A4] transition-all" style={{ width: selected === null ? '0%' : `${selected * 25}%` }} />
              {OPTIONS.map((label, index) => <button key={label} type="button" role="radio" aria-checked={selected === index} aria-label={label} onClick={() => setSelected(index)} className={`absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow ${selected !== null && index <= selected ? 'bg-[#18A9A4]' : 'bg-[#AEBCCA]'} ${selected === index ? 'scale-125' : ''}`} style={{ left: `${index * 25}%` }} />)}
            </div>
            <div className="mt-2 grid grid-cols-5 text-center text-xs font-semibold text-[#7C8AA0]">{OPTIONS.map((label, index) => <span key={label} className={selected === index ? 'text-[#0A8F8A]' : ''}>{index + 1}</span>)}</div>
            <div className="mt-3 flex justify-between text-xs text-[#8A98A9]"><span>Muy en desacuerdo</span><span>Muy de acuerdo</span></div>
            <p className="mt-6 min-h-6 text-center text-sm font-semibold text-[#0A8F8A]">{selected === null ? 'Selecciona una opción para continuar' : OPTIONS[selected]}</p>
          </div>
        </section>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end"><button type="button" onClick={advance} disabled={selected === null || busy} className="rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white disabled:bg-[#BCC7D1]">{view.questionIndex === questions.length - 1 ? 'Ver resumen →' : 'Continuar →'}</button></div>
      </>}
    </main>
  );
}
