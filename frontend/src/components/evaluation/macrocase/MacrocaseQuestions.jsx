import { useEffect, useRef, useState } from 'react';
import { AUTOPLAY_BLOCKED, TalkingAvatarView } from '../../avatar/TalkingAvatarView.jsx';
import { QuestionProgress } from '../EvaluationPanels.jsx';
import { NO_SPANISH_VOICE } from '../../../services/speechSynthesis.js';
import { fromMicrosoftVisemes } from '../../../lib/talking-avatar/index.js';
import { formatClock, timeLimitOf } from './timeLimit.js';

// Short pause between the avatar appearing and its first words, so the
// question does not start abruptly.
const FIRST_QUESTION_DELAY_MS = 700;
// The countdown starts when the avatar finishes reading; if the audio never
// reports its end, it starts anyway after this long.
const MAX_READING_WAIT_MS = 45_000;
const TIMER_TICK_MS = 250;
const TIME_WARNING_SECONDS = 10;

/**
 * Question step: the avatar asks each question aloud and the candidate
 * answers in a text box. Forward-only, like Module A. Calls
 * `onComplete([{ questionId, text, timedOut? }])` after the last answer.
 *
 * With a time limit (macrocase `defaultTimeLimit`, seconds), the countdown
 * starts once the question has been read; when it runs out, whatever the
 * candidate wrote is saved (`timedOut: true`) and the next question starts.
 */
export function MacrocaseQuestions({ macrocase, onComplete }) {
  const questions = macrocase.questions;
  const maxCharacters = macrocase.maxCharacters > 0 ? macrocase.maxCharacters : undefined;
  const avatarRef = useRef(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [draft, setDraft] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const timeLimit = timeLimitOf(macrocase);
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const question = questions[questionIndex];
  const isLast = questionIndex === questions.length - 1;
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : timeLimit;
  const timeRunningOut = deadline !== null && remaining <= TIME_WARNING_SECONDS;

  const askQuestion = async () => {
    // Generated voices come with Azure viseme ids for exact lip-sync; uploaded
    // audio has none and the mouth follows the volume instead.
    const visemes = question.visemes?.length ? fromMicrosoftVisemes(question.visemes) : null;
    const result = await avatarRef.current?.speak({ text: question.text, audioUrl: question.audioUrl, visemes });
    if (result?.reason === NO_SPANISH_VOICE) setVoiceUnavailable(true);
    setAutoplayBlocked(result?.reason === AUTOPLAY_BLOCKED);
  };

  // Ask each question as soon as it appears, once the avatar is fully drawn
  // (the first one after a short pause), then start its countdown. The
  // candidate already clicked to get here, so the browser allows the audio.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await avatarRef.current?.whenReady();
      if (questionIndex === 0) await new Promise((resolve) => { setTimeout(resolve, FIRST_QUESTION_DELAY_MS); });
      if (cancelled) return;
      await Promise.race([
        askQuestion(),
        new Promise((resolve) => { setTimeout(resolve, MAX_READING_WAIT_MS); }),
      ]);
      if (!cancelled && timeLimit) {
        setNow(Date.now());
        setDeadline(Date.now() + timeLimit * 1000);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex]);

  useEffect(() => {
    if (!deadline) return undefined;
    const interval = setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(interval);
  }, [deadline]);

  // Time is up: keep what was written and move on.
  useEffect(() => {
    if (deadline && now >= deadline) continueForward({ timedOut: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline]);

  const continueForward = ({ timedOut = false } = {}) => {
    const text = draft.trim();
    if (!text && !timedOut) return;
    avatarRef.current?.stop();
    setDeadline(null);
    const answer = timedOut ? { questionId: question.id, text, timedOut: true } : { questionId: question.id, text };
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);
    if (isLast) {
      onComplete(nextAnswers);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setDraft('');
  };

  return (
    <main className='mx-auto max-w-5xl px-5 py-10 sm:py-14'>
      <QuestionProgress moduleLabel='Módulo B · Macrocaso' current={questionIndex + 1} total={questions.length} />

      <div className='grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
        <section className='self-start rounded-2xl border border-[#D9E2EA] bg-white p-4 shadow-sm lg:sticky lg:top-6'>
          <div className='mx-auto max-w-[200px] overflow-hidden rounded-xl sm:max-w-[320px] lg:max-w-none'>
            <TalkingAvatarView ref={avatarRef} label='Asistente virtual que lee la pregunta en voz alta' onSpeakingChange={setSpeaking} onReady={() => setAvatarReady(true)} />
          </div>
          <div className='mt-4 flex items-center justify-between gap-3 px-1'>
            <span className='flex items-center gap-2 text-xs font-medium text-[#64748B]' aria-live='polite'>
              <span className={`h-2 w-2 rounded-full ${speaking ? 'animate-pulse bg-[#18A9A4]' : 'bg-[#AEBCCA]'}`} />
              {!avatarReady ? 'Preparando al asistente…' : speaking ? 'El asistente está hablando…' : 'Asistente virtual'}
            </span>
            <button type='button' onClick={askQuestion} disabled={!avatarReady || speaking} className='shrink-0 whitespace-nowrap rounded-xl border border-[#D9E2EA] px-3 py-2 text-xs font-semibold text-[#475569] transition hover:bg-[#F6F9FC] disabled:cursor-not-allowed disabled:opacity-50'>↻ Escuchar de nuevo</button>
          </div>
          {autoplayBlocked && <p className='mt-3 rounded-xl border border-[#CDEBEA] bg-[#E8F7F6] p-3 text-xs leading-5 text-[#087D79]'>Tu navegador no permitió reproducir el audio automáticamente. Pulsa <strong>Escuchar de nuevo</strong> para oír la pregunta.</p>}
          {voiceUnavailable && <p className='mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800'>Tu navegador no tiene una voz en español para leer la pregunta. Léela en pantalla; puedes continuar con normalidad.</p>}
        </section>

        <div>
          <section className='rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-8'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <span className='inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]'>Pregunta {questionIndex + 1}</span>
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
              key={question.id}
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
            <div className='mt-2 flex justify-between text-xs text-[#8A98A9]'>
              <span>{draft.trim() ? '' : 'Escribe una respuesta para continuar'}</span>
              {maxCharacters && <span className={draft.length >= maxCharacters ? 'font-semibold text-amber-700' : ''}>{draft.length} / {maxCharacters}</span>}
            </div>
          </section>

          <div className='mt-6 flex justify-end'>
            <button type='button' onClick={() => continueForward()} disabled={!draft.trim()} className='rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F8F8B] disabled:cursor-not-allowed disabled:bg-[#BCC7D1]'>{isLast ? 'Finalizar macrocaso →' : 'Continuar →'}</button>
          </div>
        </div>
      </div>
      <p className='mt-8 text-center text-xs text-[#7C8AA0]'>Contenido demostrativo · Las respuestas no generan una puntuación</p>
    </main>
  );
}
