import { useEffect, useRef, useState } from 'react';
import { AvatarPanel, useAvatarSpeech } from './AvatarPanel.jsx';
import { MacrocaseProgress } from './MacrocaseProgress.jsx';
import { formatClock } from './timeLimit.js';

// Short pause between the avatar appearing and its first words.
const QUESTION_DELAY_MS = 700;
const LIKERT_OPTIONS = ['Totalmente en desacuerdo', 'En desacuerdo', 'Neutral', 'De acuerdo', 'Totalmente de acuerdo'];
const isSelection = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
// The countdown starts when the avatar finishes reading; if the audio never
// reports its end, it starts anyway after this long.
const MAX_READING_WAIT_MS = 45_000;
const TIMER_TICK_MS = 250;
const TIME_WARNING_SECONDS = 10;
const DRAFT_SAVE_DELAY_MS = 1000;
const RETRY_DELAY_MS = 3000;

const DRAFT_STATUS = {
  saving: 'Guardando borrador…',
  saved: 'Borrador guardado',
  error: 'No se pudo guardar el borrador. Tu respuesta se enviará al continuar.',
};

/** Local deadline from the server's countdown start, immune to clock differences. */
function deadlineFrom(stage) {
  const { limitSeconds, startedAt } = stage.timer || {};
  if (!limitSeconds || !startedAt) return null;
  const elapsed = new Date(stage.serverNow).getTime() - new Date(startedAt).getTime();
  return Date.now() + limitSeconds * 1000 - Math.max(0, elapsed);
}

/**
 * One question: the avatar asks it aloud and the candidate answers in a
 * five-option Likert scale. The selection is saved, so a reload brings
 * it back. Answering locks it: there is no way back.
 *
 * With a time limit, the countdown starts on the server once the question
 * has been read (`onStartTimer`), so reloading does not reset it. When it
 * runs out, the current selection is sent as `timedOut`.
 */
export function MacrocaseQuestion({ stage, isLast, busy, onAnswer, onSaveDraft, onStartTimer }) {
  const { question, progress } = stage;
  const timeLimit = stage.timer?.limitSeconds || 0;
  const speech = useAvatarSpeech(question);
  const [draft, setDraft] = useState(isSelection(stage.draft) ? stage.draft : null);
  const [draftStatus, setDraftStatus] = useState(null);
  const savedDraftRef = useRef(isSelection(stage.draft) ? stage.draft : null);
  const [deadline, setDeadline] = useState(() => deadlineFrom(stage));
  const [now, setNow] = useState(() => Date.now());
  const answeredRef = useRef(false);
  const retryAtRef = useRef(0);
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : timeLimit;
  const timeRunningOut = deadline !== null && remaining <= TIME_WARNING_SECONDS;

  // Ask the question once the avatar is drawn, then start its countdown.
  // When resuming a question whose countdown already runs, it is not read
  // again automatically ("Escuchar de nuevo" is still there).
  useEffect(() => {
    if (deadline) return undefined;
    let cancelled = false;
    (async () => {
      await speech.whenReady();
      await new Promise((resolve) => { setTimeout(resolve, QUESTION_DELAY_MS); });
      if (cancelled) return;
      await Promise.race([speech.speak(), new Promise((resolve) => { setTimeout(resolve, MAX_READING_WAIT_MS); })]);
      if (cancelled || !timeLimit) return;
      const fallback = Date.now() + timeLimit * 1000;
      try {
        const started = await onStartTimer(question.id);
        if (!cancelled) setDeadline(deadlineFrom(started) ?? fallback);
      } catch {
        if (!cancelled) setDeadline(fallback);
      }
      if (!cancelled) setNow(Date.now());
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!deadline) return undefined;
    const interval = setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(interval);
  }, [deadline]);

  const answer = (timedOut) => {
    if (answeredRef.current || Date.now() < retryAtRef.current) return;
    if (!isSelection(draft) && !timedOut) return;
    answeredRef.current = true;
    speech.stop();
    Promise.resolve(onAnswer({ questionId: question.id, value: draft, timedOut })).then((ok) => {
      // Still on this question (e.g. the request failed): allow another try,
      // not on every countdown tick.
      if (ok === false) {
        answeredRef.current = false;
        retryAtRef.current = Date.now() + RETRY_DELAY_MS;
      }
    });
  };

  // Time is up: send what was written and move on.
  useEffect(() => {
    if (deadline && now >= deadline) answer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline]);

  // Save the draft a moment after the candidate changes their selection.
  useEffect(() => {
    if (draft === savedDraftRef.current) return undefined;
    const timeout = setTimeout(async () => {
      setDraftStatus('saving');
      try {
        await onSaveDraft(question.id, draft);
        savedDraftRef.current = draft;
        setDraftStatus('saved');
      } catch {
        setDraftStatus('error');
      }
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <main className='mx-auto max-w-5xl px-5 py-10 sm:py-14'>
      <MacrocaseProgress step='question' progress={progress} />

      <div className='grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
        <AvatarPanel speech={speech} label='Asistente virtual que lee la pregunta en voz alta' what='la pregunta' />

        <div>
          <section className='rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-8'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <span className='inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]'>
                {stage.section?.title ? `${stage.section.title} · ` : ''}Pregunta {question.order}
              </span>
              {timeLimit > 0 && (
                <span
                  role='timer'
                  aria-label={deadline ? `Tiempo restante: ${remaining} segundos` : 'El tiempo empieza cuando el asistente termine de leer la pregunta'}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${!deadline ? 'bg-[#F1F5F9] text-[#64748B]' : timeRunningOut ? 'bg-amber-50 text-amber-700' : 'bg-[#E8F7F6] text-[#087D79]'}`}
                >
                  ⏱ {formatClock(remaining)}{!deadline && <span className='font-normal'>· al terminar la pregunta</span>}
                </span>
              )}
            </div>
            <h1 className='mt-5 text-lg font-semibold leading-8 text-[#10233A]'>{question.text}</h1>
            <p className='mt-2 text-sm text-[#7C8AA0]'>Selecciona qué tan de acuerdo estás con esta afirmación. Elige una sola opción.</p>

            <fieldset disabled={busy} role='radiogroup' aria-label='Escala Likert de cinco opciones' className='mt-9'>
              <legend className='sr-only'>Selecciona una opción del 1 al 5</legend>
              <div className='relative mx-3 h-11'>
                <div className='absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#DDE5EC]' />
                <div className='absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#18A9A4] transition-all' style={{ width: draft === null ? '0%' : `${(draft - 1) * 25}%` }} />
                {LIKERT_OPTIONS.map((label, index) => {
                  const value = index + 1;
                  const selected = draft === value;
                  const passed = draft !== null && value <= draft;
                  return <label key={value} className='absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center' style={{ left: `${index * 25}%` }}>
                    <input type='radio' name={`macrocase-${question.id}`} value={value} aria-label={label} checked={selected} onChange={() => setDraft(value)}
                      className={`h-7 w-7 cursor-pointer appearance-none rounded-full border-4 border-white shadow transition focus:outline-none focus:ring-2 focus:ring-[#18A9A4] focus:ring-offset-2 disabled:cursor-not-allowed ${passed ? 'bg-[#18A9A4]' : 'bg-[#AEBCCA]'} ${selected ? 'scale-125' : 'hover:scale-110'}`} />
                  </label>;
                })}
              </div>
              <div aria-hidden='true' className='relative mx-3 mt-2 h-4 text-xs font-semibold text-[#7C8AA0]'>
                {LIKERT_OPTIONS.map((label, index) => <span key={label} className={`absolute -translate-x-1/2 ${draft === index + 1 ? 'text-[#0A8F8A]' : ''}`} style={{ left: `${index * 25}%` }}>{index + 1}</span>)}
              </div>
              <div aria-hidden='true' className='mt-3 flex justify-between gap-4 text-xs text-[#8A98A9]'><span>Muy en desacuerdo</span><span className='text-right'>Muy de acuerdo</span></div>
              <p className='mt-6 min-h-6 text-center text-sm font-semibold text-[#0A8F8A]' aria-live='polite'>{draft === null ? 'Selecciona una opción para continuar' : LIKERT_OPTIONS[draft - 1]}</p>
            </fieldset>
            {timeLimit > 0 && (
              <div className='mt-3 h-1 overflow-hidden rounded-full bg-[#E5EBF0]' aria-hidden='true'>
                <div className={`h-full rounded-full transition-[width] duration-300 ease-linear ${timeRunningOut ? 'bg-amber-500' : 'bg-[#17AAA5]'}`} style={{ width: `${(remaining / timeLimit) * 100}%` }} />
              </div>
            )}
            <p className='sr-only' aria-live='assertive'>{timeRunningOut ? `Quedan ${TIME_WARNING_SECONDS} segundos o menos` : ''}</p>
            <div className='mt-2 flex justify-between gap-3 text-xs text-[#8A98A9]'>
              <span aria-live='polite' className={draftStatus === 'error' ? 'text-amber-700' : ''}>
                {isSelection(draft) ? (DRAFT_STATUS[draftStatus] || 'Selección lista para continuar') : 'Selecciona una opción para continuar'}
              </span>
            </div>
          </section>

          <div className='mt-6 flex flex-col items-end gap-2'>
            <button type='button' onClick={() => answer(false)} disabled={!isSelection(draft) || busy} className='rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F8F8B] disabled:cursor-not-allowed disabled:bg-[#BCC7D1]'>
              {isLast ? 'Ir al resumen →' : 'Continuar →'}
            </button>
            <p className='text-xs text-[#7C8AA0]'>Al continuar, tu respuesta queda registrada y no podrás modificarla.</p>
          </div>
        </div>
      </div>
      <p className='mt-8 text-center text-xs text-[#7C8AA0]'>Las respuestas no generan una puntuación automática</p>
    </main>
  );
}
