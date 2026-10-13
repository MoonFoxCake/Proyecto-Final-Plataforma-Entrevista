import { useEffect, useRef, useState } from 'react';
import { AvatarPanel, useAvatarSpeech } from './AvatarPanel.jsx';
import { MacrocaseProgress } from './MacrocaseProgress.jsx';
import { formatClock } from './timeLimit.js';

// Short pause between the avatar appearing and its first words.
const QUESTION_DELAY_MS = 700;
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
 * text box. The draft is saved as the candidate types, so a reload brings
 * it back. Answering locks it: there is no way back.
 *
 * With a time limit, the countdown starts on the server once the question
 * has been read (`onStartTimer`), so reloading does not reset it. When it
 * runs out, whatever was written is sent as `timedOut`.
 */
export function MacrocaseQuestion({ stage, isLast, busy, onAnswer, onSaveDraft, onStartTimer }) {
  const { question, progress } = stage;
  const maxCharacters = stage.macrocase.maxCharacters > 0 ? stage.macrocase.maxCharacters : undefined;
  const timeLimit = stage.timer?.limitSeconds || 0;
  const speech = useAvatarSpeech(question);
  const [draft, setDraft] = useState(stage.draft || '');
  const [draftStatus, setDraftStatus] = useState(null);
  const savedDraftRef = useRef(stage.draft || '');
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
    const text = draft.trim();
    if (!text && !timedOut) return;
    answeredRef.current = true;
    speech.stop();
    Promise.resolve(onAnswer({ questionId: question.id, text, timedOut })).then((ok) => {
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

  // Save the draft a moment after the candidate stops typing.
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
            <p className='mt-2 text-sm text-[#7C8AA0]'>Responde con tus propias palabras. Explica qué harías y por qué.</p>

            <label htmlFor='macrocase-answer' className='sr-only'>Tu respuesta</label>
            <textarea
              id='macrocase-answer'
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={maxCharacters}
              rows={8}
              placeholder='Escribe tu respuesta aquí…'
              className='mt-6 w-full resize-y rounded-xl border border-[#D9E2EA] p-4 text-sm leading-6 text-[#10233A] placeholder:text-[#9AA8B8] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20'
            />
            {timeLimit > 0 && (
              <div className='mt-3 h-1 overflow-hidden rounded-full bg-[#E5EBF0]' aria-hidden='true'>
                <div className={`h-full rounded-full transition-[width] duration-300 ease-linear ${timeRunningOut ? 'bg-amber-500' : 'bg-[#17AAA5]'}`} style={{ width: `${(remaining / timeLimit) * 100}%` }} />
              </div>
            )}
            <p className='sr-only' aria-live='assertive'>{timeRunningOut ? `Quedan ${TIME_WARNING_SECONDS} segundos o menos` : ''}</p>
            <div className='mt-2 flex justify-between gap-3 text-xs text-[#8A98A9]'>
              <span aria-live='polite' className={draftStatus === 'error' ? 'text-amber-700' : ''}>
                {draft.trim() ? (DRAFT_STATUS[draftStatus] || '') : 'Escribe una respuesta para continuar'}
              </span>
              {maxCharacters && <span className={draft.length >= maxCharacters ? 'font-semibold text-amber-700' : ''}>{draft.length} / {maxCharacters}</span>}
            </div>
          </section>

          <div className='mt-6 flex flex-col items-end gap-2'>
            <button type='button' onClick={() => answer(false)} disabled={!draft.trim() || busy} className='rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F8F8B] disabled:cursor-not-allowed disabled:bg-[#BCC7D1]'>
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
