import { useEffect, useRef, useState } from 'react';
import { preloadAvatar } from '../../avatar/TalkingAvatarView.jsx';
import { prepareSpeech } from '../../../services/speechSynthesis.js';
import { CompletedPanel } from '../EvaluationPanels.jsx';
import { MacrocaseIntro } from './MacrocaseIntro.jsx';
import { MacrocaseSection } from './MacrocaseSection.jsx';
import { MacrocaseQuestion } from './MacrocaseQuestion.jsx';
import { MacrocaseSummary } from './MacrocaseSummary.jsx';

const CLOSED_COPY = {
  INVALID: ['Este acceso no es válido.', 'Verifica que hayas abierto el enlace completo recibido en tu correo.'],
  EXPIRED: ['Este acceso ha expirado.', 'Tus respuestas guardadas se conservan. Solicita a la empresa un nuevo acceso para continuar.'],
  CANCELLED: ['Este acceso ya no está disponible.', 'Si recibiste un enlace nuevo, ábrelo para continuar donde te quedaste.'],
  NOT_YET_AVAILABLE: ['La evaluación aún no está disponible.', 'Vuelve a intentarlo a la hora indicada.'],
  ERROR: ['No pudimos cargar la evaluación.', 'Comprueba tu conexión y recarga la página: continuarás donde te quedaste.'],
};

const errorMessage = (error, fallback) => error?.response?.data?.error?.message || error?.message || fallback;

function ClosedPanel({ state }) {
  const [title, description] = CLOSED_COPY[state] || CLOSED_COPY.INVALID;
  return (
    <main className='mx-auto max-w-lg px-5 py-24'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-9 text-center shadow-sm'>
        <h1 className='font-display text-2xl font-bold text-[#10233A]'>{title}</h1>
        <p className='mt-3 text-sm leading-6 text-[#56677B]'>{description}</p>
      </section>
    </main>
  );
}

/**
 * Module B · Macrocase, one stage at a time: intro → for each section, its
 * narrative and then its questions → summary → final submission.
 *
 * `source` (see `macrocaseSources.js`) says which stage the candidate is on
 * and applies each action; for a real invitation that is the backend, which
 * stores the progress, so a reload resumes the same stage and answers can
 * never be changed after moving on.
 */
export function MacrocaseEvaluation({ source, completedFootnote }) {
  const [stage, setStage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submittedAt, setSubmittedAt] = useState(null);
  const busyRef = useRef(false);
  const stepKeyRef = useRef('');

  // Download the avatar illustration and find the voice ahead of time.
  useEffect(() => {
    preloadAvatar();
    prepareSpeech();
  }, []);

  useEffect(() => {
    let active = true;
    source.getStage()
      .then((next) => active && setStage(next))
      .catch(() => active && setStage({ state: 'ERROR' }));
    return () => { active = false; };
  }, [source]);

  // New stage on screen: start reading from the top.
  const stepKey = stage ? `${stage.step}:${stage.section?.id ?? ''}:${stage.question?.id ?? ''}` : '';
  useEffect(() => {
    if (stepKeyRef.current && stepKey !== stepKeyRef.current) window.scrollTo?.({ top: 0 });
    stepKeyRef.current = stepKey;
  }, [stepKey]);

  /** Runs one step-changing action; resolves false if it failed (the stage stays). */
  const run = async (action) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      setStage(await source.advance(action));
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo guardar tu avance. Revisa tu conexión e intenta nuevamente.'));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Background actions (draft, countdown start): they do not change the stage on screen. */
  const background = async (action) => {
    const next = await source.advance(action);
    if (next?.state && next.state !== 'VALID') setStage(next);
    return next;
  };

  const finalize = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await source.finalize();
      if (result?.state === 'COMPLETED') setSubmittedAt(result.submittedAt || new Date().toISOString());
      else setStage(result?.state ? result : { state: 'ERROR' });
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo enviar la evaluación. Intenta nuevamente.'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (submittedAt) return <CompletedPanel submittedAt={submittedAt} {...(completedFootnote ? { footnote: completedFootnote } : {})} />;
  if (!stage) return <div className='flex min-h-[60vh] items-center justify-center text-sm text-[#64748B]'>Cargando evaluación...</div>;
  if (stage.state === 'COMPLETED') return <CompletedPanel submittedAt={stage.submittedAt} {...(completedFootnote ? { footnote: completedFootnote } : {})} />;
  if (stage.state !== 'VALID') return <ClosedPanel state={stage.state} />;

  const errorBanner = error && stage.step !== 'review' && (
    <div className='mx-auto max-w-5xl px-5 pt-6'>
      <p role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>
    </div>
  );

  if (stage.step === 'intro') {
    return <>{errorBanner}<MacrocaseIntro macrocase={stage.macrocase} busy={busy} onStart={() => run({ type: 'START' })} /></>;
  }
  if (stage.step === 'narrative') {
    return (
      <>
        {errorBanner}
        <MacrocaseSection
          key={stage.section.id}
          section={stage.section}
          progress={stage.progress}
          busy={busy}
          onContinue={() => run({ type: 'FINISH_NARRATIVE', sectionId: stage.section.id })}
        />
      </>
    );
  }
  if (stage.step === 'question') {
    const { progress } = stage;
    const isLast = progress.sectionIndex === progress.totalSections - 1 && progress.questionIndex === progress.sectionQuestions - 1;
    return (
      <>
        {errorBanner}
        <MacrocaseQuestion
          key={stage.question.id}
          stage={stage}
          isLast={isLast}
          busy={busy}
          onAnswer={({ questionId, text, timedOut }) => run({ type: 'ANSWER', questionId, text, ...(timedOut ? { timedOut: true } : {}) })}
          onSaveDraft={(questionId, text) => background({ type: 'SAVE_DRAFT', questionId, text })}
          onStartTimer={(questionId) => background({ type: 'START_TIMER', questionId })}
        />
      </>
    );
  }
  return <MacrocaseSummary stage={stage} submitting={busy} error={error} onSubmit={finalize} />;
}
